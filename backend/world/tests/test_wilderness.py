import pytest

from world.actions import (
    WildernessEvent,
    WEATHER_ORDER,
    _WILDERNESS_TABLE,
    party_move_rolls,
    party_wilderness_roll,
)
from world.models.hex import Hex, TerrainType
from world.models.world import WeatherType


def make_hex(row, col, terrain_type=TerrainType.PLAINS, has_roads=False, has_rivers=False):
    return Hex(row=row, col=col, terrain_type=terrain_type, has_roads=has_roads, has_rivers=has_rivers)


def patch_rolls(monkeypatch, *, lost=None, event=None, weather=None):
    """Route random.randint calls by their (a, b) range so call order doesn't matter."""
    def fake_randint(a, b):
        if (a, b) == (1, 6):
            assert lost is not None, 'unexpected lost roll'
            return lost
        if (a, b) == (1, 5):
            assert event is not None, 'unexpected event roll'
            return event
        if (a, b) == (1, 8):
            assert weather is not None, 'unexpected weather roll'
            return weather
        raise AssertionError(f'unexpected randint range: ({a}, {b})')
    monkeypatch.setattr('world.actions.random.randint', fake_randint)


class TestWildernessTable:
    def test_exhaustion_removed(self):
        assert not hasattr(WildernessEvent, 'EXHAUSTION')
        assert WildernessEvent.WEATHER.value == 'Weather'

    def test_table_covers_1_through_5(self):
        assert set(_WILDERNESS_TABLE.keys()) == {1, 2, 3, 4, 5}
        assert _WILDERNESS_TABLE[3] == WildernessEvent.WEATHER
        assert _WILDERNESS_TABLE[5] == WildernessEvent.QUIET


class TestPartyMoveRollsWeather:
    def test_non_weather_event_leaves_weather_untouched(self, monkeypatch, map_factory):
        map_obj = map_factory(weather=WeatherType.FAIR)
        origin, dest = make_hex(0, 0), make_hex(0, 1)
        patch_rolls(monkeypatch, lost=2, event=1)

        result = party_move_rolls(origin, dest, map_obj)

        assert result['wilderness_event'] == WildernessEvent.ENCOUNTER.value
        assert 'weather_roll' not in result
        assert 'weather_before' not in result
        assert 'weather_after' not in result
        map_obj.refresh_from_db()
        assert map_obj.weather == WeatherType.FAIR

    def test_weather_event_worse_by_two(self, monkeypatch, map_factory):
        map_obj = map_factory(weather=WeatherType.FAIR)
        origin, dest = make_hex(0, 0), make_hex(0, 1)
        patch_rolls(monkeypatch, lost=2, event=3, weather=1)

        result = party_move_rolls(origin, dest, map_obj)

        assert result['wilderness_event'] == WildernessEvent.WEATHER.value
        assert result['weather_roll'] == 1
        assert result['weather_before'] == WeatherType.FAIR
        assert result['weather_after'] == WeatherType.INCLEMENT
        map_obj.refresh_from_db()
        assert map_obj.weather == WeatherType.INCLEMENT

    def test_weather_event_better_by_one_clamped_at_fair(self, monkeypatch, map_factory):
        map_obj = map_factory(weather=WeatherType.FAIR)
        origin, dest = make_hex(0, 0), make_hex(0, 1)
        patch_rolls(monkeypatch, lost=2, event=3, weather=6)

        result = party_move_rolls(origin, dest, map_obj)

        assert result['weather_before'] == WeatherType.FAIR
        assert result['weather_after'] == WeatherType.FAIR
        map_obj.refresh_from_db()
        assert map_obj.weather == WeatherType.FAIR

    def test_weather_event_worse_clamped_at_catastrophic(self, monkeypatch, map_factory):
        map_obj = map_factory(weather=WeatherType.CATASTROPHIC)
        origin, dest = make_hex(0, 0), make_hex(0, 1)
        patch_rolls(monkeypatch, lost=2, event=3, weather=1)

        result = party_move_rolls(origin, dest, map_obj)

        assert result['weather_before'] == WeatherType.CATASTROPHIC
        assert result['weather_after'] == WeatherType.CATASTROPHIC
        map_obj.refresh_from_db()
        assert map_obj.weather == WeatherType.CATASTROPHIC


class TestPartyWildernessRoll:
    def test_rest_remaps_sign_to_quiet(self, monkeypatch, map_factory):
        map_obj = map_factory(weather=WeatherType.FAIR)
        patch_rolls(monkeypatch, event=2)

        result = party_wilderness_roll('rest', map_obj)

        assert result['wilderness_event'] == WildernessEvent.QUIET.value
        assert result['event_roll'] == 2

    def test_supply_weather_event_shifts_weather(self, monkeypatch, map_factory):
        map_obj = map_factory(weather=WeatherType.OVERCAST)
        patch_rolls(monkeypatch, event=3, weather=2)

        result = party_wilderness_roll('supply', map_obj)

        assert result['wilderness_event'] == WildernessEvent.WEATHER.value
        assert result['weather_before'] == WeatherType.OVERCAST
        assert result['weather_after'] == WeatherType.INCLEMENT
        map_obj.refresh_from_db()
        assert map_obj.weather == WeatherType.INCLEMENT
