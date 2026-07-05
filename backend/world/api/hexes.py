from typing import Optional

from ninja import Router, Schema
from django.shortcuts import get_object_or_404
from django.db import transaction

from world.models import Map, Hex, PointOfInterest

router = Router()


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


@router.post("/hexes/bulk-patch/", response=BulkHexPatchResult)
@transaction.atomic
def bulk_patch_hexes(request, body: BulkHexPatchBody):
    updates = body.dict(exclude_unset=True, exclude={"ids"})
    if not updates or not body.ids:
        return {"updated": 0}
    count = Hex.objects.filter(id__in=body.ids).update(**updates)
    return {"updated": count}


@router.patch("/hexes/{hex_id}/", response=HexSchema)
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


@router.post("/hexes/{hex_id}/pois/", response=POISchema)
@transaction.atomic
def create_poi(request, hex_id: int, body: POICreateSchema):
    hex_obj = get_object_or_404(Hex, id=hex_id)
    poi = PointOfInterest.objects.create(hex=hex_obj, **body.dict())
    return poi


@router.get("/maps/{map_id}/hexes/", response=list[HexSchema])
def list_hexes(request, map_id: int):
    get_object_or_404(Map, id=map_id)
    return list(
        Hex.objects.filter(map_id=map_id).prefetch_related('pois')
    )
