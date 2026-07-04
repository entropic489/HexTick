import json
from typing import Optional
import redis
from django.conf import settings as django_settings
from django.http import StreamingHttpResponse
from ninja import NinjaAPI, Schema, File, Form
from ninja.files import UploadedFile
from django.shortcuts import get_object_or_404
from django.db import transaction
from world.models import Map, MapType, Hex, PointOfInterest, Faction, Tick, FactionTick, PartyTick, GalleryImage
from world.models.characters import Knowledge
from world.models.party import Party
from world.models.faction import Action
from world.actions import tick_hex, tick_faction, tick_party, reveal_hex_on_move, reveal_pois_on_search, party_move_rolls, party_wilderness_roll
from world.utils import hex_distance, modifier, adjacent_hexes, night_bonus, move_difficulty

api = NinjaAPI(urls_namespace="api")

_redis = redis.Redis.from_url(django_settings.REDIS_URL, decode_responses=True)


def _sse_channel(map_id: int) -> str:
    return f"tick:{map_id}"


def broadcast_tick(map_id: int, tick_number: int) -> None:
    _redis.publish(_sse_channel(map_id), json.dumps({"tick_number": tick_number}))


def tick_stream(request, map_id: int):
    def event_stream():
        pubsub = _redis.pubsub()
        pubsub.subscribe(_sse_channel(map_id))
        try:
            yield "retry: 3000\n\n"
            for message in pubsub.listen():
                if message["type"] == "message":
                    yield f"data: {message['data']}\n\n"
                else:
                    yield ": keepalive\n\n"
        finally:
            pubsub.unsubscribe()
            pubsub.close()

    response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


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


class MapLockSchema(Schema):
    locked: bool


@api.get("/maps/", response=list[MapSchema])
def list_maps(request):
    return list(Map.objects.all())


@api.get("/maps/{map_id}/", response=MapSchema)
def get_map(request, map_id: int):
    return get_object_or_404(Map, id=map_id)


@api.patch("/maps/{map_id}/locked/", response=MapSchema)
def set_map_locked(request, map_id: int, body: MapLockSchema):
    map_obj = get_object_or_404(Map, id=map_id)
    map_obj.player_actions_locked = body.locked
    map_obj.save(update_fields=['player_actions_locked'])
    _redis.publish(_sse_channel(map_id), json.dumps({"type": "map_update"}))
    return map_obj


class MapWeatherSchema(Schema):
    weather: str


@api.patch("/maps/{map_id}/weather/", response=MapSchema)
def set_map_weather(request, map_id: int, body: MapWeatherSchema):
    map_obj = get_object_or_404(Map, id=map_id)
    map_obj.weather = body.weather
    map_obj.save(update_fields=['weather'])
    _redis.publish(_sse_channel(map_id), json.dumps({"type": "weather_update", "weather": body.weather}))
    return map_obj


class HexHighlightSchema(Schema):
    hex_id: Optional[int]


@api.post("/maps/{map_id}/highlight/", response={200: dict})
def set_hex_highlight(request, map_id: int, body: HexHighlightSchema):
    get_object_or_404(Map, id=map_id)
    _redis.publish(_sse_channel(map_id), json.dumps({"type": "hex_highlight", "hex_id": body.hex_id}))
    return {"hex_id": body.hex_id}


@api.post("/maps/", response=MapSchema)
def create_map(
    request,
    name: Form[str],
    hex_size: Form[int],
    origin_x: Form[int],
    origin_y: Form[int],
    image: File[Optional[UploadedFile]] = None,
    image_path: Form[Optional[str]] = None,
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

    with transaction.atomic():
        m = Map(name=name, hex_size=hex_size, origin_x=origin_x, origin_y=origin_y)
        m.image = image_value
        m.save()
        Hex.objects.bulk_create([
            Hex(map=m, row=r, col=c)
            for r in range(rows)
            for c in range(cols)
        ])
    return m


class DuplicateMapSchema(Schema):
    name: str


@api.post("/maps/{map_id}/duplicate/", response=MapSchema)
def duplicate_map(request, map_id: int, body: DuplicateMapSchema):
    from world.models.faction import ActiveDisease

    source = get_object_or_404(Map, id=map_id)

    with transaction.atomic():
        # --- New Map ---
        new_map = Map(
            name=body.name,
            image=source.image,
            hex_size=source.hex_size,
            origin_x=source.origin_x,
            origin_y=source.origin_y,
            fog_of_war=source.fog_of_war,
            map_type=source.map_type,
            sub_tick=0,
            player_actions_locked=False,
            current_tick=None,
        )
        new_map.save()

        # --- Knowledge ---
        knowledge_map: dict[int, int] = {}  # old_id -> new_id
        old_knowledge = list(source.knowledge.prefetch_related('related_knowledge').all())
        for k in old_knowledge:
            new_k = Knowledge(
                map=new_map,
                title=k.title,
                description=k.description,
                do_players_know=k.do_players_know,
                age=k.age,
            )
            new_k.save()
            knowledge_map[k.id] = new_k.id
        # Wire related_knowledge M2M after all knowledge cloned
        new_knowledge_by_old = {k.id: Knowledge.objects.get(id=knowledge_map[k.id]) for k in old_knowledge}
        for k in old_knowledge:
            new_k = new_knowledge_by_old[k.id]
            related_ids = [knowledge_map[r.id] for r in k.related_knowledge.all() if r.id in knowledge_map]
            if related_ids:
                new_k.related_knowledge.set(related_ids)

        # --- Gallery Images ---
        gallery_map: dict[int, int] = {}  # old_id -> new_id
        for gi in source.gallery_images.all():
            new_gi = GalleryImage(
                map=new_map,
                name=gi.name,
                image=gi.image,
                is_published=False,
            )
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
        poi_map: dict[int, int] = {}  # old_id -> new_id (needed for POI knowledge M2M)
        old_pois = list(PointOfInterest.objects.filter(hex__map=source).prefetch_related('knowledge').select_related('hex'))
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
            k_ids = [knowledge_map[k.id] for k in poi.knowledge.all() if k.id in knowledge_map]
            if k_ids:
                new_poi.knowledge.set(k_ids)

        # --- Factions ---
        faction_map: dict[int, int] = {}  # old_id -> new_id
        old_factions = list(
            Faction.objects.filter(current_hex__map=source)
            .prefetch_related('knowledge', 'allowed_hexes', 'diseases')
        )
        for f in old_factions:
            new_f = Faction(
                name=f.name,
                leader=f.leader,
                color=f.color,
                is_mobile=f.is_mobile,
                is_gm_faction=f.is_gm_faction,
                speed=f.speed,
                population=f.population,
                technology=f.technology,
                technology_max=f.technology_max,
                resources=f.resources,
                agreeableness=f.agreeableness,
                combat_skill=f.combat_skill,
                scouting=f.scouting,
                theology=f.theology,
                notes=f.notes,
                current_action=f.current_action,
                next_action=f.next_action,
                last_action=f.last_action,
                population_trend_override=f.population_trend_override,
                is_dead=f.is_dead,
                famine_streak=f.famine_streak,
                movement_restricted=f.movement_restricted,
                image_id=gallery_map.get(f.image_id) if f.image_id else None,
                current_hex_id=hex_map.get(f.current_hex_id) if f.current_hex_id else None,
                destination_id=hex_map.get(f.destination_id) if f.destination_id else None,
            )
            new_f.save()
            faction_map[f.id] = new_f.id

            k_ids = [knowledge_map[k.id] for k in f.knowledge.all() if k.id in knowledge_map]
            if k_ids:
                new_f.knowledge.set(k_ids)

            allowed_ids = [hex_map[h.id] for h in f.allowed_hexes.all() if h.id in hex_map]
            if allowed_ids:
                new_f.allowed_hexes.set(allowed_ids)

            for disease in f.diseases.all():
                ActiveDisease.objects.create(
                    faction=new_f,
                    disease_type=disease.disease_type,
                    duration_days_remaining=disease.duration_days_remaining,
                    effect_value=disease.effect_value,
                )

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
                destination_id=hex_map.get(p.destination_id) if p.destination_id else None,
                tracks_supplies=p.tracks_supplies,
                current_action=p.current_action,
                last_action=p.last_action,
            )

    return new_map


class POISchema(Schema):
    id: int
    poi_type: str
    name: str
    difficulty: int
    title: str
    description: str
    notes: str
    hidden: bool
    player_visible: bool
    player_explored: bool


class HexSchema(Schema):
    id: int
    map_id: int
    row: int
    col: int
    terrain_type: str
    terrain_difficulty: int
    resource_generation: int
    resources: int
    encounter_likelihood: int
    player_explored: bool
    player_visible: bool
    has_roads: bool
    has_rivers: bool
    can_enter: bool
    linked_map: Optional[int] = None

    @staticmethod
    def resolve_linked_map(obj):
        return obj.linked_map_id

    pois: list[POISchema]

    @staticmethod
    def resolve_pois(obj):
        return list(obj.pois.all())


class HexPatchSchema(Schema):
    terrain_type: Optional[str] = None
    resources: Optional[int] = None
    encounter_likelihood: Optional[int] = None
    player_explored: Optional[bool] = None
    player_visible: Optional[bool] = None
    has_roads: Optional[bool] = None
    has_rivers: Optional[bool] = None
    can_enter: Optional[bool] = None
    linked_map_id: Optional[int] = None


class BulkHexPatchBody(Schema):
    ids: list[int]
    terrain_type: Optional[str] = None
    has_roads: Optional[bool] = None
    has_rivers: Optional[bool] = None
    player_visible: Optional[bool] = None
    player_explored: Optional[bool] = None


class BulkHexPatchResult(Schema):
    updated: int


@api.post("/hexes/bulk-patch/", response=BulkHexPatchResult)
@transaction.atomic
def bulk_patch_hexes(request, body: BulkHexPatchBody):
    updates = body.dict(exclude_unset=True, exclude={"ids"})
    if not updates or not body.ids:
        return {"updated": 0}
    count = Hex.objects.filter(id__in=body.ids).update(**updates)
    return {"updated": count}


@api.patch("/hexes/{hex_id}/", response=HexSchema)
@transaction.atomic
def patch_hex(request, hex_id: int, body: HexPatchSchema):
    hex_obj = get_object_or_404(Hex, id=hex_id)
    for field, value in body.dict(exclude_unset=True).items():
        setattr(hex_obj, field, value)
    hex_obj.save()
    hex_obj.pois.all()  # prefetch for resolver
    return hex_obj


class POICreateSchema(Schema):
    poi_type: str
    name: str = ''
    difficulty: int = 0
    title: str = ''
    description: str = ''
    notes: str = ''
    technology_max_modifier: int = 1
    monster_type: str = ''
    age: int = 4
    player_visible: bool = False
    player_explored: bool = False
    hidden: bool = False


@api.post("/hexes/{hex_id}/pois/", response=POISchema)
@transaction.atomic
def create_poi(request, hex_id: int, body: POICreateSchema):
    hex_obj = get_object_or_404(Hex, id=hex_id)
    poi = PointOfInterest.objects.create(hex=hex_obj, **body.dict())
    return poi


@api.get("/maps/{map_id}/hexes/", response=list[HexSchema])
def list_hexes(request, map_id: int):
    get_object_or_404(Map, id=map_id)
    return list(
        Hex.objects.filter(map_id=map_id).prefetch_related('pois')
    )


class FactionSchema(Schema):
    id: int
    name: str
    color: str
    speed: int
    population: int
    technology: int
    resources: int
    combat_skill: int
    current_action: Optional[str]
    last_action: Optional[str]
    current_hex: Optional[int]
    destination: Optional[int]
    is_mobile: bool
    is_gm_faction: bool
    is_dead: bool
    is_famine: bool
    is_dying: bool
    max_speed: int
    agreeableness: int
    theology: int
    technology_max: int
    next_action: Optional[str] = None
    notes: str = ''
    knowledge: list[int] = []
    leader: str = ''
    image: Optional[int] = None
    movement_restricted: bool = False
    allowed_hexes: list[int] = []

    @staticmethod
    def resolve_current_hex(obj):
        return obj.current_hex_id

    @staticmethod
    def resolve_destination(obj):
        return obj.destination_id

    @staticmethod
    def resolve_knowledge(obj):
        return [k.id for k in obj.knowledge.all()]

    @staticmethod
    def resolve_image(obj):
        return obj.image_id

    @staticmethod
    def resolve_allowed_hexes(obj):
        return [h.id for h in obj.allowed_hexes.all()]


class FactionCreateSchema(Schema):
    name: str
    color: str = '#89b4fa'
    speed: int = 3
    population: int = 10
    technology: int = 5
    resources: int = 10
    combat_skill: int = 5
    current_hex: Optional[int] = None
    destination: Optional[int] = None
    is_mobile: bool = True
    is_gm_faction: bool = False
    agreeableness: int = 0
    theology: int = 90
    notes: str = ''


@api.get("/maps/{map_id}/factions/", response=list[FactionSchema])
def list_factions(request, map_id: int):
    get_object_or_404(Map, id=map_id)
    return list(Faction.objects.filter(current_hex__map_id=map_id).prefetch_related('knowledge', 'allowed_hexes'))


class FactionPatchSchema(Schema):
    name: Optional[str] = None
    color: Optional[str] = None
    speed: Optional[int] = None
    population: Optional[int] = None
    technology: Optional[int] = None
    resources: Optional[int] = None
    combat_skill: Optional[int] = None
    current_hex: Optional[int] = None
    destination: Optional[int] = None
    is_mobile: Optional[bool] = None
    is_gm_faction: Optional[bool] = None
    agreeableness: Optional[int] = None
    theology: Optional[int] = None
    next_action: Optional[str] = None
    notes: Optional[str] = None
    knowledge: Optional[list[int]] = None
    leader: Optional[str] = None
    image: Optional[int] = None
    movement_restricted: Optional[bool] = None
    allowed_hexes: Optional[list[int]] = None


@api.patch("/factions/{faction_id}/", response=FactionSchema)
@transaction.atomic
def patch_faction(request, faction_id: int, body: FactionPatchSchema):
    from world.models.gallery import GalleryImage
    faction = get_object_or_404(Faction, id=faction_id)
    data = body.dict(exclude_unset=True)
    if 'current_hex' in data:
        hex_id = data.pop('current_hex')
        faction.current_hex = get_object_or_404(Hex, id=hex_id) if hex_id is not None else None
    if 'destination' in data:
        dest_id = data.pop('destination')
        faction.destination = get_object_or_404(Hex, id=dest_id) if dest_id is not None else None
    if 'image' in data:
        image_id = data.pop('image')
        faction.image = get_object_or_404(GalleryImage, id=image_id) if image_id is not None else None
    knowledge_ids = data.pop('knowledge', None)
    allowed_hex_ids = data.pop('allowed_hexes', None)
    for field, value in data.items():
        setattr(faction, field, value)
    faction.save()
    if knowledge_ids is not None:
        faction.knowledge.set(Knowledge.objects.filter(id__in=knowledge_ids))
    if allowed_hex_ids is not None:
        faction.allowed_hexes.set(Hex.objects.filter(id__in=allowed_hex_ids))
    return faction


@api.post("/maps/{map_id}/factions/", response=FactionSchema)
@transaction.atomic
def create_faction(request, map_id: int, body: FactionCreateSchema):
    map_obj = get_object_or_404(Map, id=map_id)
    current_hex = get_object_or_404(Hex, id=body.current_hex, map=map_obj) if body.current_hex else None
    destination = get_object_or_404(Hex, id=body.destination, map=map_obj) if body.destination else None
    faction = Faction.objects.create(
        name=body.name,
        color=body.color,
        speed=body.speed,
        population=body.population,
        technology=body.technology,
        resources=body.resources,
        combat_skill=body.combat_skill,
        current_hex=current_hex,
        destination=destination,
        is_mobile=body.is_mobile,
        is_gm_faction=body.is_gm_faction,
        agreeableness=body.agreeableness,
        theology=body.theology,
    )
    return faction


# --- Knowledge ---

class KnowledgeRefSchema(Schema):
    id: int
    title: str


class KnowledgeSchema(Schema):
    id: int
    title: str
    description: str
    do_players_know: bool
    age: int
    related_knowledge: list[KnowledgeRefSchema]

    @staticmethod
    def resolve_related_knowledge(obj):
        return list(obj.related_knowledge.all())


class KnowledgePatchSchema(Schema):
    title: Optional[str] = None
    description: Optional[str] = None
    do_players_know: Optional[bool] = None
    age: Optional[int] = None
    related_knowledge: Optional[list[int]] = None


class KnowledgeCreateSchema(Schema):
    title: str
    description: str = ''
    do_players_know: bool = False
    age: int = 4
    related_knowledge: list[int] = []


@api.get("/maps/{map_id}/knowledge/", response=list[KnowledgeSchema])
def list_knowledge(request, map_id: int):
    get_object_or_404(Map, id=map_id)
    return list(Knowledge.objects.filter(map_id=map_id).prefetch_related('related_knowledge'))


@api.post("/maps/{map_id}/knowledge/", response=KnowledgeSchema)
@transaction.atomic
def create_knowledge(request, map_id: int, body: KnowledgeCreateSchema):
    map_obj = get_object_or_404(Map, id=map_id)
    obj = Knowledge.objects.create(
        map=map_obj,
        title=body.title,
        description=body.description,
        do_players_know=body.do_players_know,
        age=body.age,
    )
    if body.related_knowledge:
        obj.related_knowledge.set(Knowledge.objects.filter(id__in=body.related_knowledge))
    return obj


@api.patch("/knowledge/{knowledge_id}/", response=KnowledgeSchema)
@transaction.atomic
def patch_knowledge(request, knowledge_id: int, body: KnowledgePatchSchema):
    obj = get_object_or_404(Knowledge, id=knowledge_id)
    data = body.dict(exclude_unset=True)
    related_ids = data.pop('related_knowledge', None)
    for field, value in data.items():
        setattr(obj, field, value)
    obj.save()
    if related_ids is not None:
        obj.related_knowledge.set(Knowledge.objects.filter(id__in=related_ids))
    obj.related_knowledge.all()  # prefetch for resolver
    return obj


# --- Characters ---

# --- Tick ---

class TickEventSchema(Schema):
    type: str
    message: str
    faction_id: Optional[int] = None
    hex_id: Optional[int] = None


class TickResponseSchema(Schema):
    tick_number: int
    events: list[TickEventSchema]


class TickRequestSchema(Schema):
    map_id: int
    mode: str  # "shift" or "day"


def _run_shift(map_id: int) -> tuple[int, list[dict]]:
    map_obj = Map.objects.select_for_update().get(id=map_id)
    latest = map_obj.current_tick.number if map_obj.current_tick else 0
    tick = Tick.objects.create(map=map_obj, number=latest + 1)
    map_obj.current_tick = tick
    map_obj.save(update_fields=['current_tick'])

    hexes = list(Hex.objects.filter(map_id=map_id).prefetch_related('pois'))
    factions = list(Faction.objects.filter(current_hex__map_id=map_id, is_dead=False).prefetch_related('diseases', 'allowed_hexes'))

    for hex in hexes:
        tick_hex(hex, tick)

    faction_ticks = []
    for faction in factions:
        nearby = [
            f for f in factions
            if f.id != faction.id
            and f.current_hex
            and faction.current_hex
            and hex_distance(faction.current_hex, f.current_hex) <= modifier(faction.scouting)
        ]
        candidates = adjacent_hexes(faction.current_hex, hexes) if faction.current_hex else []
        if faction.movement_restricted and not faction.is_gm_faction:
            allowed_ids = {h.id for h in faction.allowed_hexes.all()}
            candidates = [h for h in candidates if h.id in allowed_ids]
        ft = tick_faction(faction, tick, nearby, candidates, map_obj.weather)
        faction_ticks.append((faction, ft))

    try:
        party = Party.objects.get(map_id=map_id)
        tick_party(party, tick)
    except Party.DoesNotExist:
        pass

    events = []
    for faction, ft in faction_ticks:
        if ft.action == 'battle':
            events.append({
                'type': 'battle',
                'message': f"{faction.name} fought (roll: {ft.dice_roll})",
                'faction_id': faction.id,
                'hex_id': ft.current_hex_id,
            })
        if faction.is_famine:
            events.append({
                'type': 'famine',
                'message': f"{faction.name} is starving",
                'faction_id': faction.id,
                'hex_id': ft.current_hex_id,
            })
        if faction.is_dying:
            events.append({
                'type': 'death',
                'message': f"{faction.name} is collapsing (pop < 20, trend < 0)",
                'faction_id': faction.id,
                'hex_id': ft.current_hex_id,
            })

    return tick.number, events


@api.post("/tick/", response=TickResponseSchema)
@transaction.atomic
def post_tick(request, body: TickRequestSchema):
    get_object_or_404(Map, id=body.map_id)

    if body.mode == 'day':
        all_events = []
        tick_number = None
        for _ in range(3):
            tick_number, events = _run_shift(body.map_id)
            all_events.extend(events)
        transaction.on_commit(lambda: broadcast_tick(body.map_id, tick_number))
        return {'tick_number': tick_number, 'events': all_events}

    tick_number, events = _run_shift(body.map_id)
    transaction.on_commit(lambda: broadcast_tick(body.map_id, tick_number))
    return {'tick_number': tick_number, 'events': events}


# --- Party ---

class PartySchema(Schema):
    id: int
    name: str
    map: Optional[int]
    player_count: int
    speed: int
    max_speed: int
    resource_generation: int
    supplies: int
    tracks_supplies: bool
    is_lost: bool
    current_hex: Optional[int]
    destination: Optional[int]
    current_action: Optional[str]
    last_action: Optional[str]

    @staticmethod
    def resolve_map(obj):
        return obj.map_id

    @staticmethod
    def resolve_current_hex(obj):
        return obj.current_hex_id

    @staticmethod
    def resolve_destination(obj):
        return obj.destination_id


class CurrentTickSchema(Schema):
    tick_number: int


@api.get("/maps/{map_id}/tick/current/", response=CurrentTickSchema)
def get_current_tick(request, map_id: int):
    map_obj = get_object_or_404(Map, id=map_id)
    return {"tick_number": map_obj.current_tick.number if map_obj.current_tick else 0}


@api.get("/maps/{map_id}/ticks/", response=list[int])
def list_ticks(request, map_id: int):
    map_obj = get_object_or_404(Map, id=map_id)
    return list(Tick.objects.filter(map=map_obj).values_list('number', flat=True).order_by('number'))


class HexTickStateSchema(Schema):
    hex_id: int
    resources: int
    encounter_likelihood: int
    player_explored: bool
    player_visible: bool


class FactionTickStateSchema(Schema):
    faction_id: int
    is_mobile: bool
    speed: int
    population: int
    technology: int
    technology_max: int
    resources: int
    agreeableness: int
    combat_skill: int
    current_hex: Optional[int]
    destination: Optional[int]
    action: Optional[str]


class PartyTickStateSchema(Schema):
    current_hex: Optional[int]
    destination: Optional[int]
    action: Optional[str]
    last_action: Optional[str]
    notes: str


class TickStateSchema(Schema):
    tick_number: int
    hex_ticks: list[HexTickStateSchema]
    faction_ticks: list[FactionTickStateSchema]
    party_tick: Optional[PartyTickStateSchema]


@api.get("/maps/{map_id}/tick/{tick_number}/state/", response=TickStateSchema)
def get_tick_state(request, map_id: int, tick_number: int):
    map_obj = get_object_or_404(Map, id=map_id)
    tick = get_object_or_404(Tick, map=map_obj, number=tick_number)
    pt = (
        PartyTick.objects
        .filter(tick__map=map_obj, tick__number__lte=tick_number)
        .order_by('-tick__number')
        .first()
    )
    return {
        'tick_number': tick_number,
        'hex_ticks': [
            {
                'hex_id': ht.hex_id,
                'resources': ht.resources,
                'encounter_likelihood': ht.encounter_likelihood,
                'player_explored': ht.player_explored,
                'player_visible': ht.player_visible,
            }
            for ht in tick.hex_ticks.all()
        ],
        'faction_ticks': [
            {
                'faction_id': ft.faction_id,
                'is_mobile': ft.is_mobile,
                'speed': ft.speed,
                'population': ft.population,
                'technology': ft.technology,
                'technology_max': ft.technology_max,
                'resources': ft.resources,
                'agreeableness': ft.agreeableness,
                'combat_skill': ft.combat_skill,
                'current_hex': ft.current_hex_id,
                'destination': ft.destination_id,
                'action': ft.action,
            }
            for ft in tick.faction_ticks.all()
        ],
        'party_tick': {
            'current_hex': pt.current_hex_id,
            'destination': pt.destination_id,
            'action': pt.action,
            'last_action': pt.last_action,
            'notes': pt.notes,
        } if pt else None,
    }


@api.post("/maps/{map_id}/tick/{tick_number}/reset/", response=CurrentTickSchema)
@transaction.atomic
def reset_to_tick(request, map_id: int, tick_number: int):
    map_obj = get_object_or_404(Map, id=map_id)
    tick = get_object_or_404(Tick, map=map_obj, number=tick_number)

    # Delete all future ticks (cascades to HexTick, FactionTick, PartyTick)
    Tick.objects.filter(map=map_obj, number__gt=tick_number).delete()

    # Restore live hex state from snapshots
    for ht in tick.hex_ticks.all():
        Hex.objects.filter(id=ht.hex_id).update(
            resources=ht.resources,
            encounter_likelihood=ht.encounter_likelihood,
            player_explored=ht.player_explored,
            player_visible=ht.player_visible,
        )

    # Restore live faction state from snapshots
    for ft in tick.faction_ticks.all():
        Faction.objects.filter(id=ft.faction_id).update(
            speed=ft.speed,
            population=ft.population,
            technology=ft.technology,
            technology_max=ft.technology_max,
            resources=ft.resources,
            agreeableness=ft.agreeableness,
            combat_skill=ft.combat_skill,
            current_hex_id=ft.current_hex_id,
            destination_id=ft.destination_id,
        )

    map_obj.current_tick = tick
    map_obj.save(update_fields=['current_tick'])

    transaction.on_commit(lambda: broadcast_tick(map_id, tick_number))
    return {'tick_number': tick_number}



@api.get("/maps/{map_id}/party/", response=PartySchema)
def get_party(request, map_id: int):
    map_obj = get_object_or_404(Map, id=map_id)
    party = get_object_or_404(Party, map=map_obj)
    return party


class PartyActionSchema(Schema):
    action: str  # "move" | "search" | "explore" | "supply"
    hex_id: Optional[int] = None   # required for move
    poi_id: Optional[int] = None   # required for explore
    amount: Optional[int] = None   # used by supply


class PartyActionResponseSchema(Schema):
    tick_number: int
    events: list[TickEventSchema]
    party_tick_id: int
    # Returned on move so GM can reference encounter info
    encounter_likelihood: Optional[int] = None
    terrain_type: Optional[str] = None
    # Wilderness rolls (move only, regional maps only)
    lost: Optional[bool] = None
    lost_roll: Optional[int] = None
    wilderness_event: Optional[str] = None
    event_roll: Optional[int] = None
    weather_roll: Optional[int] = None
    weather_before: Optional[str] = None
    weather_after: Optional[str] = None


def _create_party_tick(party, tick, action, sub_tick: int = 0) -> PartyTick:
    pt, _ = PartyTick.objects.update_or_create(
        tick=tick,
        party=party,
        defaults=dict(
            current_hex=party.current_hex,
            destination=party.destination,
            action=action,
            last_action=party.last_action,
            sub_tick=sub_tick,
        ),
    )
    return pt


@api.post("/party/{party_id}/action/", response=PartyActionResponseSchema)
@transaction.atomic
def party_action(request, party_id: int, body: PartyActionSchema):
    party = get_object_or_404(Party, id=party_id)
    map_id = party.current_hex.map_id if party.current_hex else None
    extra = {}
    rolls = {}

    if body.action == 'move':
        if not body.hex_id:
            return api.create_response(request, {'detail': 'hex_id required for move.'}, status=400)
        destination = get_object_or_404(Hex, id=body.hex_id)
        if not party.current_hex or destination.map_id != party.current_hex.map_id:
            return api.create_response(request, {'detail': 'Destination hex is not on the same map.'}, status=400)

        move_map = Map.objects.get(id=map_id) if map_id else None
        map_current = move_map.current_tick if move_map else None
        current_tick_number = map_current.number if map_current else 0
        move_cost = move_difficulty(party.current_hex, destination, current_tick_number, move_map.weather if move_map else 'fair')
        if move_map and move_map.map_type != MapType.CITY:
            if move_cost > party.speed:
                return api.create_response(request, {'detail': 'You must rest before traveling here.'}, status=400)

        old_hex = party.current_hex
        map_id = old_hex.map_id
        party.last_action = party.current_action
        party.current_action = Action.TRAVEL
        if not (move_map and move_map.map_type == MapType.CITY):
            party.speed -= move_cost
        party.current_hex = destination
        party.save()

        all_map_hexes = list(Hex.objects.filter(map_id=map_id))
        reveal_hex_on_move(destination, all_map_hexes)

        if not (move_map and move_map.map_type == MapType.CITY):
            rolls = party_move_rolls(old_hex, destination, move_map)
            party.is_lost = rolls['lost']
            party.save(update_fields=['is_lost'])

        extra = {
            'encounter_likelihood': destination.encounter_likelihood,
            'terrain_type': destination.terrain_type,
            **rolls,
        }

    elif body.action == 'search':
        if party.current_hex:
            reveal_pois_on_search(party.current_hex)
        party.last_action = party.current_action
        party.current_action = Action.SEARCH
        party.save()

    elif body.action == 'explore':
        if not body.poi_id:
            return api.create_response(request, {'detail': 'poi_id required for explore.'}, status=400)
        poi = get_object_or_404(PointOfInterest, id=body.poi_id, hex=party.current_hex)
        poi.player_explored = True
        poi.save()
        party.last_action = party.current_action
        party.current_action = Action.EXPLORE
        party.save()

    elif body.action == 'supply':
        if body.amount is not None:
            party.supplies = max(0, party.supplies + body.amount)
        party.last_action = party.current_action
        party.current_action = Action.SUPPLY
        party.save()
        supply_map = Map.objects.get(id=map_id) if map_id else None
        if supply_map and supply_map.map_type != MapType.CITY:
            rolls = party_wilderness_roll('supply', supply_map)

    elif body.action == 'delve':
        if not party.current_hex:
            return api.create_response(request, {'detail': 'Party has no current hex.'}, status=400)
        dungeon = party.current_hex.pois.filter(poi_type='dungeon', hidden=False).first()
        if not dungeon:
            return api.create_response(request, {'detail': 'No accessible dungeon on current hex.'}, status=400)
        dungeon.player_explored = True
        dungeon.save()
        party.last_action = party.current_action
        party.current_action = Action.DELVE
        party.save()

    elif body.action == 'social':
        party.last_action = party.current_action
        party.current_action = Action.SOCIAL
        party.save()

    elif body.action == 'rest':
        party.speed = party.max_speed
        party.last_action = party.current_action
        party.current_action = Action.REST
        party.save()
        rest_map = Map.objects.get(id=map_id) if map_id else None
        if rest_map and rest_map.map_type != MapType.CITY:
            rolls = party_wilderness_roll('rest', rest_map)

    elif body.action == 'clear_lost':
        if not party.is_lost:
            return api.create_response(request, {'detail': 'Party is not lost.'}, status=400)
        if not party.current_hex:
            return api.create_response(request, {'detail': 'Party has no current hex.'}, status=400)
        map_obj_cl = Map.objects.get(id=map_id) if map_id else None
        tick_num_cl = map_obj_cl.current_tick.number if map_obj_cl and map_obj_cl.current_tick else 0
        cost = party.current_hex.terrain_difficulty + night_bonus(tick_num_cl)
        party.speed = max(0, party.speed - cost)
        party.is_lost = False
        party.last_action = party.current_action
        party.current_action = Action.TRAVEL
        party.save()
        if map_id:
            transaction.on_commit(lambda: _redis.publish(
                _sse_channel(map_id),
                json.dumps({'type': 'navigation_update', 'lost': False}),
            ))

    else:
        return api.create_response(request, {'detail': f'Unknown action: {body.action}'}, status=400)

    map_obj = Map.objects.get(id=map_id) if map_id else None
    is_city = map_obj and map_obj.map_type == MapType.CITY

    if is_city:
        map_obj.sub_tick += 1
        is_shift = map_obj.sub_tick % 3 == 0
        if is_shift:
            map_obj.sub_tick = 0
        map_obj.save(update_fields=['sub_tick'])
        party_sub_tick = 0 if is_shift else map_obj.sub_tick
    else:
        is_shift = True
        party_sub_tick = 0

    if is_shift:
        tick_number, events = _run_shift(map_id)
        map_obj.refresh_from_db(fields=['current_tick'])
        tick = map_obj.current_tick
    else:
        tick_number = map_obj.current_tick.number if map_obj and map_obj.current_tick else 0
        events = []

    tick = map_obj.current_tick if map_obj else None
    party_tick = _create_party_tick(party, tick, party.current_action, sub_tick=party_sub_tick)

    if map_id and map_obj:
        map_obj.player_actions_locked = True
        map_obj.save(update_fields=['player_actions_locked'])
        transaction.on_commit(lambda: broadcast_tick(map_id, tick_number))
        if body.action in ('move', 'supply', 'rest') and rolls:
            move_result_payload = json.dumps({'type': 'move_result', 'action': body.action, **rolls})
            transaction.on_commit(lambda: _redis.publish(_sse_channel(map_id), move_result_payload))

    return {'tick_number': tick_number, 'events': events, 'party_tick_id': party_tick.id, **extra}


@api.patch("/party/{party_id}/ticks/{party_tick_id}/notes/")
@transaction.atomic
def update_party_tick_notes(request, party_id: int, party_tick_id: int, notes: str):
    pt = get_object_or_404(PartyTick, id=party_tick_id, party_id=party_id)
    pt.notes = notes
    pt.save()
    return {'id': pt.id, 'notes': pt.notes}


class PartySuppliesSchema(Schema):
    supplies: int


@api.patch("/party/{party_id}/supplies/", response=PartySchema)
@transaction.atomic
def patch_party_supplies(request, party_id: int, body: PartySuppliesSchema):
    party = get_object_or_404(Party, id=party_id)
    party.supplies = max(0, body.supplies)
    party.save(update_fields=['supplies'])
    return party


class PartyPatchSchema(Schema):
    player_count: Optional[int] = None
    supplies: Optional[int] = None
    tracks_supplies: Optional[bool] = None
    speed: Optional[int] = None
    max_speed: Optional[int] = None
    resource_generation: Optional[int] = None
    current_action: Optional[str] = None
    current_hex: Optional[int] = None


@api.patch("/party/{party_id}/", response=PartySchema)
@transaction.atomic
def patch_party(request, party_id: int, body: PartyPatchSchema):
    party = get_object_or_404(Party, id=party_id)
    fields = []
    if body.player_count is not None:
        party.player_count = body.player_count
        fields.append('player_count')
    if body.supplies is not None:
        party.supplies = max(0, body.supplies)
        fields.append('supplies')
    if body.tracks_supplies is not None:
        party.tracks_supplies = body.tracks_supplies
        fields.append('tracks_supplies')
    if body.speed is not None:
        party.speed = body.speed
        fields.append('speed')
    if body.max_speed is not None:
        party.max_speed = body.max_speed
        fields.append('max_speed')
    if body.resource_generation is not None:
        party.resource_generation = body.resource_generation
        fields.append('resource_generation')
    if body.current_action is not None:
        party.current_action = body.current_action or None
        fields.append('current_action')
    if body.current_hex is not None:
        destination = get_object_or_404(Hex, id=body.current_hex)
        party.current_hex = destination
        fields.append('current_hex')
        Hex.objects.filter(id=destination.id).update(player_explored=True)
    if fields:
        party.save(update_fields=fields)
        map_id = party.map_id
        transaction.on_commit(lambda: _redis.publish(_sse_channel(map_id), json.dumps({"type": "map_update"})))
    return party


# --- Gallery ---

class GalleryImageSchema(Schema):
    id: int
    name: str
    image: str
    is_published: bool

    @staticmethod
    def resolve_image(obj):
        return obj.image.url if obj.image else ''


@api.get("/maps/{map_id}/gallery/", response=list[GalleryImageSchema])
def list_gallery(request, map_id: int):
    get_object_or_404(Map, id=map_id)
    return list(GalleryImage.objects.filter(map_id=map_id))


@api.post("/maps/{map_id}/gallery/", response=GalleryImageSchema)
def upload_gallery_image(
    request,
    map_id: int,
    image: File[UploadedFile],
    name: Form[str] = '',
):
    map_obj = get_object_or_404(Map, id=map_id)
    img = GalleryImage(map=map_obj, name=name)
    img.image = image
    img.save()
    return img


@api.delete("/gallery/{image_id}/")
def delete_gallery_image(request, image_id: int):
    img = get_object_or_404(GalleryImage, id=image_id)
    img.image.delete(save=False)
    img.delete()
    return {'ok': True}


@api.patch("/gallery/{image_id}/publish/", response=GalleryImageSchema)
@transaction.atomic
def publish_gallery_image(request, image_id: int):
    img = get_object_or_404(GalleryImage, id=image_id)
    if img.is_published:
        img.is_published = False
        img.save(update_fields=['is_published'])
    else:
        GalleryImage.objects.filter(map=img.map, is_published=True).update(is_published=False)
        img.is_published = True
        img.save(update_fields=['is_published'])
    _redis.publish(_sse_channel(img.map_id), json.dumps({"type": "gallery_update"}))
    return img
