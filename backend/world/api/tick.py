from typing import Optional

from ninja import Router, Schema
from django.shortcuts import get_object_or_404
from django.db import transaction

from world.models import Map, Hex, Faction, Tick, PartyTick
from world.actions import run_shift

from .common import broadcast_tick, TickEventSchema, TickResponseSchema

router = Router()


class TickRequestSchema(Schema):
    map_id: int
    mode: str  # "shift" or "day"


@router.post("/tick/", response=TickResponseSchema)
@transaction.atomic
def post_tick(request, body: TickRequestSchema):
    get_object_or_404(Map, id=body.map_id)

    if body.mode == 'day':
        all_events = []
        tick_number = None
        for _ in range(3):
            tick_number, events = run_shift(body.map_id)
            all_events.extend(events)
        transaction.on_commit(lambda: broadcast_tick(body.map_id, tick_number))
        return {'tick_number': tick_number, 'events': all_events}

    tick_number, events = run_shift(body.map_id)
    transaction.on_commit(lambda: broadcast_tick(body.map_id, tick_number))
    return {'tick_number': tick_number, 'events': events}


class CurrentTickSchema(Schema):
    tick_number: int


@router.get("/maps/{map_id}/tick/current/", response=CurrentTickSchema)
def get_current_tick(request, map_id: int):
    map_obj = get_object_or_404(Map, id=map_id)
    return {"tick_number": map_obj.current_tick.number if map_obj.current_tick else 0}


@router.get("/maps/{map_id}/ticks/", response=list[int])
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


@router.get("/maps/{map_id}/tick/{tick_number}/state/", response=TickStateSchema)
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


@router.post("/maps/{map_id}/tick/{tick_number}/reset/", response=CurrentTickSchema)
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
            current_hex_id=ft.current_hex_id,
            destination_id=ft.destination_id,
        )

    map_obj.current_tick = tick
    map_obj.save(update_fields=['current_tick'])

    transaction.on_commit(lambda: broadcast_tick(map_id, tick_number))
    return {'tick_number': tick_number}
