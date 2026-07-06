"""Pinning tests for the tick endpoints (post_tick, current, list, state, reset)."""
import pytest

from world.models import FactionTick, Tick

pytestmark = pytest.mark.django_db


class TestPostTick:
    def test_shift_advances_tick_by_one(self, client, map_factory, hex_factory):
        m = map_factory()
        hex_factory(map=m, row=0, col=0)
        resp = client.post('/api/tick/', {'map_id': m.id, 'mode': 'shift'})
        assert resp.status_code == 200
        assert resp.json()['tick_number'] == 1
        m.refresh_from_db()
        assert m.current_tick.number == 1

    def test_day_advances_three_ticks(self, client, map_factory, hex_factory):
        m = map_factory()
        hex_factory(map=m, row=0, col=0)
        resp = client.post('/api/tick/', {'map_id': m.id, 'mode': 'day'})
        assert resp.status_code == 200
        assert resp.json()['tick_number'] == 3

    def test_shift_broadcasts_on_commit(self, client, fake_redis, map_factory,
                                        hex_factory, django_capture_on_commit_callbacks):
        m = map_factory()
        hex_factory(map=m, row=0, col=0)
        with django_capture_on_commit_callbacks(execute=True):
            resp = client.post('/api/tick/', {'map_id': m.id, 'mode': 'shift'})
        assert resp.status_code == 200
        assert any(c == f'tick:{m.id}' for c, _ in fake_redis.published)

    def test_missing_map_404(self, client):
        assert client.post('/api/tick/', {'map_id': 999999, 'mode': 'shift'}).status_code == 404

    def test_shift_with_movement_restricted_faction(self, client, map_factory,
                                                     hex_factory, faction_factory):
        # Exercises the run_shift candidate-filtering branch for a non-GM,
        # movement_restricted faction (allowed_hexes gate).
        m = map_factory()
        a = hex_factory(map=m, row=0, col=0)
        b = hex_factory(map=m, row=1, col=0)
        f = faction_factory(current_hex=a, name='Penned', is_mobile=True,
                            movement_restricted=True)
        f.allowed_hexes.set([a])  # b is off-limits
        resp = client.post('/api/tick/', {'map_id': m.id, 'mode': 'shift'})
        assert resp.status_code == 200
        f.refresh_from_db()
        assert f.current_hex_id in {a.id, b.id}  # never left the map; b filtered out of candidates


class TestCurrentAndList:
    def test_current_tick_zero_before_any_tick(self, client, map_factory):
        m = map_factory()
        resp = client.get(f'/api/maps/{m.id}/tick/current/')
        assert resp.status_code == 200
        assert resp.json()['tick_number'] == 0

    def test_current_tick_after_shift(self, client, map_factory, hex_factory):
        m = map_factory()
        hex_factory(map=m, row=0, col=0)
        client.post('/api/tick/', {'map_id': m.id, 'mode': 'shift'})
        assert client.get(f'/api/maps/{m.id}/tick/current/').json()['tick_number'] == 1

    def test_list_ticks_returns_numbers_in_order(self, client, map_factory, hex_factory):
        m = map_factory()
        hex_factory(map=m, row=0, col=0)
        client.post('/api/tick/', {'map_id': m.id, 'mode': 'day'})  # ticks 1,2,3
        resp = client.get(f'/api/maps/{m.id}/ticks/')
        assert resp.status_code == 200
        assert resp.json() == [1, 2, 3]


class TestTickState:
    def test_state_returns_hex_and_faction_snapshots(self, client, map_factory,
                                                     hex_factory, faction_factory):
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        faction_factory(current_hex=h, name='Snap')
        client.post('/api/tick/', {'map_id': m.id, 'mode': 'shift'})
        resp = client.get(f'/api/maps/{m.id}/tick/1/state/')
        assert resp.status_code == 200
        body = resp.json()
        assert body['tick_number'] == 1
        assert len(body['hex_ticks']) == 1
        assert body['hex_ticks'][0]['hex_id'] == h.id
        assert len(body['faction_ticks']) == 1

    def test_state_missing_tick_404(self, client, map_factory):
        m = map_factory()
        assert client.get(f'/api/maps/{m.id}/tick/5/state/').status_code == 404


class TestResetToTick:
    def test_reset_deletes_future_ticks(self, client, map_factory, hex_factory):
        m = map_factory()
        hex_factory(map=m, row=0, col=0)
        client.post('/api/tick/', {'map_id': m.id, 'mode': 'day'})  # ticks 1,2,3
        resp = client.post(f'/api/maps/{m.id}/tick/1/reset/', {})
        assert resp.status_code == 200
        assert resp.json()['tick_number'] == 1
        assert list(Tick.objects.filter(map=m).values_list('number', flat=True)) == [1]
        m.refresh_from_db()
        assert m.current_tick.number == 1

    def test_reset_restores_faction_population(self, client, map_factory,
                                               hex_factory, faction_factory):
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        f = faction_factory(current_hex=h, name='Drift', population=50)
        client.post('/api/tick/', {'map_id': m.id, 'mode': 'shift'})  # tick 1 snapshot
        ft1 = FactionTick.objects.get(faction=f, tick__number=1)

        # Mutate live state after the snapshot, then reset back to tick 1.
        f.refresh_from_db()
        f.population = 12345
        f.save(update_fields=['population'])

        resp = client.post(f'/api/maps/{m.id}/tick/1/reset/', {})
        assert resp.status_code == 200
        f.refresh_from_db()
        assert f.population == ft1.population == 50

    def test_reset_restores_party_live_state(self, client, map_factory,
                                             hex_factory, party_factory):
        # H4: reset restores party live-state from the most recent PartyTick at or
        # before the target tick.
        m = map_factory()
        a = hex_factory(map=m, row=0, col=0)
        b = hex_factory(map=m, row=0, col=1)
        p = party_factory(map=m, current_hex=a, speed=9, max_speed=9)
        # Action on tick 1 snapshots the party on hex a; then move to b (tick 2).
        client.post(f'/api/party/{p.id}/action/', {'action': 'search'})
        client.post(f'/api/party/{p.id}/action/', {'action': 'move', 'hex_id': b.id})
        p.refresh_from_db()
        assert p.current_hex_id == b.id

        resp = client.post(f'/api/maps/{m.id}/tick/1/reset/', {})
        assert resp.status_code == 200
        p.refresh_from_db()
        assert p.current_hex_id == a.id

    def test_reset_zeroes_sub_tick(self, client, map_factory, hex_factory, party_factory):
        # H4: reset lands on a shift boundary, so Map.sub_tick is cleared.
        m = map_factory(map_type='city')
        a = hex_factory(map=m, row=0, col=0)
        p = party_factory(map=m, current_hex=a, speed=9, max_speed=9)
        client.post(f'/api/party/{p.id}/action/', {'action': 'search'})  # seeds tick 1, sub_tick 1
        m.refresh_from_db()
        assert m.sub_tick == 1
        client.post(f'/api/maps/{m.id}/tick/1/reset/', {})
        m.refresh_from_db()
        assert m.sub_tick == 0

    def test_reset_missing_tick_404(self, client, map_factory):
        m = map_factory()
        assert client.post(f'/api/maps/{m.id}/tick/9/reset/', {}).status_code == 404
