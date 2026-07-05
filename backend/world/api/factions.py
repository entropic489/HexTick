from typing import Optional

from ninja import Router, Schema
from django.shortcuts import get_object_or_404
from django.db import transaction

from world.models import Map, Hex, Faction
from world.models.characters import Knowledge

router = Router()


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


@router.get("/maps/{map_id}/factions/", response=list[FactionSchema])
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
