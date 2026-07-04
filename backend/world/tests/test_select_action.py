import pytest

from world.actions import _select_action
from world.models.faction import Action

pytestmark = pytest.mark.django_db


def test_comfortable_hex_supplies(map_factory, hex_factory, faction_factory):
    map_obj = map_factory()
    hex_a = hex_factory(map=map_obj, row=0, col=0, resources=0)
    faction = faction_factory(
        current_hex=hex_a, population=50, technology=20, resources=50,
    )  # comfort = 50 - 50 + 0 = 0 -> supply

    result = _select_action(faction, nearby_factions=[], candidate_hexes=[], tick_number=0)

    assert result.action == Action.SUPPLY


def test_uncomfortable_hex_with_candidate_travels(map_factory, hex_factory, faction_factory):
    map_obj = map_factory()
    hex_a = hex_factory(map=map_obj, row=0, col=0, resources=0)
    hex_b = hex_factory(map=map_obj, row=0, col=1, resources=0)
    faction = faction_factory(
        current_hex=hex_a, population=50, technology=20, resources=200, speed=4,
    )  # comfort = 50 - 200 + 0 = -150 -> travel

    result = _select_action(
        faction, nearby_factions=[], candidate_hexes=[hex_b], tick_number=0,
    )

    assert result.action == Action.TRAVEL
    assert faction.current_hex_id == hex_b.id


def test_destination_set_steps_one_hex_toward_it(map_factory, hex_factory, faction_factory):
    map_obj = map_factory()
    hex_start = hex_factory(map=map_obj, row=0, col=0)
    hex_mid = hex_factory(map=map_obj, row=0, col=1)
    hex_dest = hex_factory(map=map_obj, row=0, col=3)
    faction = faction_factory(current_hex=hex_start, destination=hex_dest, speed=4)

    result = _select_action(
        faction, nearby_factions=[], candidate_hexes=[hex_mid], tick_number=0,
    )

    assert result.action == Action.TRAVEL
    assert faction.current_hex_id == hex_mid.id  # one step, not a teleport to the destination


def test_disagreeable_faction_battles_hostile_on_same_hex(map_factory, hex_factory, faction_factory):
    map_obj = map_factory()
    hex_a = hex_factory(map=map_obj, row=0, col=0)
    faction = faction_factory(current_hex=hex_a, agreeableness=-10, last_action=None)
    other = faction_factory(current_hex=hex_a)

    result = _select_action(
        faction, nearby_factions=[other], candidate_hexes=[], tick_number=0,
    )

    assert result.action == Action.BATTLE


def test_agreeable_nearby_faction_trades(map_factory, hex_factory, faction_factory):
    map_obj = map_factory()
    hex_a = hex_factory(map=map_obj, row=0, col=0)
    faction = faction_factory(
        current_hex=hex_a, agreeableness=0, last_action=None, combat_skill=20,
    )
    other = faction_factory(current_hex=hex_a, agreeableness=10, combat_skill=20)

    result = _select_action(
        faction, nearby_factions=[other], candidate_hexes=[], tick_number=0,
    )

    assert result.action == Action.TRADE
