from django.db import models

from .world import Map


class TerrainType(str):
    """
    Terrain type carrying its own difficulty and resource_generation modifier.
    Behaves as a str so Django CharField stores/retrieves it transparently.
    """

    def __new__(cls, value, label, terrain_difficulty, resource_generation):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.label = label
        obj.terrain_difficulty = terrain_difficulty
        obj.resource_generation = resource_generation
        return obj

    PLAINS   = None  # assigned below
    FOREST   = None
    MOUNTAIN = None
    SWAMP    = None
    DESERT   = None
    COAST    = None

    @classmethod
    def choices(cls):
        return [(t._value_, t.label) for t in _TERRAIN_TYPES]

    @classmethod
    def from_value(cls, value):
        for t in _TERRAIN_TYPES:
            if t._value_ == value:
                return t
        raise ValueError(f"Unknown TerrainType: {value!r}")


_TERRAIN_TYPES = [
    TerrainType('plains',   'Plains',   terrain_difficulty=1, resource_generation=2),
    TerrainType('forest',   'Forest',   terrain_difficulty=2, resource_generation=1),
    TerrainType('mountain', 'Mountain', terrain_difficulty=3, resource_generation=0),
    TerrainType('swamp',    'Swamp',    terrain_difficulty=3, resource_generation=2),
    TerrainType('desert',   'Desert',   terrain_difficulty=2, resource_generation=0),
    TerrainType('coast',    'Coast',    terrain_difficulty=1, resource_generation=2),
]

TerrainType.PLAINS   = _TERRAIN_TYPES[0]
TerrainType.FOREST   = _TERRAIN_TYPES[1]
TerrainType.MOUNTAIN = _TERRAIN_TYPES[2]
TerrainType.SWAMP    = _TERRAIN_TYPES[3]
TerrainType.DESERT   = _TERRAIN_TYPES[4]
TerrainType.COAST    = _TERRAIN_TYPES[5]


class WeatherType(models.TextChoices):
    FAIR         = 'fair',         'Fair'
    UNPLEASANT   = 'unpleasant',   'Unpleasant'
    INCLEMENT    = 'inclement',    'Inclement'
    EXTREME      = 'extreme',      'Extreme'
    CATASTROPHIC = 'catastrophic', 'Catastrophic'


class Hex(models.Model):
    map = models.ForeignKey(Map, on_delete=models.CASCADE, related_name='hexes')
    row = models.IntegerField()
    col = models.IntegerField()

    terrain_type = models.CharField(
        max_length=20, choices=TerrainType.choices(), default=TerrainType.PLAINS
    )
    resources = models.IntegerField(default=0)
    points_of_interest = models.JSONField(default=list)
    weather = models.CharField(
        max_length=20, choices=WeatherType.choices, default=WeatherType.FAIR
    )
    encounter_likelihood = models.IntegerField(default=0)
    player_explored = models.BooleanField(default=False)
    player_visible = models.BooleanField(default=False)

    @property
    def terrain(self) -> TerrainType:
        return TerrainType.from_value(self.terrain_type)

    @property
    def terrain_difficulty(self) -> int:
        return self.terrain.terrain_difficulty

    @property
    def resource_generation(self) -> int:
        return self.terrain.resource_generation

    class Meta:
        unique_together = [('map', 'row', 'col')]

    def __str__(self):
        return f"Hex({self.row}, {self.col})"
