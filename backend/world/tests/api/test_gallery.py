"""Pinning tests for the gallery endpoints in world/api.py."""
import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from world.models.gallery import GalleryImage

from .conftest import make_png_bytes

pytestmark = pytest.mark.django_db


class TestListGallery:
    def test_list_returns_map_images(self, client, map_factory):
        m = map_factory()
        GalleryImage.objects.create(map=m, name='A', image='gallery/a.png')
        GalleryImage.objects.create(map=m, name='B', image='gallery/b.png')
        resp = client.get(f'/api/maps/{m.id}/gallery/')
        assert resp.status_code == 200
        assert {g['name'] for g in resp.json()} == {'A', 'B'}

    def test_list_missing_map_404(self, client):
        assert client.get('/api/maps/999999/gallery/').status_code == 404


class TestUploadAndDelete:
    def test_upload_creates_unpublished_image(self, client, media_root, map_factory):
        m = map_factory()
        upload = SimpleUploadedFile('pic.png', make_png_bytes(), content_type='image/png')
        resp = client.post_multipart(f'/api/maps/{m.id}/gallery/', {'name': 'Hero', 'image': upload})
        assert resp.status_code == 200
        body = resp.json()
        assert body['name'] == 'Hero'
        assert body['is_published'] is False
        assert GalleryImage.objects.filter(map=m, name='Hero').exists()

    def test_delete_removes_row(self, client, media_root, map_factory):
        m = map_factory()
        gi = GalleryImage.objects.create(
            map=m, name='Doomed',
            image=SimpleUploadedFile('d.png', make_png_bytes(), content_type='image/png'),
        )
        resp = client.delete(f'/api/gallery/{gi.id}/')
        assert resp.status_code == 200
        assert resp.json() == {'ok': True}
        assert not GalleryImage.objects.filter(id=gi.id).exists()

    def test_delete_missing_404(self, client):
        assert client.delete('/api/gallery/999999/').status_code == 404


class TestPublish:
    def test_publish_sets_flag_and_broadcasts(self, client, fake_redis, map_factory):
        m = map_factory()
        gi = GalleryImage.objects.create(map=m, name='A', image='gallery/a.png')
        resp = client.patch(f'/api/gallery/{gi.id}/publish/')
        assert resp.status_code == 200
        assert resp.json()['is_published'] is True
        assert any(json.loads(msg).get('type') == 'gallery_update' for _, msg in fake_redis.published)

    def test_publishing_one_unpublishes_others(self, client, map_factory):
        m = map_factory()
        a = GalleryImage.objects.create(map=m, name='A', image='gallery/a.png', is_published=True)
        b = GalleryImage.objects.create(map=m, name='B', image='gallery/b.png')
        resp = client.patch(f'/api/gallery/{b.id}/publish/')
        assert resp.status_code == 200
        a.refresh_from_db(); b.refresh_from_db()
        assert b.is_published is True
        assert a.is_published is False

    def test_publish_toggles_off_when_already_published(self, client, map_factory):
        m = map_factory()
        gi = GalleryImage.objects.create(map=m, name='A', image='gallery/a.png', is_published=True)
        resp = client.patch(f'/api/gallery/{gi.id}/publish/')
        assert resp.status_code == 200
        assert resp.json()['is_published'] is False
