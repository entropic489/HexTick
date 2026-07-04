def modifier(score: int) -> int:
    return score // 10


def night_bonus(tick_number: int) -> int:
    return 2 if tick_number % 3 == 2 else 0


def hex_distance(a, b) -> int:
    """Cube distance between two Hex instances (offset → axial conversion required).

    The grid uses flat-top hexes with odd columns shifted up (odd-q offset).
    Raw (row, col) offsets cannot be used directly in the axial distance formula —
    they must be projected to axial space first.
    """
    def to_axial(col, row):
        return col, row - (col - (col & 1)) // 2

    aq, ar = to_axial(a.col, a.row)
    bq, br = to_axial(b.col, b.row)
    dq, dr = aq - bq, ar - br
    return (abs(dq) + abs(dr) + abs(dq + dr)) // 2


_WEATHER_MOVE_PENALTY: dict[str, int] = {'inclement': 1, 'extreme': 2}
_WEATHER_IMPASSABLE = {'catastrophic'}


def move_difficulty(origin, destination, tick_number: int, weather: str = 'fair') -> int:
    if weather in _WEATHER_IMPASSABLE:
        return 999
    is_night = tick_number % 3 == 2
    weather_penalty = _WEATHER_MOVE_PENALTY.get(weather, 0)
    if origin is not None and origin.has_roads and destination.has_roads:
        base = 1 + (1 if is_night else 0)
    else:
        base = destination.terrain_difficulty + (1 if is_night else 0)
    return base + weather_penalty


def adjacent_hexes(hex, all_hexes: list) -> list:
    """Return hexes from all_hexes that are exactly 1 step from hex."""
    return [h for h in all_hexes if hex_distance(hex, h) == 1]
