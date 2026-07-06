from django.db import models

from .hex import Hex
from .faction import Action


class Party(models.Model):
    name = models.CharField(max_length=200)
    map = models.OneToOneField(
        'world.Map', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='party',
    )

    player_count = models.IntegerField(default=1)
    speed = models.IntegerField(default=0)
    max_speed = models.IntegerField(default=4)
    resource_generation = models.IntegerField(default=1)
    supplies = models.IntegerField(default=0)

    current_hex = models.ForeignKey(
        Hex, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='parties',
    )

    tracks_supplies = models.BooleanField(default=True)
    is_lost = models.BooleanField(default=False)

    current_action = models.CharField(max_length=20, choices=Action.choices, null=True, blank=True)
    last_action = models.CharField(max_length=20, choices=Action.choices, null=True, blank=True)

    def __str__(self):
        return self.name
