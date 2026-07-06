import random
from dataclasses import dataclass
from enum import StrEnum

from .models.faction import Faction, Action
from .models.hex import Hex, PointOfInterest
from .models.party import Party
from .models.ticks import Tick, HexTick, FactionTick, PartyTick
from .models.settings import WorldSettings
from .models.world import Map, MapType, WeatherType
from .utils import hex_distance, adjacent_hexes, night_bonus, move_difficulty


class WildernessEvent(StrEnum):
    ENCOUNTER = 'Encounter'
    SIGN = 'Sign'
    WEATHER = 'Weather'
    LOSS = 'Loss'
    QUIET = 'Quiet'


_WILDERNESS_TABLE = {
    1: WildernessEvent.ENCOUNTER,
    2: WildernessEvent.SIGN,
    3: WildernessEvent.WEATHER,
    4: WildernessEvent.LOSS,
    5: WildernessEvent.QUIET,
}


# Best to worst; a Weather event shifts the map along this scale.
WEATHER_ORDER = [
    WeatherType.FAIR,
    WeatherType.OVERCAST,
    WeatherType.INCLEMENT,
    WeatherType.EXTREME,
    WeatherType.CATASTROPHIC,
]

# d8: 1 worse by 2, 2 worse by 1, 3-5 no change, 6-7 better by 1, 8 better by 2.
_WEATHER_SHIFT_TABLE = {1: 2, 2: 1, 3: 0, 4: 0, 5: 0, 6: -1, 7: -1, 8: -2}


def _shift_weather(map: Map, weather_roll: int) -> tuple[str, str]:
    """Apply a d8 weather-shift roll to map.weather, clamped to WEATHER_ORDER's range.

    Returns (weather_before, weather_after).
    """
    weather_before = map.weather
    current_index = WEATHER_ORDER.index(map.weather)
    new_index = max(0, min(len(WEATHER_ORDER) - 1, current_index + _WEATHER_SHIFT_TABLE[weather_roll]))
    map.weather = WEATHER_ORDER[new_index]
    map.save(update_fields=['weather'])
    return weather_before, map.weather


def party_move_rolls(origin: Hex, destination: Hex, map: Map) -> dict:
    """Roll for lost (d6) and wilderness event (d5) on party movement.

    Lost roll is skipped if both hexes have roads or both hexes have rivers.
    A Weather event additionally rolls a d8 to shift map.weather.
    """
    skip_lost = (origin.has_roads and destination.has_roads) or (origin.has_rivers and destination.has_rivers)
    lost_roll = random.randint(1, 6)
    lost = False if skip_lost else (lost_roll == 6)
    event_roll = random.randint(1, 5)
    wilderness_event = _WILDERNESS_TABLE[event_roll]
    result = {
        'lost': lost,
        'lost_roll': lost_roll if not skip_lost else None,
        'wilderness_event': wilderness_event.value,
        'event_roll': event_roll,
    }
    if wilderness_event == WildernessEvent.WEATHER:
        weather_roll = random.randint(1, 8)
        weather_before, weather_after = _shift_weather(map, weather_roll)
        result['weather_roll'] = weather_roll
        result['weather_before'] = weather_before
        result['weather_after'] = weather_after
    return result


# Rest treats Sign (2) as Quiet (5) — that outcome is irrelevant while resting.
_REST_ROLL_REMAP = {2: 5}


def party_wilderness_roll(action: str, map: Map) -> dict:
    """Roll a d5 wilderness event for supply or rest actions.

    For rest, result 2 (Sign) is remapped to 5 (Quiet).
    A Weather event additionally rolls a d8 to shift map.weather.
    Returns {event_roll, wilderness_event}; no lost roll.
    """
    event_roll = random.randint(1, 5)
    effective_roll = _REST_ROLL_REMAP.get(event_roll, event_roll) if action == 'rest' else event_roll
    wilderness_event = _WILDERNESS_TABLE[effective_roll]
    result = {
        'lost': None,
        'lost_roll': None,
        'wilderness_event': wilderness_event.value,
        'event_roll': event_roll,
    }
    if wilderness_event == WildernessEvent.WEATHER:
        weather_roll = random.randint(1, 8)
        weather_before, weather_after = _shift_weather(map, weather_roll)
        result['weather_roll'] = weather_roll
        result['weather_before'] = weather_before
        result['weather_after'] = weather_after
    return result



@dataclass
class ActionResult:
    action: Action
    dice_roll: int | None = None
    success: bool = True
    notes: str = ''


# --- Faction tick ---

def _step_toward(target: Hex, candidates: list[Hex]) -> Hex | None:
    """The adjacent candidate hex minimizing distance to target."""
    return min(candidates, key=lambda h: hex_distance(h, target), default=None)


def _perform_travel(
    faction: Faction,
    candidate_hexes: list[Hex],
    restricted: list[Hex],
    tick_number: int,
    weather: str,
) -> ActionResult:
    """Step toward the GM-set destination (ignoring restrictions) if one is set;
    otherwise wander to a random allowed adjacent hex."""
    if not faction.is_mobile:
        return rest(faction)
    if faction.destination and faction.current_hex != faction.destination:
        step = _step_toward(faction.destination, candidate_hexes)
    elif restricted:
        step = random.choice(restricted)
    else:
        step = None
    if step:
        return travel(faction, step, tick_number, weather)
    return rest(faction)


def _select_action(
    faction: Faction,
    candidate_hexes: list[Hex],
    allowed_hex_ids: set[int] | None,
    tick_number: int,
    weather: str = 'fair',
) -> ActionResult:
    candidate_hexes = list(candidate_hexes)
    if allowed_hex_ids is None:
        restricted = candidate_hexes
    else:
        restricted = [h for h in candidate_hexes if h.id in allowed_hex_ids]

    # 1. GM-set next_action takes priority (consumed and cleared by tick_faction)
    if faction.next_action:
        action = faction.next_action
        if action == Action.REST:
            return rest(faction)
        if action == Action.SUPPLY:
            return supply(faction)
        if action == Action.TRAVEL:
            return _perform_travel(faction, candidate_hexes, restricted, tick_number, weather)
        # A party-only action set as next_action: record it without effect.
        return ActionResult(action=action)

    # 2. GM-set destination: path toward it every tick (ignores movement restrictions)
    if faction.destination:
        if faction.current_hex == faction.destination:
            faction.destination = None
            faction.save(update_fields=['destination'])
        elif not faction.is_mobile:
            return rest(faction)
        else:
            step = _step_toward(faction.destination, candidate_hexes)
            if step:
                return travel(faction, step, tick_number, weather)
            return rest(faction)

    # 3. Night: the faction rests
    if tick_number % 3 == 2:
        return rest(faction)

    # 4. Day: d3 — 1/2 movement (wander), 3 supply
    roll = random.randint(1, 3)
    if roll == 3:
        return supply(faction)
    if faction.is_mobile and restricted:
        return travel(faction, random.choice(restricted), tick_number, weather)
    return rest(faction)


def tick_faction(
    faction: Faction,
    tick: Tick,
    candidate_hexes: list[Hex],
    allowed_hex_ids: set[int] | None,
    weather: str = 'fair',
) -> FactionTick:
    result = _select_action(faction, candidate_hexes, allowed_hex_ids, tick.number, weather)
    faction.last_action = faction.current_action
    faction.current_action = result.action
    faction.next_action = None
    faction.save()

    return FactionTick.objects.create(
        tick=tick,
        faction=faction,
        is_mobile=faction.is_mobile,
        speed=faction.speed,
        population=faction.population,
        current_hex=faction.current_hex,
        destination=faction.destination,
        action=result.action,
        dice_roll=result.dice_roll,
    )


def reveal_hex_on_move(destination: Hex, all_map_hexes: list[Hex]) -> None:
    adjacent_ids = {h.id for h in adjacent_hexes(destination, all_map_hexes)}
    Hex.objects.filter(id__in=(adjacent_ids | {destination.id})).update(player_visible=True)
    Hex.objects.filter(id=destination.id).update(player_explored=True)
    destination.refresh_from_db()


def reveal_pois_on_search(hex: Hex) -> None:
    hex.pois.filter(hidden=False).update(player_visible=True)


# --- Party ---

def tick_party(party: Party, tick: Tick) -> None:
    if tick.number % 3 == 0 and party.tracks_supplies:
        party.supplies = max(0, party.supplies - party.player_count)
        party.save(update_fields=['supplies'])


# --- Hex ---

def tick_hex(hex: Hex, tick: Tick, resource_tick_modifier: int) -> HexTick:
    if tick.number % 3 == 0:
        hex.resources += hex.resource_generation * resource_tick_modifier
        hex.save(update_fields=['resources'])
    return HexTick.objects.create(
        tick=tick,
        hex=hex,
        resources=hex.resources,
        encounter_likelihood=hex.encounter_likelihood,
        player_explored=hex.player_explored,
        player_visible=hex.player_visible,
    )


# --- Shift orchestration ---

def run_shift(map_id: int) -> tuple[int, list[dict]]:
    """Advance a map one shift: create the next Tick, tick every hex/faction/party,
    and return (tick_number, events). Takes a row lock on the map."""
    map_obj = Map.objects.select_for_update().get(id=map_id)
    latest = map_obj.current_tick.number if map_obj.current_tick else 0
    tick = Tick.objects.create(map=map_obj, number=latest + 1)
    map_obj.current_tick = tick
    map_obj.save(update_fields=['current_tick'])

    hexes = list(Hex.objects.filter(map_id=map_id).prefetch_related('pois'))
    factions = list(Faction.objects.filter(map_id=map_id, is_dead=False).prefetch_related('allowed_hexes'))

    resource_tick_modifier = WorldSettings.get().hex_resource_tick_modifier
    for hex in hexes:
        tick_hex(hex, tick, resource_tick_modifier)

    for faction in factions:
        candidates = adjacent_hexes(faction.current_hex, hexes) if faction.current_hex else []
        allowed_ids = (
            {h.id for h in faction.allowed_hexes.all()}
            if faction.movement_restricted else None
        )
        tick_faction(faction, tick, candidates, allowed_ids, map_obj.weather)

    try:
        party = Party.objects.get(map_id=map_id)
        tick_party(party, tick)
    except Party.DoesNotExist:
        pass

    return tick.number, []


# --- Faction actions ---

def supply(faction: Faction) -> ActionResult:
    """Flavour-only record; the GM narrates supply in the fiction."""
    return ActionResult(action=Action.SUPPLY)


def rest(faction: Faction) -> ActionResult:
    faction.speed = faction.max_speed
    faction.save(update_fields=['speed'])
    return ActionResult(action=Action.REST)


def travel(faction: Faction, destination: Hex, tick_number: int, weather: str = 'fair') -> ActionResult:
    cost = move_difficulty(faction.current_hex, destination, tick_number, weather)
    if faction.speed < cost:
        return rest(faction)
    faction.speed -= cost
    faction.current_hex = destination
    faction.save(update_fields=['speed', 'current_hex'])
    return ActionResult(action=Action.TRAVEL, notes=f"moved to {destination} (cost {cost})")


# --- Party actions ---

class PartyActionError(Exception):
    """Raised for a rejected party action. The API layer converts it to an HTTP response."""

    def __init__(self, detail: str, status: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.status = status


@dataclass
class PartyActionOutcome:
    tick_number: int
    events: list[dict]
    party_tick: PartyTick
    map_id: int | None
    extra: dict
    # SSE messages the API layer should publish on commit (in addition to the tick broadcast).
    sse_messages: list[dict]


def _create_party_tick(party: Party, tick, action, sub_tick: int = 0) -> PartyTick:
    pt, _ = PartyTick.objects.update_or_create(
        tick=tick,
        party=party,
        defaults=dict(
            current_hex=party.current_hex,
            action=action,
            last_action=party.last_action,
            sub_tick=sub_tick,
        ),
    )
    return pt


def perform_party_action(
    party: Party,
    action: str,
    *,
    hex_id: int | None = None,
    poi_id: int | None = None,
    amount: int | None = None,
) -> PartyActionOutcome:
    """Apply a party action, advance the world if the action closes a shift, and snapshot
    a PartyTick. Raises PartyActionError for rejected actions; SSE side effects are returned
    on the outcome for the API layer to publish on commit."""
    from django.shortcuts import get_object_or_404

    # Prefer the hex's map, but fall back to the party's own map FK so non-move actions
    # work for a party with no current_hex (H6). If neither resolves a map, reject.
    map_id = party.current_hex.map_id if party.current_hex else party.map_id
    if map_id is None:
        raise PartyActionError('Party is not on a map.')
    # Lock the map row up front (L6) so the sub_tick math and the shift can't interleave
    # with a concurrent party action, and reuse this instance instead of re-fetching the
    # map several times below. run_shift re-acquires the same lock re-entrantly.
    map_obj = Map.objects.select_for_update().get(id=map_id)
    extra: dict = {}
    rolls: dict = {}
    sse_messages: list[dict] = []

    if action == 'move':
        if not hex_id:
            raise PartyActionError('hex_id required for move.')
        destination = get_object_or_404(Hex, id=hex_id)
        if not party.current_hex or destination.map_id != party.current_hex.map_id:
            raise PartyActionError('Destination hex is not on the same map.')

        move_map = map_obj
        map_current = move_map.current_tick if move_map else None
        current_tick_number = map_current.number if map_current else 0
        move_cost = move_difficulty(party.current_hex, destination, current_tick_number, move_map.weather if move_map else 'fair')
        if move_map and move_map.map_type != MapType.CITY:
            if move_cost > party.speed:
                raise PartyActionError('You must rest before traveling here.')

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

    elif action == 'search':
        if party.current_hex:
            reveal_pois_on_search(party.current_hex)
        party.last_action = party.current_action
        party.current_action = Action.SEARCH
        party.save()

    elif action == 'explore':
        if not poi_id:
            raise PartyActionError('poi_id required for explore.')
        poi = get_object_or_404(PointOfInterest, id=poi_id, hex=party.current_hex)
        poi.player_explored = True
        poi.save()
        party.last_action = party.current_action
        party.current_action = Action.EXPLORE
        party.save()

    elif action == 'supply':
        if amount is not None:
            party.supplies = max(0, party.supplies + amount)
        party.last_action = party.current_action
        party.current_action = Action.SUPPLY
        party.save()
        supply_map = map_obj
        if supply_map and supply_map.map_type != MapType.CITY:
            rolls = party_wilderness_roll('supply', supply_map)

    elif action == 'delve':
        if not party.current_hex:
            raise PartyActionError('Party has no current hex.')
        dungeon = party.current_hex.pois.filter(poi_type='dungeon', hidden=False).first()
        if not dungeon:
            raise PartyActionError('No accessible dungeon on current hex.')
        dungeon.player_explored = True
        dungeon.save()
        party.last_action = party.current_action
        party.current_action = Action.DELVE
        party.save()

    elif action == 'social':
        party.last_action = party.current_action
        party.current_action = Action.SOCIAL
        party.save()

    elif action == 'rest':
        party.speed = party.max_speed
        party.last_action = party.current_action
        party.current_action = Action.REST
        party.save()
        rest_map = map_obj
        if rest_map and rest_map.map_type != MapType.CITY:
            rolls = party_wilderness_roll('rest', rest_map)

    elif action == 'clear_lost':
        if not party.is_lost:
            raise PartyActionError('Party is not lost.')
        if not party.current_hex:
            raise PartyActionError('Party has no current hex.')
        tick_num_cl = map_obj.current_tick.number if map_obj and map_obj.current_tick else 0
        cost = party.current_hex.terrain_difficulty + night_bonus(tick_num_cl)
        party.speed = max(0, party.speed - cost)
        party.is_lost = False
        party.last_action = party.current_action
        party.current_action = Action.TRAVEL
        party.save()
        if map_id:
            sse_messages.append({'type': 'navigation_update', 'lost': False})

    else:
        raise PartyActionError(f'Unknown action: {action}')

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
        tick_number, events = run_shift(map_id)
        map_obj.refresh_from_db(fields=['current_tick'])
        tick = map_obj.current_tick
    else:
        # City map mid-shift sub-tick. If no shift has ever fired, there is no Tick for
        # this sub-tick's PartyTick to reference (PartyTick.tick is non-null) — seed the
        # current shift's Tick before recording it (H7).
        if map_obj and map_obj.current_tick is None:
            run_shift(map_id)
            map_obj.refresh_from_db(fields=['current_tick'])
        tick_number = map_obj.current_tick.number if map_obj and map_obj.current_tick else 0
        events = []

    tick = map_obj.current_tick if map_obj else None
    party_tick = _create_party_tick(party, tick, party.current_action, sub_tick=party_sub_tick)

    if map_id and map_obj:
        map_obj.player_actions_locked = True
        map_obj.save(update_fields=['player_actions_locked'])
        if action in ('move', 'supply', 'rest') and rolls:
            sse_messages.append({'type': 'move_result', 'action': action, **rolls})

    return PartyActionOutcome(
        tick_number=tick_number,
        events=events,
        party_tick=party_tick,
        map_id=map_id,
        extra=extra,
        sse_messages=sse_messages,
    )

