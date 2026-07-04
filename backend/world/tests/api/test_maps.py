"""Pinning tests for the map endpoints in world/api.py."""
import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from world.models import Hex, Map
from world.models.gallery import GalleryImage

from .conftest import make_png_bytes

pytestmark = pytest.mark.django_db


class TestListAndGet:
    def test_list_maps_returns_all(self, client, map_factory):
        map_factory(name='Alpha')
        map_factory(name='Beta')
        resp = client.get('/api/maps/')
        assert resp.status_code == 200
        names = {m['name'] for m in resp.json()}
        assert {'Alpha', 'Beta'} <= names

    def test_get_map_returns_schema_fields(self, client, map_factory):
        m = map_factory(name='Solo')
        resp = client.get(f'/api/maps/{m.id}/')
        assert resp.status_code == 200
        body = resp.json()
        assert body['id'] == m.id
        assert body['name'] == 'Solo'
        # defaults from the model
        assert body['map_type'] == 'regional'
        assert body['weather'] == 'fair'
        assert body['player_actions_locked'] is False

    def test_get_missing_map_404(self, client):
        resp = client.get('/api/maps/999999/')
        assert resp.status_code == 404


class TestLockWeatherHighlight:
    def test_set_locked_persists_and_broadcasts(self, client, fake_redis, map_factory):
        m = map_factory()
        resp = client.patch(f'/api/maps/{m.id}/locked/', {'locked': True})
        assert resp.status_code == 200
        assert resp.json()['player_actions_locked'] is True
        m.refresh_from_db()
        assert m.player_actions_locked is True
        # published synchronously (not wrapped in on_commit)
        channels = [c for c, _ in fake_redis.published]
        assert f'tick:{m.id}' in channels
        assert any(json.loads(msg).get('type') == 'map_update' for _, msg in fake_redis.published)

    def test_set_weather_persists_and_broadcasts(self, client, fake_redis, map_factory):
        m = map_factory()
        resp = client.patch(f'/api/maps/{m.id}/weather/', {'weather': 'inclement'})
        assert resp.status_code == 200
        assert resp.json()['weather'] == 'inclement'
        m.refresh_from_db()
        assert m.weather == 'inclement'
        assert any(json.loads(msg).get('weather') == 'inclement' for _, msg in fake_redis.published)

    def test_highlight_broadcasts_hex_id_without_db_backing(self, client, fake_redis, map_factory):
        m = map_factory()
        resp = client.post(f'/api/maps/{m.id}/highlight/', {'hex_id': 7})
        assert resp.status_code == 200
        assert resp.json() == {'hex_id': 7}
        assert any(json.loads(msg).get('type') == 'hex_highlight' for _, msg in fake_redis.published)

    def test_highlight_missing_map_404(self, client):
        resp = client.post('/api/maps/999999/highlight/', {'hex_id': None})
        assert resp.status_code == 404


class TestCreateMap:
    def test_create_from_image_path_bulk_creates_hexes(self, client, media_root):
        (media_root / 'src.png').write_bytes(make_png_bytes(size=(90, 90)))
        resp = client.post_multipart('/api/maps/', {
            'name': 'FromPath',
            'hex_size': 20,
            'origin_x': 0,
            'origin_y': 0,
            'image_path': 'src.png',
        })
        assert resp.status_code == 200
        new_id = resp.json()['id']
        # rows/cols inferred from image dims -> at least one hex created
        assert Hex.objects.filter(map_id=new_id).count() > 0

    def test_create_from_uploaded_image(self, client, media_root):
        upload = SimpleUploadedFile('m.png', make_png_bytes(), content_type='image/png')
        resp = client.post_multipart('/api/maps/', {
            'name': 'FromUpload',
            'hex_size': 30,
            'origin_x': 5,
            'origin_y': 5,
            'image': upload,
        })
        assert resp.status_code == 200
        assert Map.objects.filter(name='FromUpload').exists()

    def test_create_without_image_or_path_400(self, client, media_root):
        resp = client.post_multipart('/api/maps/', {
            'name': 'NoImage',
            'hex_size': 20,
            'origin_x': 0,
            'origin_y': 0,
        })
        assert resp.status_code == 400


class TestDuplicateMap:
    def test_duplicate_copies_hexes_factions_knowledge(self, client, map_factory,
                                                        hex_factory, faction_factory):
        source = map_factory(name='Source')
        h = hex_factory(map=source, row=0, col=0)
        hex_factory(map=source, row=1, col=0)
        faction_factory(current_hex=h, name='Orcs')
        source.knowledge.create(title='Lore')

        resp = client.post(f'/api/maps/{source.id}/duplicate/', {'name': 'Copy'})
        assert resp.status_code == 200
        new_id = resp.json()['id']
        assert new_id != source.id
        new_map = Map.objects.get(id=new_id)
        assert new_map.hexes.count() == 2
        assert new_map.knowledge.count() == 1
        from world.models import Faction
        assert Faction.objects.filter(current_hex__map=new_map, name='Orcs').exists()

    def test_duplicate_shares_gallery_image_file(self, client, media_root, map_factory):
        # CHARACTERIZATION — pins H5: duplicate_map assigns image=gi.image, so the
        # clone points at the SAME file on disk as the source. Deleting one would
        # destroy the other's file. Rewrite when H5 is fixed to copy the file.
        source = map_factory(name='Source')
        gi = GalleryImage.objects.create(
            map=source, name='pic',
            image=SimpleUploadedFile('g.png', make_png_bytes(), content_type='image/png'),
        )
        resp = client.post(f'/api/maps/{source.id}/duplicate/', {'name': 'Copy'})
        assert resp.status_code == 200
        new_gi = GalleryImage.objects.get(map_id=resp.json()['id'])
        assert new_gi.image.name == gi.image.name  # shared file path (the bug)
