"""Shared harness for API pinning tests.

These are characterization tests: they lock the *current* observable behavior of
`world/api.py` so the planned router split (see design_docs/code-review.md §1.2)
can be verified as behavior-preserving. Where an endpoint's current behavior is a
known bug (H4/H5/H6/M3/M7/M8 in code-review.md), the test pins the buggy behavior
and is marked `CHARACTERIZATION — pins <id>` so it is knowingly rewritten when the
fix lands, not treated as a stable contract.

The tests drive the real Django URLconf (`/api/...`) through Ninja's request
parsing rather than `ninja.testing.TestClient`, so multipart endpoints and routing
are exercised end to end. Redis is replaced with a recording fake; SSE broadcasts
wrapped in `transaction.on_commit` do not fire under the rolled-back test
transaction and are asserted via `django_capture_on_commit_callbacks` where needed.
"""
import io
import json

import pytest
from django.test import Client

from world.models import Map
from world.models.party import Party


@pytest.fixture
def map_factory(db):
    """Override of the shared map_factory: gives maps a non-empty image name.

    MapSchema types `image` as `str`, and Ninja's FieldFile encoder returns None
    for an empty ImageField (a 500 on serialization). Real maps always have an
    image, so a name is the representative fixture. This override also flows into
    hex_factory / faction_factory, which depend on `map_factory` by name.
    """
    def _make(**kwargs):
        kwargs.setdefault('name', 'Test Map')
        kwargs.setdefault('image', 'maps/test.png')
        return Map.objects.create(**kwargs)
    return _make


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch):
    """Replace the module-level redis client so synchronous publishes
    (locked/weather/highlight/gallery-publish) don't hit a real server, and so
    tests can assert what was broadcast."""
    class FakeRedis:
        def __init__(self):
            self.published = []

        def publish(self, channel, message):
            self.published.append((channel, message))
            return 1

    fake = FakeRedis()
    monkeypatch.setattr('world.api._redis', fake, raising=True)
    return fake


class ApiClient:
    """Thin wrapper over django.test.Client that speaks JSON to the Ninja API.

    `raise_request_exception=False` means an unhandled view exception surfaces as a
    500 response instead of propagating, so known-crash paths can be pinned by
    status code.
    """

    def __init__(self):
        self._c = Client(raise_request_exception=False)

    def get(self, path):
        return self._c.get(path)

    def post(self, path, payload=None):
        return self._c.post(path, data=json.dumps(payload or {}),
                            content_type='application/json')

    def patch(self, path, payload=None):
        return self._c.patch(path, data=json.dumps(payload or {}),
                             content_type='application/json')

    def delete(self, path):
        return self._c.delete(path)

    def post_multipart(self, path, data):
        # No content_type -> django.test.Client encodes as multipart/form-data,
        # uploading any file-like values. This is the real path Ninja Form/File uses.
        return self._c.post(path, data=data)


@pytest.fixture
def client(db, fake_redis):
    return ApiClient()


@pytest.fixture
def party_factory(db):
    def _make(map=None, current_hex=None, **kwargs):
        kwargs.setdefault('name', 'Test Party')
        return Party.objects.create(map=map, current_hex=current_hex, **kwargs)
    return _make


@pytest.fixture
def media_root(tmp_path, settings):
    """Point MEDIA_ROOT at a temp dir so file-writing endpoints don't pollute the repo."""
    settings.MEDIA_ROOT = str(tmp_path)
    return tmp_path


def make_png_bytes(size=(64, 64), color=(120, 80, 40)):
    """A small real PNG so Pillow's Image.open (used by create_map) succeeds."""
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', size, color).save(buf, format='PNG')
    return buf.getvalue()
