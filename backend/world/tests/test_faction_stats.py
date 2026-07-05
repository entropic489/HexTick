import pytest

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
