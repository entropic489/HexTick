def modifier(score: int) -> int:
    return score // 10


def hex_distance(a, b) -> int:
    """Axial coordinate distance between two Hex instances."""
    dq = a.col - b.col
    dr = a.row - b.row
    return (abs(dq) + abs(dr) + abs(dq + dr)) // 2
