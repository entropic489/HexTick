from typing import Optional

from ninja import Router, Schema
from django.shortcuts import get_object_or_404
from django.db import transaction

from world.models import Map, Hex, Faction

router = Router()


class FactionSchema(Schema):
    id: int
    name: str
    color: str
    speed: int
    max_speed: int
    population: int
    current_action: Optional[str]
    last_action: Optional[str]
    current_hex: Optional[int]
    destination: Optional[int]
    is_mobile: bool
    is_dead: bool
    next_action: Optional[str] = None
    notes: str = ''
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
    def resolve_image(obj):
        return obj.image_id

    @staticmethod
    def resolve_allowed_hexes(obj):
        return [h.id for h in obj.allowed_hexes.all()]


class FactionCreateSchema(Schema):
    name: str
    color: str = '#89b4fa'
    speed: int = 4
    max_speed: int = 4
    population: int = 10
    current_hex: Optional[int] = None
    destination: Optional[int] = None
    is_mobile: bool = True
    notes: str = ''


@router.get("/maps/{map_id}/factions/", response=list[FactionSchema])
def list_factions(request, map_id: int):
    get_object_or_404(Map, id=map_id)
    return list(Faction.objects.filter(current_hex__map_id=map_id).prefetch_related('allowed_hexes'))


class FactionPatchSchema(Schema):
    name: Optional[str] = None
    color: Optional[str] = None
    speed: Optional[int] = None
    max_speed: Optional[int] = None
    population: Optional[int] = None
    current_hex: Optional[int] = None
    destination: Optional[int] = None
    is_mobile: Optional[bool] = None
    is_dead: Optional[bool] = None
    next_action: Optional[str] = None
    notes: Optional[str] = None
    leader: Optional[str] = None
    image: Optional[int] = None
    movement_restricted: Optional[bool] = None
    allowed_hexes: Optional[list[int]] = None


@router.patch("/factions/{faction_id}/", response=FactionSchema)
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
    allowed_hex_ids = data.pop('allowed_hexes', None)
    for field, value in data.items():
        setattr(faction, field, value)
    faction.save()
    if allowed_hex_ids is not None:
        faction.allowed_hexes.set(Hex.objects.filter(id__in=allowed_hex_ids))
    return faction


@router.post("/maps/{map_id}/factions/", response=FactionSchema)
@transaction.atomic
def create_faction(request, map_id: int, body: FactionCreateSchema):
    map_obj = get_object_or_404(Map, id=map_id)
    current_hex = get_object_or_404(Hex, id=body.current_hex, map=map_obj) if body.current_hex else None
    destination = get_object_or_404(Hex, id=body.destination, map=map_obj) if body.destination else None
    faction = Faction.objects.create(
        name=body.name,
        color=body.color,
        speed=body.speed,
        max_speed=body.max_speed,
        population=body.population,
        current_hex=current_hex,
        destination=destination,
        is_mobile=body.is_mobile,
        notes=body.notes,
    )
    return faction
