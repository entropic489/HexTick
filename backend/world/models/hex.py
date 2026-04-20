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
    TerrainType('mountain', 'Mountain', terrain_difficulty=4, resource_generation=0),
    TerrainType('swamp',    'Swamp',    terrain_difficulty=4, resource_generation=3),
    TerrainType('desert',   'Desert',   terrain_difficulty=2, resource_generation=0),
    TerrainType('coast',    'Coast',    terrain_difficulty=1, resource_generation=2),
]

TerrainType.PLAINS   = _TERRAIN_TYPES[0]
TerrainType.FOREST   = _TERRAIN_TYPES[1]
TerrainType.MOUNTAIN = _TERRAIN_TYPES[2]
TerrainType.SWAMP    = _TERRAIN_TYPES[3]
TerrainType.DESERT   = _TERRAIN_TYPES[4]
TerrainType.COAST    = _TERRAIN_TYPES[5]


class POIType(models.TextChoices):
    DUNGEON      = 'dungeon',      'Dungeon'
    VILLAGE      = 'village',      'Village'
    RUIN         = 'ruin',         'Ruin'
    STASH        = 'stash',        'Stash'
    MONSTER_BASE = 'monster_base', 'Monster Base'


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


class PointOfInterest(models.Model):
    hex = models.ForeignKey(Hex, on_delete=models.CASCADE, related_name='pois')
    poi_type = models.CharField(max_length=20, choices=POIType.choices)
    name = models.CharField(max_length=200, blank=True, default='')

    # Dungeon / Ruin
    difficulty = models.IntegerField(default=0)

    # Dungeon
    title = models.CharField(max_length=200, blank=True, default='')
    description = models.TextField(blank=True, default='')
    notes = models.TextField(blank=True, default='')
    technology_max_modifier = models.IntegerField(default=1)

    # Village
    faction = models.ForeignKey(
        'world.Faction', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='villages',
    )

    # Monster Base
    monster_type = models.CharField(max_length=100, blank=True, default='')

    age = models.IntegerField(default=4)

    player_visible = models.BooleanField(default=False)
    player_explored = models.BooleanField(default=False)
    hidden = models.BooleanField(default=False)

    # Dungeon / Ruin / Stash
    items = models.ManyToManyField('world.Item', blank=True)
    knowledge = models.ManyToManyField('world.Knowledge', blank=True)

    def __str__(self):
        return f"{self.get_poi_type_display()} at {self.hex}" if not self.name else self.name
