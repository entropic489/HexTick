"""Engine tests for the orchestration functions relocated to actions.py in S1:
`run_shift` (shift orchestration) and `perform_party_action` (party action rules).

These exercise the engine directly, without the HTTP layer — the API pinning suite
in tests/api/ covers the end-to-end request paths. `run_shift`/`perform_party_action`
take a row lock and create Tick rows, so every test runs under `django_db`.
"""
import pytest

from world.actions import run_shift, perform_party_action, PartyActionError, PartyActionOutcome
from world.models import Map, MapType, Tick, PartyTick, TerrainType
from world.models.party import Party
from world.models.faction import Action

pytestmark = pytest.mark.django_db


@pytest.fixture
def party_factory(db):
    def _make(map=None, current_hex=None, **kwargs):
        kwargs.setdefault('name', 'Test Party')
        return Party.objects.create(map=map, current_hex=current_hex, **kwargs)
    return _make


# --- run_shift ---------------------------------------------------------------

class TestRunShift:
    def test_creates_next_tick_and_advances_map(self, map_factory, hex_factory):
        m = map_factory()
        hex_factory(map=m, row=0, col=0)
        tick_number, events = run_shift(m.id)

        assert tick_number == 1
        assert events == []
        m.refresh_from_db()
        assert m.current_tick.number == 1
        assert Tick.objects.filter(map=m, number=1).exists()

    def test_increments_from_existing_current_tick(self, map_factory, hex_factory):
        m = map_factory()
        hex_factory(map=m, row=0, col=0)
        run_shift(m.id)
        second, _ = run_shift(m.id)

        assert second == 2
        m.refresh_from_db()
        assert m.current_tick.number == 2

    def test_ticks_hexes_and_factions(self, map_factory, hex_factory, faction_factory):
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        f = faction_factory(current_hex=h, name='Ticked')
        tick_number, _ = run_shift(m.id)

        tick = Tick.objects.get(map=m, number=tick_number)
        assert tick.hex_ticks.filter(hex=h).exists()
        assert tick.faction_ticks.filter(faction=f).exists()

    def test_dead_factions_excluded(self, map_factory, hex_factory, faction_factory):
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        dead = faction_factory(current_hex=h, name='Dead', is_dead=True)
        tick_number, _ = run_shift(m.id)

        tick = Tick.objects.get(map=m, number=tick_number)
        assert not tick.faction_ticks.filter(faction=dead).exists()


# --- perform_party_action ----------------------------------------------------

class TestPerformPartyAction:
    def test_returns_outcome_and_snapshots_party_tick(self, map_factory, hex_factory, party_factory):
        m = map_factory()
        a = hex_factory(map=m, row=0, col=0)
        p = party_factory(map=m, current_hex=a, speed=5, max_speed=5)

        outcome = perform_party_action(p, 'rest')

        assert isinstance(outcome, PartyActionOutcome)
        assert outcome.map_id == m.id
        assert outcome.tick_number == 1  # regional map: every action fires a shift
        pt = PartyTick.objects.get(id=outcome.party_tick.id)
        assert pt.action == Action.REST
        p.refresh_from_db()
        assert p.current_action == Action.REST

    def test_rest_resets_speed_to_max(self, map_factory, hex_factory, party_factory):
        m = map_factory()
        a = hex_factory(map=m, row=0, col=0)
        p = party_factory(map=m, current_hex=a, speed=1, max_speed=5)

        perform_party_action(p, 'rest')

        p.refresh_from_db()
        assert p.speed == 5

    def test_unknown_action_raises(self, map_factory, hex_factory, party_factory):
        m = map_factory()
        a = hex_factory(map=m, row=0, col=0)
        p = party_factory(map=m, current_hex=a)

        with pytest.raises(PartyActionError) as exc:
            perform_party_action(p, 'teleport')
        assert exc.value.status == 400
        assert 'teleport' in exc.value.detail

    def test_move_without_hex_id_raises(self, map_factory, hex_factory, party_factory):
        m = map_factory()
        a = hex_factory(map=m, row=0, col=0)
        p = party_factory(map=m, current_hex=a)

        with pytest.raises(PartyActionError) as exc:
            perform_party_action(p, 'move', hex_id=None)
        assert exc.value.status == 400

    def test_move_too_slow_raises(self, map_factory, hex_factory, party_factory):
        m = map_factory()
        a = hex_factory(map=m, row=0, col=0)
        b = hex_factory(map=m, row=1, col=0, terrain_type=TerrainType.MOUNTAIN)
        p = party_factory(map=m, current_hex=a, speed=0, max_speed=5)

        with pytest.raises(PartyActionError) as exc:
            perform_party_action(p, 'move', hex_id=b.id)
        assert exc.value.status == 400
        assert 'rest' in exc.value.detail.lower()

    def test_clear_lost_when_not_lost_raises(self, map_factory, hex_factory, party_factory):
        m = map_factory()
        a = hex_factory(map=m, row=0, col=0)
        p = party_factory(map=m, current_hex=a, is_lost=False)

        with pytest.raises(PartyActionError) as exc:
            perform_party_action(p, 'clear_lost')
        assert exc.value.status == 400

    def test_clear_lost_emits_navigation_update(self, map_factory, hex_factory, party_factory):
        m = map_factory()
        a = hex_factory(map=m, row=0, col=0)
        p = party_factory(map=m, current_hex=a, is_lost=True, speed=5, max_speed=5)

        outcome = perform_party_action(p, 'clear_lost')

        assert {'type': 'navigation_update', 'lost': False} in outcome.sse_messages
        p.refresh_from_db()
        assert p.is_lost is False

    def test_city_map_first_action_is_sub_tick_not_shift(self, map_factory, hex_factory, party_factory):
        # On a city map the first action is a mid-shift sub-tick (sub_tick 0->1),
        # so run_shift does NOT fire. Note this pins the H7 crash characterization at
        # the engine level: with no current_tick, the PartyTick snapshot hits the
        # non-null tick FK and raises. Rewrite when H7 is fixed.
        from django.db import IntegrityError

        m = map_factory(map_type=MapType.CITY)
        a = hex_factory(map=m, row=0, col=0)
        p = party_factory(map=m, current_hex=a, speed=3, max_speed=5)

        with pytest.raises(IntegrityError):
            perform_party_action(p, 'supply')

    def test_city_map_sub_tick_after_seeded_tick(self, map_factory, hex_factory, party_factory):
        # With a tick already present, a city-map action is a sub-tick: no new Tick,
        # the PartyTick reuses the current tick, and sub_tick advances 0->1.
        m = map_factory(map_type=MapType.CITY)
        a = hex_factory(map=m, row=0, col=0)
        run_shift(m.id)  # seed tick 1 so current_tick is set
        m.refresh_from_db()
        p = party_factory(map=m, current_hex=a, speed=3, max_speed=5)

        outcome = perform_party_action(p, 'supply')

        m.refresh_from_db()
        assert outcome.tick_number == 1  # no new shift fired
        assert m.sub_tick == 1
        assert Tick.objects.filter(map=m).count() == 1
        assert outcome.party_tick.sub_tick == 1
