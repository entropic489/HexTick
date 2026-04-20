from typing import Optional
from ninja import NinjaAPI, Schema
from django.shortcuts import get_object_or_404
from django.db import transaction
from world.models import Map, Hex, PointOfInterest, Faction, Tick, FactionTick, PartyTick
from world.models.settings import WorldSettings
from world.models.characters import Character
from world.models.party import Party
from world.models.faction import Action
from world.actions import tick_hex, tick_faction, tick_character
from world.utils import hex_distance, modifier

api = NinjaAPI(urls_namespace="api")


class MapSchema(Schema):
    id: int
    name: str
    image: str
    hex_size: int
    origin_x: int
    origin_y: int


@api.get("/maps/", response=list[MapSchema])
def list_maps(request):
    return list(Map.objects.all())


@api.get("/maps/{map_id}/", response=MapSchema)
def get_map(request, map_id: int):
    return get_object_or_404(Map, id=map_id)


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
    weather: str
    encounter_likelihood: int
    player_explored: bool
    player_visible: bool
    pois: list[POISchema]

    @staticmethod
    def resolve_pois(obj):
        return list(obj.pois.all())


@api.get("/maps/{map_id}/hexes/", response=list[HexSchema])
def list_hexes(request, map_id: int):
    get_object_or_404(Map, id=map_id)
    return list(
        Hex.objects.filter(map_id=map_id).prefetch_related('pois')
    )


class FactionSchema(Schema):
    id: int
    name: str
    speed: int
    population: int
    technology: int
    resources: int
    combat_skill: int
    current_action: Optional[str]
    last_action: Optional[str]
    current_hex_id: Optional[int]
    destination_id: Optional[int]
    is_mobile: bool
    is_player_faction: bool
    is_gm_faction: bool
    is_famine: bool
    is_dying: bool
    max_speed: int


@api.get("/maps/{map_id}/factions/", response=list[FactionSchema])
def list_factions(request, map_id: int):
    get_object_or_404(Map, id=map_id)
    return list(Faction.objects.filter(current_hex__map_id=map_id))


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
    settings = WorldSettings.get()
    latest = settings.current_tick.number if settings.current_tick else 0
    tick = Tick.objects.create(number=latest + 1)
    settings.current_tick = tick
    settings.save()

    hexes = list(Hex.objects.filter(map_id=map_id).prefetch_related('pois'))
    factions = list(Faction.objects.filter(current_hex__map_id=map_id))

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
        ft = tick_faction(faction, tick, nearby, hexes)
        faction_ticks.append((faction, ft))

    factions_by_hex: dict[int, list[Faction]] = {}
    for f in factions:
        if f.current_hex_id:
            factions_by_hex.setdefault(f.current_hex_id, []).append(f)

    characters = list(Character.objects.filter(current_hex__map_id=map_id))
    for character in characters:
        factions_on_hex = factions_by_hex.get(character.current_hex_id, []) if character.current_hex_id else []
        tick_character(character, tick, factions_on_hex)

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
        return {'tick_number': tick_number, 'events': all_events}

    tick_number, events = _run_shift(body.map_id)
    return {'tick_number': tick_number, 'events': events}


# --- Party ---

class PartyActionSchema(Schema):
    action: str  # "move" | "search" | "explore" | "supply"
    hex_id: Optional[int] = None   # required for move
    poi_id: Optional[int] = None   # required for explore


class PartyActionResponseSchema(Schema):
    tick_number: int
    events: list[TickEventSchema]
    party_tick_id: int
    # Returned on move so GM can reference encounter info
    encounter_likelihood: Optional[int] = None
    terrain_type: Optional[str] = None


def _create_party_tick(party, tick, action) -> PartyTick:
    return PartyTick.objects.create(
        tick=tick,
        party=party,
        current_hex=party.current_hex,
        destination=party.destination,
        action=action,
        last_action=party.last_action,
    )


@api.post("/party/{party_id}/action/", response=PartyActionResponseSchema)
@transaction.atomic
def party_action(request, party_id: int, body: PartyActionSchema):
    party = get_object_or_404(Party, id=party_id)
    map_id = party.current_hex.map_id if party.current_hex else None
    extra = {}

    if body.action == 'move':
        if not body.hex_id:
            return api.create_response(request, {'detail': 'hex_id required for move.'}, status=400)
        destination = get_object_or_404(Hex, id=body.hex_id)
        if not party.current_hex or destination.map_id != party.current_hex.map_id:
            return api.create_response(request, {'detail': 'Destination hex is not on the same map.'}, status=400)

        old_hex = party.current_hex
        map_id = old_hex.map_id
        party.last_action = party.current_action
        party.current_action = Action.TRAVEL
        party.speed -= destination.terrain_difficulty
        party.current_hex = destination
        party.save()

        old_hex.player_visible = False
        old_hex.save()
        destination.player_visible = True
        destination.player_explored = True
        destination.save()

        if party.faction and party.faction.is_player_faction:
            party.faction.current_action = Action.TRAVEL
            party.faction.destination = destination
            party.faction.save()

        extra = {
            'encounter_likelihood': destination.encounter_likelihood,
            'terrain_type': destination.terrain_type,
        }

    elif body.action == 'search':
        if party.current_hex:
            party.current_hex.pois.filter(hidden=False).update(player_visible=True)
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
        party.last_action = party.current_action
        party.current_action = Action.SUPPLY
        party.save()

    else:
        return api.create_response(request, {'detail': f'Unknown action: {body.action}'}, status=400)

    tick_number, events = _run_shift(map_id)
    tick = WorldSettings.get().current_tick

    if party.faction and party.faction.is_player_faction and body.action == 'move':
        party.refresh_from_db()
        party.current_hex = party.faction.current_hex
        party.save()

    party_tick = _create_party_tick(party, tick, party.current_action)

    return {'tick_number': tick_number, 'events': events, 'party_tick_id': party_tick.id, **extra}


@api.patch("/party/{party_id}/ticks/{party_tick_id}/notes/")
@transaction.atomic
def update_party_tick_notes(request, party_id: int, party_tick_id: int, notes: str):
    pt = get_object_or_404(PartyTick, id=party_tick_id, party_id=party_id)
    pt.notes = notes
    pt.save()
    return {'id': pt.id, 'notes': pt.notes}
