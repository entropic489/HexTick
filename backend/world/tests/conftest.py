import pytest

from world.models.faction import Faction
from world.models.hex import Hex, TerrainType
from world.models.world import Map


@pytest.fixture
def map_factory(db):
    def _make(**kwargs):
        kwargs.setdefault('name', 'Test Map')
        kwargs.setdefault('image', '')
        return Map.objects.create(**kwargs)
    return _make


@pytest.fixture
def hex_factory(map_factory):
    def _make(map=None, row=0, col=0, terrain_type=TerrainType.PLAINS, **kwargs):
        if map is None:
            map = map_factory()
        return Hex.objects.create(map=map, row=row, col=col, terrain_type=terrain_type, **kwargs)
    return _make


@pytest.fixture
def faction_factory(hex_factory):
    def _make(current_hex=None, **kwargs):
        if current_hex is None:
            current_hex = hex_factory()
        kwargs.setdefault('name', 'Test Faction')
        # Mirror the API: a faction's map membership is now an explicit FK (M8),
        # defaulting to its current hex's map when not overridden.
        kwargs.setdefault('map', current_hex.map if current_hex else None)
        return Faction.objects.create(current_hex=current_hex, **kwargs)
    return _make
