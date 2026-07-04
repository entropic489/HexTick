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

    def test_faction_without_hex_is_omitted(self, client, map_factory, hex_factory, faction_factory):
        # CHARACTERIZATION — pins M8: map membership is inferred from current_hex,
        # so a faction with current_hex=None vanishes from the list entirely
        # despite still existing in the DB.
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        faction_factory(current_hex=h, name='Visible')
        Faction.objects.create(name='Ghost', current_hex=None)
        resp = client.get(f'/api/maps/{m.id}/factions/')
        names = {f['name'] for f in resp.json()}
        assert names == {'Visible'}
        assert Faction.objects.filter(name='Ghost').exists()

    def test_list_missing_map_404(self, client):
        assert client.get('/api/maps/999999/factions/').status_code == 404


class TestCreateFaction:
    def test_create_faction_on_hex(self, client, map_factory, hex_factory):
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        resp = client.post(f'/api/maps/{m.id}/factions/', {
            'name': 'Kobolds', 'current_hex': h.id, 'combat_skill': 7,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body['name'] == 'Kobolds'
        assert body['current_hex'] == h.id
        assert body['combat_skill'] == 7

    def test_create_faction_drops_notes(self, client, map_factory, hex_factory):
        # CHARACTERIZATION — pins M7: FactionCreateSchema accepts `notes` but the
        # create() call never forwards it, so it is silently discarded.
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        resp = client.post(f'/api/maps/{m.id}/factions/', {
            'name': 'Silent', 'current_hex': h.id, 'notes': 'should be dropped',
        })
        assert resp.status_code == 200
        assert resp.json()['notes'] == ''
        assert Faction.objects.get(name='Silent').notes == ''


class TestPatchFaction:
    def test_patch_scalar_fields(self, client, faction_factory):
        f = faction_factory(name='Nomads', agreeableness=0)
        resp = client.patch(f'/api/factions/{f.id}/', {'agreeableness': -40, 'speed': 6})
        assert resp.status_code == 200
        body = resp.json()
        assert body['agreeableness'] == -40
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

    def test_patch_knowledge_and_allowed_hexes_set(self, client, map_factory, hex_factory, faction_factory):
        m = map_factory()
        a = hex_factory(map=m, row=0, col=0)
        b = hex_factory(map=m, row=1, col=0)
        f = faction_factory(current_hex=a)
        k1 = m.knowledge.create(title='K1')
        k2 = m.knowledge.create(title='K2')
        resp = client.patch(f'/api/factions/{f.id}/', {
            'knowledge': [k1.id, k2.id],
            'movement_restricted': True,
            'allowed_hexes': [a.id, b.id],
        })
        assert resp.status_code == 200
        body = resp.json()
        assert set(body['knowledge']) == {k1.id, k2.id}
        assert set(body['allowed_hexes']) == {a.id, b.id}
        assert body['movement_restricted'] is True

    def test_patch_missing_faction_404(self, client):
        assert client.patch('/api/factions/999999/', {'speed': 1}).status_code == 404
