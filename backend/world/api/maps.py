import os
from typing import Optional

from ninja import Router, Schema, File, Form
from ninja.files import UploadedFile
from django.core.files.base import ContentFile
from django.shortcuts import get_object_or_404
from django.db import transaction

from world.models import Map, Hex, PointOfInterest, Faction, GalleryImage
from world.models.party import Party

from .common import api, publish

router = Router()


def _clone_file_field(source_field, target_field):
    """Give `target_field` its own copy of `source_field`'s file so a clone doesn't share the
    source's file on disk (H5): deleting one clone's image would otherwise destroy the other's.
    If the underlying file is missing from storage (e.g. a name-only reference), fall back to
    sharing the reference so duplication still succeeds."""
    if not source_field:
        return
    name = source_field.name
    if source_field.storage.exists(name):
        source_field.open('rb')
        try:
            data = source_field.read()
        finally:
            source_field.close()
        target_field.save(os.path.basename(name), ContentFile(data), save=False)
    else:
        target_field.name = name


class MapSchema(Schema):
    id: int
    name: str
    image: str
    hex_size: int
    origin_x: int
    origin_y: int
    fog_of_war: bool
    map_type: str
    sub_tick: int
    weather: str
    player_actions_locked: bool
    reveal_mode: str
    # Optional — Ninja's FieldFile encoder returns None for an empty ImageField, so this
    # MUST be Optional[str] or serializing a map without a detail image would 500.
    detail_image: Optional[str] = None


class MapLockSchema(Schema):
    locked: bool


@router.get("/maps/", response=list[MapSchema])
def list_maps(request):
    return list(Map.objects.all())


@router.get("/maps/{map_id}/", response=MapSchema)
def get_map(request, map_id: int):
    return get_object_or_404(Map, id=map_id)


@router.patch("/maps/{map_id}/locked/", response=MapSchema)
def set_map_locked(request, map_id: int, body: MapLockSchema):
    map_obj = get_object_or_404(Map, id=map_id)
    map_obj.player_actions_locked = body.locked
    map_obj.save(update_fields=['player_actions_locked'])
    publish(map_id, {"type": "map_update"})
    return map_obj


class MapWeatherSchema(Schema):
    weather: str


@router.patch("/maps/{map_id}/weather/", response=MapSchema)
def set_map_weather(request, map_id: int, body: MapWeatherSchema):
    map_obj = get_object_or_404(Map, id=map_id)
    map_obj.weather = body.weather
    map_obj.save(update_fields=['weather'])
    publish(map_id, {"type": "weather_update", "weather": body.weather})
    return map_obj


class HexHighlightSchema(Schema):
    hex_id: Optional[int]


@router.post("/maps/{map_id}/highlight/", response={200: dict})
def set_hex_highlight(request, map_id: int, body: HexHighlightSchema):
    get_object_or_404(Map, id=map_id)
    publish(map_id, {"type": "hex_highlight", "hex_id": body.hex_id})
    return {"hex_id": body.hex_id}


@router.post("/maps/", response=MapSchema)
def create_map(
    request,
    name: Form[str],
    hex_size: Form[int],
    origin_x: Form[int],
    origin_y: Form[int],
    image: File[Optional[UploadedFile]] = None,
    image_path: Form[Optional[str]] = None,
    reveal_mode: Form[str] = 'grey_fog',
    detail_image: File[Optional[UploadedFile]] = None,
    detail_image_path: Form[Optional[str]] = None,
):
    from PIL import Image as PILImage
    import math

    if image:
        pil = PILImage.open(image)
        img_w, img_h = pil.size
        image.seek(0)
        image_value = image
    elif image_path:
        from django.conf import settings
        import os
        abs_path = os.path.join(settings.MEDIA_ROOT, image_path)
        pil = PILImage.open(abs_path)
        img_w, img_h = pil.size
        image_value = image_path
    else:
        return api.create_response(request, {'detail': 'image or image_path required'}, status=400)

    sqrt3 = math.sqrt(3)
    cols = max(1, math.floor(img_w / (hex_size * 1.5)))
    rows = max(1, math.floor(img_h / (hex_size * sqrt3)))

    # Detail image (two-layer mode) — optional; mirrors the image / image_path dual pattern.
    detail_value = detail_image or detail_image_path or None

    with transaction.atomic():
        m = Map(name=name, hex_size=hex_size, origin_x=origin_x, origin_y=origin_y,
                reveal_mode=reveal_mode)
        m.image = image_value
        if detail_value:
            m.detail_image = detail_value
        m.save()
        Hex.objects.bulk_create([
            Hex(map=m, row=r, col=c)
            for r in range(rows)
            for c in range(cols)
        ])
    return m


@router.post("/maps/{map_id}/duplicate/", response=MapSchema)
def duplicate_map(
    request,
    map_id: int,
    name: Form[str],
    # Optional overrides — omit to clone the source's mode/images unchanged.
    # Supplying an uploaded image replaces that layer (and sidesteps the shared-file
    # reference the plain clone otherwise keeps). Chiefly used to copy a grey-fog map
    # into a two-layer map, swapping in a base + detail image while preserving everything else.
    reveal_mode: Form[Optional[str]] = None,
    image: File[Optional[UploadedFile]] = None,
    detail_image: File[Optional[UploadedFile]] = None,
):
    source = get_object_or_404(Map, id=map_id)

    with transaction.atomic():
        # --- New Map ---
        new_map = Map(
            name=name,
            hex_size=source.hex_size,
            origin_x=source.origin_x,
            origin_y=source.origin_y,
            fog_of_war=source.fog_of_war,
            map_type=source.map_type,
            reveal_mode=reveal_mode or source.reveal_mode,
            sub_tick=0,
            player_actions_locked=False,
            current_tick=None,
        )
        # Give the clone its own copy of each image file. An uploaded override is already a
        # fresh file; otherwise copy the source's file rather than share the same path (H5).
        if image:
            new_map.image = image
        else:
            _clone_file_field(source.image, new_map.image)
        if detail_image:
            new_map.detail_image = detail_image
        else:
            _clone_file_field(source.detail_image, new_map.detail_image)
        new_map.save()

        # --- Gallery Images ---
        gallery_map: dict[int, int] = {}  # old_id -> new_id
        for gi in source.gallery_images.all():
            new_gi = GalleryImage(
                map=new_map,
                name=gi.name,
                is_published=False,
            )
            _clone_file_field(gi.image, new_gi.image)
            new_gi.save()
            gallery_map[gi.id] = new_gi.id

        # --- Hexes ---
        hex_map: dict[int, int] = {}  # old_id -> new_id
        old_hexes = list(source.hexes.all())
        for h in old_hexes:
            new_h = Hex(
                map=new_map,
                row=h.row,
                col=h.col,
                terrain_type=h.terrain_type,
                resources=h.resources,
                encounter_likelihood=h.encounter_likelihood,
                player_explored=h.player_explored,
                player_visible=h.player_visible,
                has_roads=h.has_roads,
                has_rivers=h.has_rivers,
                can_enter=h.can_enter,
                linked_map=h.linked_map,
            )
            new_h.save()
            hex_map[h.id] = new_h.id

        # --- POIs (faction FK deferred) ---
        poi_map: dict[int, int] = {}  # old_id -> new_id
        old_pois = list(PointOfInterest.objects.filter(hex__map=source).select_related('hex'))
        for poi in old_pois:
            new_poi = PointOfInterest(
                hex_id=hex_map[poi.hex_id],
                poi_type=poi.poi_type,
                name=poi.name,
                difficulty=poi.difficulty,
                title=poi.title,
                description=poi.description,
                notes=poi.notes,
                technology_max_modifier=poi.technology_max_modifier,
                faction=None,  # filled after factions cloned
                monster_type=poi.monster_type,
                age=poi.age,
                player_visible=poi.player_visible,
                player_explored=poi.player_explored,
                hidden=poi.hidden,
            )
            new_poi.save()
            poi_map[poi.id] = new_poi.id

        # --- Factions ---
        faction_map: dict[int, int] = {}  # old_id -> new_id
        old_factions = list(
            Faction.objects.filter(map=source)
            .prefetch_related('allowed_hexes')
        )
        for f in old_factions:
            new_f = Faction(
                map=new_map,
                name=f.name,
                leader=f.leader,
                color=f.color,
                is_mobile=f.is_mobile,
                speed=f.speed,
                max_speed=f.max_speed,
                population=f.population,
                notes=f.notes,
                current_action=f.current_action,
                next_action=f.next_action,
                last_action=f.last_action,
                is_dead=f.is_dead,
                movement_restricted=f.movement_restricted,
                image_id=gallery_map.get(f.image_id) if f.image_id else None,
                current_hex_id=hex_map.get(f.current_hex_id) if f.current_hex_id else None,
                destination_id=hex_map.get(f.destination_id) if f.destination_id else None,
            )
            new_f.save()
            faction_map[f.id] = new_f.id

            allowed_ids = [hex_map[h.id] for h in f.allowed_hexes.all() if h.id in hex_map]
            if allowed_ids:
                new_f.allowed_hexes.set(allowed_ids)

        # --- Back-fill POI faction FKs ---
        for poi in old_pois:
            if poi.faction_id and poi.faction_id in faction_map:
                PointOfInterest.objects.filter(id=poi_map[poi.id]).update(faction_id=faction_map[poi.faction_id])

        # --- Party ---
        try:
            p = source.party
        except Party.DoesNotExist:
            p = None
        if p is not None:
            Party.objects.create(
                name=p.name,
                map=new_map,
                player_count=p.player_count,
                speed=p.speed,
                max_speed=p.max_speed,
                resource_generation=p.resource_generation,
                supplies=p.supplies,
                current_hex_id=hex_map.get(p.current_hex_id) if p.current_hex_id else None,
                tracks_supplies=p.tracks_supplies,
                current_action=p.current_action,
                last_action=p.last_action,
            )

    return new_map
