import pytest

from world.models.hex import Hex, TerrainType
from world.utils import hex_distance, move_difficulty


def make_hex(row, col, terrain_type=TerrainType.PLAINS, has_roads=False):
    return Hex(row=row, col=col, terrain_type=terrain_type, has_roads=has_roads)


class TestHexDistance:
    def test_same_hex_is_zero(self):
        a = make_hex(0, 0)
        assert hex_distance(a, a) == 0

    def test_vertical_neighbor_same_column(self):
        a = make_hex(0, 0)
        b = make_hex(1, 0)
        assert hex_distance(a, b) == 1

    def test_horizontal_neighbor_adjacent_column(self):
        a = make_hex(0, 0)
        b = make_hex(0, 1)
        assert hex_distance(a, b) == 1

    def test_far_apart_same_row(self):
        a = make_hex(0, 0)
        b = make_hex(0, 4)
        assert hex_distance(a, b) == 4

    def test_symmetry(self):
        a = make_hex(2, 3)
        b = make_hex(5, 1)
        assert hex_distance(a, b) == hex_distance(b, a)


class TestMoveDifficulty:
    DAY = 0
    NIGHT = 2

    def test_road_both_ends_day(self):
        origin = make_hex(0, 0, has_roads=True)
        dest = make_hex(0, 1, terrain_type=TerrainType.MOUNTAIN, has_roads=True)
        assert move_difficulty(origin, dest, self.DAY) == 1

    def test_road_both_ends_night(self):
        origin = make_hex(0, 0, has_roads=True)
        dest = make_hex(0, 1, terrain_type=TerrainType.MOUNTAIN, has_roads=True)
        assert move_difficulty(origin, dest, self.NIGHT) == 2

    def test_road_one_end_only_falls_back_to_terrain(self):
        origin = make_hex(0, 0, has_roads=False)
        dest = make_hex(0, 1, terrain_type=TerrainType.FOREST, has_roads=True)
        assert move_difficulty(origin, dest, self.DAY) == 2

    def test_no_road_uses_terrain_difficulty(self):
        origin = make_hex(0, 0)
        dest = make_hex(0, 1, terrain_type=TerrainType.SWAMP)
        assert move_difficulty(origin, dest, self.DAY) == 4

    def test_no_road_night_adds_one(self):
        origin = make_hex(0, 0)
        dest = make_hex(0, 1, terrain_type=TerrainType.SWAMP)
        assert move_difficulty(origin, dest, self.NIGHT) == 5

    def test_origin_none_uses_destination_terrain(self):
        dest = make_hex(0, 1, terrain_type=TerrainType.FOREST, has_roads=True)
        assert move_difficulty(None, dest, self.DAY) == 2

    @pytest.mark.parametrize('weather,penalty', [
        ('fair', 0),
        ('overcast', 0),
        ('inclement', 1),
        ('extreme', 2),
    ])
    def test_weather_penalty_added_to_base(self, weather, penalty):
        dest = make_hex(0, 1, terrain_type=TerrainType.PLAINS)
        assert move_difficulty(None, dest, self.DAY, weather=weather) == 1 + penalty

    def test_catastrophic_weather_is_impassable(self):
        origin = make_hex(0, 0, has_roads=True)
        dest = make_hex(0, 1, terrain_type=TerrainType.PLAINS, has_roads=True)
        assert move_difficulty(origin, dest, self.NIGHT, weather='catastrophic') == 999
