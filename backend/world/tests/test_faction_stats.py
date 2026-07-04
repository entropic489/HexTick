import pytest

from world.models.faction import Faction
from world.utils import modifier


@pytest.mark.parametrize('score,expected', [
    (0, 0),
    (5, 0),
    (9, 0),
    (10, 1),
    (99, 9),
    (100, 10),
    (-5, -1),
])
def test_modifier(score, expected):
    assert modifier(score) == expected


def make_faction(population=50, technology=20, resources=50):
    return Faction(population=population, technology=technology, resources=resources)


class TestComfort:
    def test_positive_when_resources_low_relative_to_population(self):
        faction = make_faction(population=50, technology=20, resources=10)
        assert faction.comfort(hex_resources=0) > 0

    def test_negative_when_resources_exceed_population(self):
        faction = make_faction(population=50, technology=20, resources=100)
        assert faction.comfort(hex_resources=0) < 0

    def test_hex_resources_add_via_resource_generation_modifier(self):
        # resource_generation = (population + technology) // 2 = 35 -> rg_modifier = 3
        faction = make_faction(population=50, technology=20, resources=50)
        assert faction.comfort(hex_resources=0) == 0
        assert faction.comfort(hex_resources=10) == 30

    def test_restless_halves_comfort(self):
        faction = make_faction(population=50, technology=20, resources=10)
        normal = faction.comfort(hex_resources=0, has_restless=False)
        restless = faction.comfort(hex_resources=0, has_restless=True)
        assert restless == normal // 2

    def test_restless_default_is_false(self):
        faction = make_faction(population=50, technology=20, resources=10)
        assert faction.comfort(hex_resources=0) == faction.comfort(hex_resources=0, has_restless=False)
