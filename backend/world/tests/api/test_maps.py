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
        assert body['reveal_mode'] == 'grey_fog'
        assert body['detail_image'] is None

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
    def test_duplicate_copies_hexes_and_factions(self, client, map_factory,
                                                  hex_factory, faction_factory):
        source = map_factory(name='Source')
        h = hex_factory(map=source, row=0, col=0)
        hex_factory(map=source, row=1, col=0)
        faction_factory(current_hex=h, name='Orcs')

        resp = client.post_multipart(f'/api/maps/{source.id}/duplicate/', {'name': 'Copy'})
        assert resp.status_code == 200
        new_id = resp.json()['id']
        assert new_id != source.id
        new_map = Map.objects.get(id=new_id)
        assert new_map.hexes.count() == 2
        from world.models import Faction
        assert Faction.objects.filter(current_hex__map=new_map, name='Orcs').exists()

    def test_duplicate_defaults_carry_over_source_reveal_mode(self, client, map_factory):
        source = map_factory(name='Source', reveal_mode='two_layer')
        resp = client.post_multipart(f'/api/maps/{source.id}/duplicate/', {'name': 'Copy'})
        assert resp.status_code == 200
        assert resp.json()['reveal_mode'] == 'two_layer'

    def test_duplicate_converts_grey_fog_to_two_layer_with_new_detail_image(
        self, client, media_root, map_factory,
    ):
        source = map_factory(name='Source')  # default grey_fog
        detail = SimpleUploadedFile('detail.png', make_png_bytes(), content_type='image/png')
        resp = client.post_multipart(f'/api/maps/{source.id}/duplicate/', {
            'name': 'Two-layer copy',
            'reveal_mode': 'two_layer',
            'detail_image': detail,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body['reveal_mode'] == 'two_layer'
        assert body['detail_image'] is not None
        new_map = Map.objects.get(id=body['id'])
        assert new_map.detail_image.name.startswith('maps/detail')

    def test_duplicate_copies_gallery_image_file(self, client, media_root, map_factory):
        # H5 fix: duplicate_map copies each image file, so the clone owns an
        # independent path. Deleting the clone's gallery image must leave the
        # source's file on disk.
        import os
        from django.conf import settings

        source = map_factory(name='Source')
        gi = GalleryImage.objects.create(
            map=source, name='pic',
            image=SimpleUploadedFile('g.png', make_png_bytes(), content_type='image/png'),
        )
        resp = client.post_multipart(f'/api/maps/{source.id}/duplicate/', {'name': 'Copy'})
        assert resp.status_code == 200
        new_gi = GalleryImage.objects.get(map_id=resp.json()['id'])
        assert new_gi.image.name != gi.image.name  # independent file path

        source_path = os.path.join(settings.MEDIA_ROOT, gi.image.name)
        assert client.delete(f'/api/gallery/{new_gi.id}/').status_code == 200
        assert os.path.exists(source_path)  # source file survives
