"""Pinning tests for the hex endpoints in world/api.py."""
import pytest

from world.models import Hex, PointOfInterest, TerrainType

pytestmark = pytest.mark.django_db


class TestBulkPatch:
    def test_bulk_patch_updates_selected_hexes(self, client, map_factory, hex_factory):
        m = map_factory()
        a = hex_factory(map=m, row=0, col=0)
        b = hex_factory(map=m, row=0, col=1)
        resp = client.post('/api/hexes/bulk-patch/', {
            'ids': [a.id, b.id],
            'has_roads': True,
            'player_visible': True,
        })
        assert resp.status_code == 200
        assert resp.json()['updated'] == 2
        a.refresh_from_db(); b.refresh_from_db()
        assert a.has_roads is True and b.has_roads is True
        assert a.player_visible is True and b.player_visible is True

    def test_bulk_patch_empty_ids_updates_zero(self, client):
        resp = client.post('/api/hexes/bulk-patch/', {'ids': [], 'has_roads': True})
        assert resp.status_code == 200
        assert resp.json()['updated'] == 0

    def test_bulk_patch_no_fields_updates_zero(self, client, hex_factory):
        h = hex_factory()
        resp = client.post('/api/hexes/bulk-patch/', {'ids': [h.id]})
        assert resp.status_code == 200
        assert resp.json()['updated'] == 0


class TestPatchHex:
    def test_patch_hex_sets_fields_and_returns_schema(self, client, hex_factory):
        h = hex_factory(terrain_type=TerrainType.PLAINS)
        resp = client.patch(f'/api/hexes/{h.id}/', {
            'terrain_type': str(TerrainType.SWAMP),
            'resources': 12,
            'player_explored': True,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body['resources'] == 12
        assert body['player_explored'] is True
        # terrain_difficulty is a derived property exposed on the schema
        assert 'terrain_difficulty' in body
        h.refresh_from_db()
        assert h.resources == 12

    def test_patch_missing_hex_404(self, client):
        resp = client.patch('/api/hexes/999999/', {'resources': 1})
        assert resp.status_code == 404


class TestCreatePoi:
    def test_create_poi_on_hex(self, client, hex_factory):
        h = hex_factory()
        resp = client.post(f'/api/hexes/{h.id}/pois/', {
            'poi_type': 'dungeon',
            'name': 'Deep Hole',
            'difficulty': 3,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body['poi_type'] == 'dungeon'
        assert body['name'] == 'Deep Hole'
        assert PointOfInterest.objects.filter(hex=h, name='Deep Hole').exists()

    def test_create_poi_missing_hex_404(self, client):
        resp = client.post('/api/hexes/999999/pois/', {'poi_type': 'ruin'})
        assert resp.status_code == 404


class TestListHexes:
    def test_list_hexes_includes_pois(self, client, map_factory, hex_factory):
        m = map_factory()
        h = hex_factory(map=m, row=0, col=0)
        PointOfInterest.objects.create(hex=h, poi_type='dungeon', name='D1')
        hex_factory(map=m, row=1, col=0)
        resp = client.get(f'/api/maps/{m.id}/hexes/')
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 2
        with_pois = [hx for hx in body if hx['pois']]
        assert with_pois and with_pois[0]['pois'][0]['name'] == 'D1'

    def test_list_hexes_missing_map_404(self, client):
        resp = client.get('/api/maps/999999/hexes/')
        assert resp.status_code == 404
