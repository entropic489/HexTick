"""Engine tests for the simplified faction tick.

New faction logic (see design_docs/Factions.md):
1. next_action set -> perform it, then clear.
2. destination set -> step one hex toward it (ignores movement restrictions).
3. night (tick % 3 == 2) -> rest.
4. day -> d3: 1/2 travel (wander), 3 supply.
"""
import pytest

import world.actions as actions
from world.actions import _select_action, tick_faction, supply, rest, travel
from world.models.faction import Action
from world.models.ticks import Tick
from world.utils import adjacent_hexes

pytestmark = pytest.mark.django_db


def _tick(map_obj, number):
    return Tick.objects.create(map=map_obj, number=number)


@pytest.fixture
def force_d3(monkeypatch):
    """Force actions.random.randint to a fixed value (the daytime d3 roll)."""
    def _set(value):
        monkeypatch.setattr(actions.random, 'randint', lambda lo, hi: value)
    return _set


# --- action primitives -------------------------------------------------------

def test_supply_is_flavour_only(faction_factory):
    assert supply(faction_factory()).action == Action.SUPPLY


def test_rest_resets_speed_to_max(faction_factory):
    f = faction_factory(speed=1, max_speed=6)
    assert rest(f).action == Action.REST
    f.refresh_from_db()
    assert f.speed == 6


def test_travel_moves_and_deducts_cost(map_factory, hex_factory, faction_factory):
    m = map_factory()
    a = hex_factory(map=m, row=0, col=0)
    b = hex_factory(map=m, row=1, col=0)
    f = faction_factory(current_hex=a, speed=5, max_speed=5)
    assert travel(f, b, tick_number=1).action == Action.TRAVEL
    f.refresh_from_db()
    assert f.current_hex_id == b.id
    assert f.speed < 5


def test_travel_rests_when_too_slow(map_factory, hex_factory, faction_factory):
    m = map_factory()
    a = hex_factory(map=m, row=0, col=0)
    b = hex_factory(map=m, row=1, col=0)
    f = faction_factory(current_hex=a, speed=0, max_speed=5)
    assert travel(f, b, tick_number=1).action == Action.REST
    f.refresh_from_db()
    assert f.current_hex_id == a.id  # did not move
    assert f.speed == 5  # rested


# --- _select_action ladder ---------------------------------------------------

def test_next_action_is_respected(map_factory, hex_factory, faction_factory):
    m = map_factory()
    a = hex_factory(map=m, row=0, col=0)
    f = faction_factory(current_hex=a, speed=1, max_speed=4, next_action=Action.REST)
    assert _select_action(f, [], None, tick_number=1).action == Action.REST


def test_next_action_cleared_by_tick_faction(map_factory, hex_factory, faction_factory):
    m = map_factory()
    a = hex_factory(map=m, row=0, col=0)
    f = faction_factory(current_hex=a, next_action=Action.SUPPLY)
    tick_faction(f, _tick(m, 1), [], None)
    f.refresh_from_db()
    assert f.next_action is None
    assert f.current_action == Action.SUPPLY


def test_destination_steps_toward_target(map_factory, hex_factory, faction_factory):
    m = map_factory()
    a = hex_factory(map=m, row=0, col=0)
    b = hex_factory(map=m, row=1, col=0)
    f = faction_factory(current_hex=a, speed=5, max_speed=5, destination=b)
    result = _select_action(f, adjacent_hexes(a, [a, b]), None, tick_number=1)
    assert result.action == Action.TRAVEL
    f.refresh_from_db()
    assert f.current_hex_id == b.id


def test_destination_cleared_on_arrival(map_factory, hex_factory, faction_factory):
    m = map_factory()
    a = hex_factory(map=m, row=0, col=0)
    f = faction_factory(current_hex=a, destination=a)
    _select_action(f, [], None, tick_number=2)  # night: rests after clearing
    f.refresh_from_db()
    assert f.destination_id is None


def test_night_rests(map_factory, hex_factory, faction_factory):
    m = map_factory()
    a = hex_factory(map=m, row=0, col=0)
    f = faction_factory(current_hex=a, speed=1, max_speed=4)
    assert _select_action(f, [], None, tick_number=2).action == Action.REST


def test_day_d3_supply_on_three(map_factory, hex_factory, faction_factory, force_d3):
    m = map_factory()
    a = hex_factory(map=m, row=0, col=0)
    b = hex_factory(map=m, row=1, col=0)
    f = faction_factory(current_hex=a, speed=5, max_speed=5)
    force_d3(3)
    assert _select_action(f, adjacent_hexes(a, [a, b]), None, tick_number=1).action == Action.SUPPLY


def test_day_d3_travel_on_one(map_factory, hex_factory, faction_factory, force_d3):
    m = map_factory()
    a = hex_factory(map=m, row=0, col=0)
    b = hex_factory(map=m, row=1, col=0)
    f = faction_factory(current_hex=a, speed=5, max_speed=5)
    force_d3(1)
    assert _select_action(f, adjacent_hexes(a, [a, b]), None, tick_number=1).action == Action.TRAVEL


def test_wander_respects_allowed_hexes(map_factory, hex_factory, faction_factory, force_d3):
    m = map_factory()
    a = hex_factory(map=m, row=0, col=0)
    b = hex_factory(map=m, row=1, col=0)
    f = faction_factory(current_hex=a, speed=5, max_speed=5)
    force_d3(1)  # day movement, but empty allowed set -> nowhere to go -> rest
    assert _select_action(f, adjacent_hexes(a, [a, b]), set(), tick_number=1).action == Action.REST


# --- FactionTick snapshot ----------------------------------------------------

def test_tick_faction_snapshots_reduced_fields(map_factory, hex_factory, faction_factory):
    m = map_factory()
    a = hex_factory(map=m, row=0, col=0)
    f = faction_factory(current_hex=a, population=42, speed=3, next_action=Action.REST)
    ft = tick_faction(f, _tick(m, 2), [], None)
    assert ft.population == 42
    assert ft.action == Action.REST
    assert ft.current_hex_id == a.id
