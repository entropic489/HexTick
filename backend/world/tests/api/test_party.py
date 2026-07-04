"""Pinning tests for the party endpoints (get, action branches, notes, supplies, patch)."""
import pytest

from world.models import Hex, PointOfInterest, TerrainType

pytestmark = pytest.mark.django_db


@pytest.fixture
def regional(map_factory, hex_factory, party_factory):
    """A regional map with two plains hexes and a party on hex `a` with speed to move."""
    m = map_factory(map_type='regional')
    a = hex_factory(map=m, row=0, col=0)
    b = hex_factory(map=m, row=0, col=1)
    party = party_factory(map=m, current_hex=a, speed=5, max_speed=5)
    return {'map': m, 'a': a, 'b': b, 'party': party}


class TestGetParty:
    def test_get_party(self, client, regional):
        resp = client.get(f"/api/maps/{regional['map'].id}/party/")
        assert resp.status_code == 200
        assert resp.json()['id'] == regional['party'].id

    def test_get_party_missing_404(self, client, map_factory):
        m = map_factory()
        assert client.get(f'/api/maps/{m.id}/party/').status_code == 404


class TestMove:
    def test_move_deducts_speed_and_advances_hex(self, client, regional):
        p = regional['party']
        resp = client.post(f'/api/party/{p.id}/action/', {'action': 'move', 'hex_id': regional['b'].id})
        assert resp.status_code == 200
        body = resp.json()
        assert body['terrain_type'] == str(TerrainType.PLAINS)
        assert body['party_tick_id'] > 0
        p.refresh_from_db()
        assert p.current_hex_id == regional['b'].id
        assert p.speed == 4  # 5 - plains day cost (1)

    def test_move_gated_by_speed_returns_400(self, client, map_factory, hex_factory, party_factory):
        m = map_factory(map_type='regional')
        a = hex_factory(map=m, row=0, col=0)
        b = hex_factory(map=m, row=0, col=1, terrain_type=TerrainType.SWAMP)
        p = party_factory(map=m, current_hex=a, speed=0, max_speed=5)
        resp = client.post(f'/api/party/{p.id}/action/', {'action': 'move', 'hex_id': b.id})
        assert resp.status_code == 400
        assert 'rest' in resp.json()['detail'].lower()

    def test_move_without_hex_id_400(self, client, regional):
        resp = client.post(f"/api/party/{regional['party'].id}/action/", {'action': 'move'})
        assert resp.status_code == 400

    def test_move_cross_map_400(self, client, regional, map_factory, hex_factory):
        other = map_factory(name='Other')
        far = hex_factory(map=other, row=0, col=0)
        resp = client.post(f"/api/party/{regional['party'].id}/action/",
                          {'action': 'move', 'hex_id': far.id})
        assert resp.status_code == 400


class TestOtherActions:
    def test_search(self, client, regional):
        resp = client.post(f"/api/party/{regional['party'].id}/action/", {'action': 'search'})
        assert resp.status_code == 200
        regional['party'].refresh_from_db()
        assert regional['party'].current_action == 'search'

    def test_supply_with_amount_adds_supplies(self, client, regional):
        p = regional['party']
        resp = client.post(f'/api/party/{p.id}/action/', {'action': 'supply', 'amount': 5})
        assert resp.status_code == 200
        p.refresh_from_db()
        assert p.supplies == 5  # tick 1 is afternoon -> no consumption

    def test_delve_requires_dungeon_400(self, client, regional):
        resp = client.post(f"/api/party/{regional['party'].id}/action/", {'action': 'delve'})
        assert resp.status_code == 400

    def test_delve_marks_dungeon_explored(self, client, regional):
        PointOfInterest.objects.create(hex=regional['a'], poi_type='dungeon', name='Pit', hidden=False)
        resp = client.post(f"/api/party/{regional['party'].id}/action/", {'action': 'delve'})
        assert resp.status_code == 200
        assert PointOfInterest.objects.get(name='Pit').player_explored is True

    def test_explore_requires_poi_id_400(self, client, regional):
        resp = client.post(f"/api/party/{regional['party'].id}/action/", {'action': 'explore'})
        assert resp.status_code == 400

    def test_explore_marks_poi_explored(self, client, regional):
        poi = PointOfInterest.objects.create(hex=regional['a'], poi_type='ruin', name='Arch')
        resp = client.post(f"/api/party/{regional['party'].id}/action/",
                          {'action': 'explore', 'poi_id': poi.id})
        assert resp.status_code == 200
        poi.refresh_from_db()
        assert poi.player_explored is True

    def test_social(self, client, regional):
        resp = client.post(f"/api/party/{regional['party'].id}/action/", {'action': 'social'})
        assert resp.status_code == 200

    def test_rest_resets_speed_to_max(self, client, map_factory, hex_factory, party_factory):
        m = map_factory(map_type='regional')
        a = hex_factory(map=m, row=0, col=0)
        p = party_factory(map=m, current_hex=a, speed=0, max_speed=5)
        resp = client.post(f'/api/party/{p.id}/action/', {'action': 'rest'})
        assert resp.status_code == 200
        p.refresh_from_db()
        assert p.speed == 5

    def test_clear_lost_when_not_lost_400(self, client, regional):
        resp = client.post(f"/api/party/{regional['party'].id}/action/", {'action': 'clear_lost'})
        assert resp.status_code == 400

    def test_clear_lost_clears_flag(self, client, map_factory, hex_factory, party_factory):
        m = map_factory(map_type='regional')
        a = hex_factory(map=m, row=0, col=0)
        p = party_factory(map=m, current_hex=a, speed=5, max_speed=5, is_lost=True)
        resp = client.post(f'/api/party/{p.id}/action/', {'action': 'clear_lost'})
        assert resp.status_code == 200
        p.refresh_from_db()
        assert p.is_lost is False

    def test_unknown_action_400(self, client, regional):
        resp = client.post(f"/api/party/{regional['party'].id}/action/", {'action': 'teleport'})
        assert resp.status_code == 400


class TestCityMapActions:
    def test_supply_and_rest_on_city_map_do_not_crash(self, client, map_factory, hex_factory, party_factory):
        # Regression guard for C2 (fixed): supply/rest on a city map used to hit
        # UnboundLocalError on `rolls`. Both must return 200. A tick is seeded
        # first so the sub-shift PartyTick has a non-null tick (see
        # test_first_action_on_fresh_city_map_500 for why that matters).
        m = map_factory(map_type='city')
        a = hex_factory(map=m, row=0, col=0)
        p = party_factory(map=m, current_hex=a, speed=3, max_speed=5)
        client.post('/api/tick/', {'map_id': m.id, 'mode': 'shift'})  # establish current_tick
        assert client.post(f'/api/party/{p.id}/action/', {'action': 'supply'}).status_code == 200
        assert client.post(f'/api/party/{p.id}/action/', {'action': 'rest'}).status_code == 200

    def test_first_action_on_fresh_city_map_500(self, client, map_factory, hex_factory, party_factory):
        # CHARACTERIZATION — pins a newly-observed edge bug (NOT in code-review.md):
        # a city map's first party action is a mid-shift sub-tick (sub_tick 0->1,
        # not a shift), so no Tick is created and map.current_tick is still None.
        # _create_party_tick then inserts a PartyTick with tick=None ->
        # IntegrityError -> 500. Rewrite if the app seeds an initial tick or makes
        # PartyTick.tick nullable.
        m = map_factory(map_type='city')
        a = hex_factory(map=m, row=0, col=0)
        p = party_factory(map=m, current_hex=a, speed=3, max_speed=5)
        resp = client.post(f'/api/party/{p.id}/action/', {'action': 'supply'})
        assert resp.status_code == 500


class TestPartyActionNoHex:
    def test_non_move_action_without_hex_500(self, client, party_factory, map_factory):
        # CHARACTERIZATION — pins H6: for a party with current_hex=None, map_id is
        # never derived (party.map is ignored), so _run_shift(None) raises and the
        # request 500s. Rewrite to expect 200/400 once H6 falls back to party.map.
        m = map_factory()
        p = party_factory(map=m, current_hex=None)
        resp = client.post(f'/api/party/{p.id}/action/', {'action': 'rest'})
        assert resp.status_code == 500


class TestPartyTickNotes:
    def test_notes_via_query_param(self, client, regional):
        p = regional['party']
        pt_id = client.post(f'/api/party/{p.id}/action/', {'action': 'search'}).json()['party_tick_id']
        resp = client.patch(f'/api/party/{p.id}/ticks/{pt_id}/notes/?notes=hello')
        assert resp.status_code == 200
        assert resp.json()['notes'] == 'hello'

    def test_notes_json_body_rejected_422(self, client, regional):
        # CHARACTERIZATION — pins M3: `notes` binds as a query param, so a JSON
        # body (what the frontend sends) leaves it unset -> 422.
        p = regional['party']
        pt_id = client.post(f'/api/party/{p.id}/action/', {'action': 'search'}).json()['party_tick_id']
        resp = client.patch(f'/api/party/{p.id}/ticks/{pt_id}/notes/', {'notes': 'hi'})
        assert resp.status_code == 422


class TestPatchParty:
    def test_patch_supplies_endpoint_floors_negative(self, client, regional):
        p = regional['party']
        assert client.patch(f'/api/party/{p.id}/supplies/', {'supplies': 9}).json()['supplies'] == 9
        assert client.patch(f'/api/party/{p.id}/supplies/', {'supplies': -3}).json()['supplies'] == 0

    def test_patch_party_updates_fields_and_explores_hex(self, client, regional):
        p = regional['party']
        resp = client.patch(f'/api/party/{p.id}/', {'speed': 2, 'current_hex': regional['b'].id})
        assert resp.status_code == 200
        p.refresh_from_db()
        assert p.speed == 2
        assert p.current_hex_id == regional['b'].id
        assert Hex.objects.get(id=regional['b'].id).player_explored is True

    def test_patch_party_all_scalar_fields(self, client, regional):
        p = regional['party']
        resp = client.patch(f'/api/party/{p.id}/', {
            'player_count': 4,
            'supplies': 8,
            'tracks_supplies': False,
            'speed': 3,
            'max_speed': 6,
            'resource_generation': 2,
            'current_action': 'train',
        })
        assert resp.status_code == 200
        p.refresh_from_db()
        assert p.player_count == 4
        assert p.supplies == 8
        assert p.tracks_supplies is False
        assert p.speed == 3
        assert p.max_speed == 6
        assert p.resource_generation == 2
        assert p.current_action == 'train'

    def test_patch_party_missing_404(self, client):
        assert client.patch('/api/party/999999/', {'speed': 1}).status_code == 404
