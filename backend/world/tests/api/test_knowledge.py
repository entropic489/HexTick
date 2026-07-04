"""Pinning tests for the knowledge endpoints in world/api.py."""
import pytest

from world.models.characters import Knowledge

pytestmark = pytest.mark.django_db


class TestListKnowledge:
    def test_list_returns_only_map_knowledge(self, client, map_factory):
        m1 = map_factory(name='M1')
        m2 = map_factory(name='M2')
        m1.knowledge.create(title='OnM1')
        m2.knowledge.create(title='OnM2')
        resp = client.get(f'/api/maps/{m1.id}/knowledge/')
        assert resp.status_code == 200
        assert {k['title'] for k in resp.json()} == {'OnM1'}

    def test_list_missing_map_404(self, client):
        assert client.get('/api/maps/999999/knowledge/').status_code == 404


class TestCreateKnowledge:
    def test_create_with_related(self, client, map_factory):
        m = map_factory()
        existing = m.knowledge.create(title='Root')
        resp = client.post(f'/api/maps/{m.id}/knowledge/', {
            'title': 'Branch',
            'description': 'desc',
            'related_knowledge': [existing.id],
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body['title'] == 'Branch'
        assert [r['id'] for r in body['related_knowledge']] == [existing.id]

    def test_create_missing_map_404(self, client):
        assert client.post('/api/maps/999999/knowledge/', {'title': 'X'}).status_code == 404


class TestPatchKnowledge:
    def test_patch_fields(self, client, map_factory):
        m = map_factory()
        k = m.knowledge.create(title='Old', do_players_know=False)
        resp = client.patch(f'/api/knowledge/{k.id}/', {'title': 'New', 'do_players_know': True})
        assert resp.status_code == 200
        assert resp.json()['title'] == 'New'
        assert resp.json()['do_players_know'] is True

    def test_related_knowledge_is_directional(self, client, map_factory):
        # A -> B does not imply B -> A. .set() replaces the full relation.
        m = map_factory()
        a = m.knowledge.create(title='A')
        b = m.knowledge.create(title='B')
        resp = client.patch(f'/api/knowledge/{a.id}/', {'related_knowledge': [b.id]})
        assert resp.status_code == 200
        assert [r['id'] for r in resp.json()['related_knowledge']] == [b.id]
        # reverse direction is empty
        b.refresh_from_db()
        assert list(b.related_knowledge.all()) == []

    def test_patch_missing_knowledge_404(self, client):
        assert client.patch('/api/knowledge/999999/', {'title': 'X'}).status_code == 404
