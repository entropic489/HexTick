from typing import Optional

from ninja import Router, Schema
from django.shortcuts import get_object_or_404
from django.db import transaction

from world.models import Map, Hex
from world.models.party import Party
from world.actions import perform_party_action, PartyActionError

from .common import api, publish, broadcast_tick, TickEventSchema

router = Router()


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
    current_action: Optional[str]
    last_action: Optional[str]

    @staticmethod
    def resolve_map(obj):
        return obj.map_id

    @staticmethod
    def resolve_current_hex(obj):
        return obj.current_hex_id


@router.get("/maps/{map_id}/party/", response=PartySchema)
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


@router.post("/party/{party_id}/action/", response=PartyActionResponseSchema)
@transaction.atomic
def party_action(request, party_id: int, body: PartyActionSchema):
    party = get_object_or_404(Party, id=party_id)
    try:
        outcome = perform_party_action(
            party,
            body.action,
            hex_id=body.hex_id,
            poi_id=body.poi_id,
            amount=body.amount,
        )
    except PartyActionError as exc:
        return api.create_response(request, {'detail': exc.detail}, status=exc.status)

    if outcome.map_id:
        map_id = outcome.map_id
        tick_number = outcome.tick_number
        transaction.on_commit(lambda: broadcast_tick(map_id, tick_number))
        for message in outcome.sse_messages:
            transaction.on_commit(lambda m=message: publish(map_id, m))

    return {
        'tick_number': outcome.tick_number,
        'events': outcome.events,
        'party_tick_id': outcome.party_tick.id,
        **outcome.extra,
    }


class PartyPatchSchema(Schema):
    player_count: Optional[int] = None
    supplies: Optional[int] = None
    tracks_supplies: Optional[bool] = None
    speed: Optional[int] = None
    max_speed: Optional[int] = None
    resource_generation: Optional[int] = None
    current_action: Optional[str] = None
    current_hex: Optional[int] = None


@router.patch("/party/{party_id}/", response=PartySchema)
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
        transaction.on_commit(lambda: publish(map_id, {"type": "map_update"}))
    return party
