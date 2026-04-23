def modifier(score: int) -> int:
    return score // 10


def hex_distance(a, b) -> int:
    """Axial coordinate distance between two Hex instances."""
    dq = a.col - b.col
    dr = a.row - b.row
    return (abs(dq) + abs(dr) + abs(dq + dr)) // 2


def adjacent_hexes(hex, all_hexes: list) -> list:
    """Return hexes from all_hexes that are exactly 1 step from hex."""
    return [h for h in all_hexes if hex_distance(hex, h) == 1]
