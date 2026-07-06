from django.db import models

from .hex import Hex


class Action(models.TextChoices):
    SUPPLY = 'supply', 'Supply'
    TRAVEL = 'travel', 'Travel'
    REST    = 'rest',    'Rest'
    # Party-only actions (factions never take these)
    SEARCH  = 'search',  'Search'
    EXPLORE = 'explore', 'Explore'
    SOCIAL  = 'social',  'Social'
    DELVE  = 'delve',  'Delve'


class Faction(models.Model):
    # Explicit map membership. Previously inferred from `current_hex.map`, which made
    # a faction vanish from every list the moment its hex was cleared (M8). The map FK
    # is now the source of truth for "which map is this faction on".
    map = models.ForeignKey(
        'world.Map', null=True, blank=True,
        on_delete=models.CASCADE,
        related_name='factions',
    )

    name = models.CharField(max_length=200)
    leader = models.CharField(max_length=200, blank=True, default='')

    color = models.CharField(max_length=7, default='#89b4fa')

    is_mobile = models.BooleanField(default=True)

    speed = models.IntegerField(default=4)
    max_speed = models.IntegerField(default=4)
    # Purely descriptive GM-editable flavour; no mechanical effect.
    population = models.IntegerField(default=50)

    notes = models.TextField(blank=True, default='')

    current_action = models.CharField(
        max_length=20, choices=Action.choices, null=True, blank=True
    )
    next_action = models.CharField(
        max_length=20, choices=Action.choices, null=True, blank=True
    )
    last_action = models.CharField(
        max_length=20, choices=Action.choices, null=True, blank=True
    )

    # Manual GM flag; when True the faction is excluded from ticking.
    is_dead = models.BooleanField(default=False)

    image = models.ForeignKey(
        'world.GalleryImage', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='factions',
    )

    movement_restricted = models.BooleanField(default=False)
    allowed_hexes = models.ManyToManyField(
        Hex, blank=True, related_name='restricted_factions'
    )

    current_hex = models.ForeignKey(
        Hex, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='factions',
    )
    destination = models.ForeignKey(
        Hex, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='destination_factions',
    )

    def __str__(self):
        return self.name
