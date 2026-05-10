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


def move_difficulty(origin, destination, tick_number: int) -> int:
    is_night = tick_number % 3 == 2
    if origin is not None and origin.has_roads and destination.has_roads:
        return 1 + (1 if is_night else 0)
    return destination.terrain_difficulty + (2 if is_night else 0)


def adjacent_hexes(hex, all_hexes: list) -> list:
    """Return hexes from all_hexes that are exactly 1 step from hex."""
    return [h for h in all_hexes if hex_distance(hex, h) == 1]
