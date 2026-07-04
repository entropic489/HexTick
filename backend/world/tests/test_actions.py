"""Engine tests for world/actions.py: _select_action branches, the individual
action functions, and tick_faction's daily/weekly/death paths.

Randomness is pinned per test via `fixed_randint` (a queue of return values) and a
module-wide no-op `random.shuffle`, so branch outcomes are deterministic. Tests
marked CHARACTERIZATION pin known-buggy behavior documented in
design_docs/code-review.md (H2, M2) and are expected to change when the fix lands.
"""
import pytest

from world import actions
from world.actions import (
    battle, craft, delve, merge, random_encounter, tick_faction, train,
    travel, trade, _select_action,
)
from world.models import PointOfInterest, TerrainType, Tick
from world.models.faction import Action

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def no_shuffle(monkeypatch):
    """Make candidate ordering deterministic so 'best'/'step' picks are stable."""
    monkeypatch.setattr('world.actions.random.shuffle', lambda seq: None)


@pytest.fixture
def fixed_randint(monkeypatch):
    def _set(*values):
        it = iter(values)
        monkeypatch.setattr('world.actions.random.randint', lambda a, b: next(it))
    return _set


# --- _select_action branches -------------------------------------------------

class TestSelectAction:
    def test_arrival_clears_destination(self, map_factory, hex_factory, faction_factory):
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0, resources=99)
        f = faction_factory(current_hex=h, destination=h)  # already at destination
        _select_action(f, nearby_factions=[], candidate_hexes=[], tick_number=0)
        assert f.destination is None

    def test_detour_around_blocking_faction(self, map_factory, hex_factory, faction_factory):
        m = map_factory()
        start = hex_factory(map=m, row=0, col=0)
        far = hex_factory(map=m, row=0, col=5)
        step_a = hex_factory(map=m, row=0, col=1)
        step_b = hex_factory(map=m, row=1, col=0)
        f = faction_factory(current_hex=start, destination=far, speed=9, last_action=None)
        blocker = faction_factory(current_hex=start, agreeableness=10)
        result = _select_action(f, nearby_factions=[blocker],
                                candidate_hexes=[step_a, step_b], tick_number=0)
        assert result.action == Action.TRAVEL

    def test_hostile_out_of_hex_steps_toward_target(self, map_factory, hex_factory, faction_factory):
        m = map_factory()
        here = hex_factory(map=m, row=0, col=0)
        adj = hex_factory(map=m, row=0, col=1)
        enemy_hex = hex_factory(map=m, row=0, col=2)
        f = faction_factory(current_hex=here, agreeableness=-20, last_action=None,
                            scouting=5, speed=9, combat_skill=20)
        enemy = faction_factory(current_hex=enemy_hex, combat_skill=20)
        result = _select_action(f, nearby_factions=[enemy], candidate_hexes=[adj], tick_number=0)
        assert result.action == Action.TRAVEL

    def test_outmatched_faction_flees(self, map_factory, hex_factory, faction_factory):
        m = map_factory()
        here = hex_factory(map=m, row=0, col=0)
        enemy_hex = hex_factory(map=m, row=0, col=1)
        away = hex_factory(map=m, row=0, col=2, resources=5)
        f = faction_factory(current_hex=here, agreeableness=0, combat_skill=1,
                            scouting=5, speed=9, last_action=None)
        enemy = faction_factory(current_hex=enemy_hex, combat_skill=50)
        result = _select_action(f, nearby_factions=[enemy], candidate_hexes=[away], tick_number=0)
        assert result.action == Action.TRAVEL

    def test_battle_after_recent_battle_when_hostile_and_stronger(self, map_factory, hex_factory, faction_factory):
        m = map_factory()
        here = hex_factory(map=m, row=0, col=0)
        enemy_hex = hex_factory(map=m, row=0, col=1)
        # last_action == BATTLE skips the first hostile block; falls to the
        # `agreeableness < 0 and combat_skill >= closest` battle arm.
        f = faction_factory(current_hex=here, agreeableness=-20, combat_skill=30,
                            scouting=5, last_action=Action.BATTLE)
        enemy = faction_factory(current_hex=enemy_hex, combat_skill=10, current_action=None)
        result = _select_action(f, nearby_factions=[enemy], candidate_hexes=[], tick_number=0)
        assert result.action == Action.BATTLE

    def test_comfortable_faction_with_dungeon_still_supplies(self, map_factory, hex_factory, faction_factory):
        # CHARACTERIZATION — pins H2: the comfort>=0 arm returns supply, so the
        # delve/craft/train tail below it is unreachable for a comfortable faction
        # even when a valid dungeon is present. Rewrite when H2 reorders the chain.
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0, resources=100)
        PointOfInterest.objects.create(hex=h, poi_type='dungeon', name='D', hidden=False, difficulty=1)
        f = faction_factory(current_hex=h, population=10, resources=100, theology=90)
        result = _select_action(f, nearby_factions=[], candidate_hexes=[], tick_number=0)
        assert result.action == Action.SUPPLY


# --- Action functions --------------------------------------------------------

class TestTravel:
    def test_speed_fallback_supplies_when_too_slow(self, map_factory, hex_factory, faction_factory):
        m = map_factory()
        here = hex_factory(map=m, row=0, col=0)
        dest = hex_factory(map=m, row=0, col=1, terrain_type=TerrainType.SWAMP)
        f = faction_factory(current_hex=here, speed=0)  # 0 < swamp cost -> fallback
        result = travel(f, dest, tick_number=0)
        assert result.action == Action.SUPPLY
        assert f.current_hex_id == here.id  # did not move

    def test_travel_moves_and_pays_cost(self, map_factory, hex_factory, faction_factory, fixed_randint):
        fixed_randint(10)  # random_encounter -> empty-note bucket
        m = map_factory()
        here = hex_factory(map=m, row=0, col=0)
        dest = hex_factory(map=m, row=0, col=1, encounter_likelihood=0)
        f = faction_factory(current_hex=here, speed=5)
        result = travel(f, dest, tick_number=0)
        assert result.action == Action.TRAVEL
        assert f.current_hex_id == dest.id
        assert f.speed == 4


class TestTrade:
    def test_trade_offering_resources(self, map_factory, hex_factory, faction_factory):
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        a = faction_factory(current_hex=h, resources=100, technology=10, population=50)
        b = faction_factory(current_hex=h, resources=100, technology=10, population=10)
        result = trade(a, b)
        assert result.action == Action.TRADE
        # a offered resources (resources >= technology): a loses resources, gains tech
        assert a.resources < 100 and a.technology > 10


class TestBattle:
    def test_battle_against_traveler_is_deterministic(self, map_factory, hex_factory, faction_factory):
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        a = faction_factory(current_hex=h, combat_skill=10)
        b = faction_factory(current_hex=h, combat_skill=10, population=50,
                            speed=1, current_action=Action.TRAVEL)
        result = battle(a, b)
        assert result.action == Action.BATTLE
        b.refresh_from_db()
        assert b.population == 50 - (10 // 2)  # took combat_skill//2 damage
        assert b.speed == 4                     # +3 speed

    def test_battle_can_push_loser_population_negative(self, map_factory, hex_factory,
                                                       faction_factory, fixed_randint):
        # CHARACTERIZATION — pins M2: battle applies no floors, so a weak loser's
        # population goes negative (only clamped to 0 later, in tick_faction).
        fixed_randint(1, 20)  # faction_roll=1+skill, other_roll=20+skill -> other wins
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        weak = faction_factory(current_hex=h, combat_skill=1, population=5, current_action=None)
        strong = faction_factory(current_hex=h, combat_skill=20, population=50, current_action=None)
        battle(weak, strong)
        weak.refresh_from_db()
        assert weak.population < 0  # 5 - 20


class TestSimpleActions:
    def test_train_increases_combat_skill(self, faction_factory, fixed_randint):
        fixed_randint(4)
        # combat_skill_max is a property derived from pop/tech/resources; boost
        # them so the +roll isn't clamped below the increase.
        f = faction_factory(combat_skill=1, population=100, technology=100, resources=100)
        result = train(f)
        assert result.action == Action.TRAIN
        assert result.dice_roll == 4
        assert f.combat_skill == 5

    def test_craft_increases_technology(self, faction_factory, fixed_randint):
        fixed_randint(3)
        f = faction_factory(technology=5, technology_max=50)
        result = craft(f)
        assert result.action == Action.CRAFT
        assert f.technology == 8

    def test_delve_success_raises_tech_ceiling_and_costs_theology(self, map_factory, hex_factory,
                                                                  faction_factory, fixed_randint):
        fixed_randint(20)  # high roll -> success
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        dungeon = PointOfInterest.objects.create(hex=h, poi_type='dungeon', name='D',
                                                 difficulty=1, technology_max_modifier=5)
        f = faction_factory(current_hex=h, theology=90, technology_max=30)
        result = delve(f, dungeon)
        assert result.action == Action.DELVE
        assert result.success is True
        assert f.technology_max == 35
        assert f.theology == 85

    def test_merge_absorbs_other(self, map_factory, hex_factory, faction_factory):
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        a = faction_factory(current_hex=h, population=30, resources=10)
        b = faction_factory(current_hex=h, population=20, resources=40)
        result = merge(a, b)
        assert result.action == Action.MERGE
        assert a.population == 50 and a.resources == 50
        assert b.population == 0


class TestRandomEncounter:
    @pytest.mark.parametrize('roll,fragment', [
        (3, 'monster encounter'),
        (10, ''),
    ])
    def test_encounter_message_buckets(self, map_factory, hex_factory, faction_factory,
                                       fixed_randint, roll, fragment):
        fixed_randint(roll)
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0, encounter_likelihood=0)
        f = faction_factory(current_hex=h)
        note = random_encounter(f, h)
        assert fragment in note

    def test_encounter_found_resources(self, map_factory, hex_factory, faction_factory, fixed_randint):
        fixed_randint(20, 7)  # roll=20 -> resource bucket, then gained=7
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0, encounter_likelihood=0)
        f = faction_factory(current_hex=h, resources=10)
        note = random_encounter(f, h)
        assert 'found resources' in note
        assert f.resources == 17


# --- tick_faction daily / weekly / death -------------------------------------

class TestTickFactionPeriodic:
    def test_daily_tick_resets_speed_and_consumes_resources(self, map_factory, hex_factory, faction_factory):
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        tick = Tick.objects.create(map=m, number=3)  # 3 % 3 == 0 -> daily
        # max_speed is a computed property (== modifier((pop+res+tech)//3) == 5 here)
        f = faction_factory(current_hex=h, is_gm_faction=True, current_action=Action.TRAIN,
                            speed=0, resources=100, population=50, technology=20)
        assert f.max_speed == 5
        tick_faction(f, tick, nearby_factions=[], candidate_hexes=[])
        f.refresh_from_db()
        assert f.speed == 5              # reset to max on daily tick (was 0)
        assert f.resources < 100         # consumed modifier(population)

    def test_daily_tick_increments_famine_streak_at_zero_resources(self, map_factory, hex_factory, faction_factory):
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        tick = Tick.objects.create(map=m, number=3)
        f = faction_factory(current_hex=h, is_gm_faction=True, current_action=Action.SUPPLY,
                            resources=0, famine_streak=2, population=50)
        tick_faction(f, tick, nearby_factions=[], candidate_hexes=[])
        f.refresh_from_db()
        assert f.famine_streak == 3

    def test_weekly_population_trend_applies(self, map_factory, hex_factory, faction_factory, fixed_randint):
        fixed_randint(20)  # + population_trend -> >= 20 branch: +2 population
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        tick = Tick.objects.create(map=m, number=21)  # 21 % 21 == 0 and % 3 == 0
        f = faction_factory(current_hex=h, is_gm_faction=True, current_action=Action.TRAIN,
                            population=50, resources=100)
        tick_faction(f, tick, nearby_factions=[], candidate_hexes=[])
        f.refresh_from_db()
        assert f.population >= 52

    def test_zero_population_marks_dead(self, map_factory, hex_factory, faction_factory):
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        tick = Tick.objects.create(map=m, number=1)
        f = faction_factory(current_hex=h, is_gm_faction=True, current_action=Action.TRAIN,
                            population=0)
        tick_faction(f, tick, nearby_factions=[], candidate_hexes=[])
        f.refresh_from_db()
        assert f.is_dead is True
