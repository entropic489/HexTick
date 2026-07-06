"""Pinning tests for the faction endpoints in world/api.py."""
import pytest

from world.models import Faction, Hex

pytestmark = pytest.mark.django_db


class TestListFactions:
    def test_list_returns_factions_on_map(self, client, map_factory, hex_factory, faction_factory):
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        faction_factory(current_hex=h, name='Orcs')
        resp = client.get(f'/api/maps/{m.id}/factions/')
        assert resp.status_code == 200
        assert {f['name'] for f in resp.json()} == {'Orcs'}

    def test_faction_with_cleared_hex_still_listed(self, client, map_factory, hex_factory, faction_factory):
        # M8 fixed: map membership is an explicit FK, so clearing current_hex no
        # longer removes the faction from its map's list.
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        faction_factory(current_hex=h, name='Visible')
        ghost = faction_factory(current_hex=h, name='Ghost')
        ghost.current_hex = None
        ghost.save(update_fields=['current_hex'])
        resp = client.get(f'/api/maps/{m.id}/factions/')
        names = {f['name'] for f in resp.json()}
        assert names == {'Visible', 'Ghost'}

    def test_list_missing_map_404(self, client):
        assert client.get('/api/maps/999999/factions/').status_code == 404


class TestCreateFaction:
    def test_create_faction_on_hex(self, client, map_factory, hex_factory):
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        resp = client.post(f'/api/maps/{m.id}/factions/', {
            'name': 'Kobolds', 'current_hex': h.id, 'max_speed': 7,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body['name'] == 'Kobolds'
        assert body['current_hex'] == h.id
        assert body['max_speed'] == 7

    def test_create_faction_forwards_notes(self, client, map_factory, hex_factory):
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        resp = client.post(f'/api/maps/{m.id}/factions/', {
            'name': 'Noted', 'current_hex': h.id, 'notes': 'kept',
        })
        assert resp.status_code == 200
        assert resp.json()['notes'] == 'kept'
        assert Faction.objects.get(name='Noted').notes == 'kept'


class TestPatchFaction:
    def test_patch_scalar_fields(self, client, faction_factory):
        f = faction_factory(name='Nomads')
        resp = client.patch(f'/api/factions/{f.id}/', {'population': 40, 'speed': 6})
        assert resp.status_code == 200
        body = resp.json()
        assert body['population'] == 40
        assert body['speed'] == 6

    def test_patch_current_hex_and_destination(self, client, map_factory, hex_factory, faction_factory):
        m = map_factory()
        a = hex_factory(map=m, row=0, col=0)
        b = hex_factory(map=m, row=1, col=0)
        f = faction_factory(current_hex=a)
        resp = client.patch(f'/api/factions/{f.id}/', {'destination': b.id})
        assert resp.status_code == 200
        assert resp.json()['destination'] == b.id
        f.refresh_from_db()
        assert f.destination_id == b.id

    def test_patch_allowed_hexes_set(self, client, map_factory, hex_factory, faction_factory):
        m = map_factory()
        a = hex_factory(map=m, row=0, col=0)
        b = hex_factory(map=m, row=1, col=0)
        f = faction_factory(current_hex=a)
        resp = client.patch(f'/api/factions/{f.id}/', {
            'movement_restricted': True,
            'allowed_hexes': [a.id, b.id],
        })
        assert resp.status_code == 200
        body = resp.json()
        assert set(body['allowed_hexes']) == {a.id, b.id}
        assert body['movement_restricted'] is True

    def test_patch_missing_faction_404(self, client):
        assert client.patch('/api/factions/999999/', {'speed': 1}).status_code == 404
