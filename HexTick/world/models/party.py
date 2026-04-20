from django.db import models

from .hex import Hex
from .faction import Action


class Party(models.Model):
    name = models.CharField(max_length=200)

    faction = models.OneToOneField(
        'world.Faction', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='party',
    )
    characters = models.ManyToManyField('world.Character', blank=True, related_name='parties')

    speed = models.IntegerField(default=0)
    max_speed = models.IntegerField(default=4)
    resource_generation = models.IntegerField(default=1)

    current_hex = models.ForeignKey(
        Hex, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='parties',
    )
    destination = models.ForeignKey(
        Hex, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='party_destinations',
    )

    current_action = models.CharField(max_length=20, choices=Action.choices, null=True, blank=True)
    last_action = models.CharField(max_length=20, choices=Action.choices, null=True, blank=True)

    def __str__(self):
        return self.name
