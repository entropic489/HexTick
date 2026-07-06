from django.db import models

from .hex import Hex
from .faction import Faction, Action


class Tick(models.Model):
    map = models.ForeignKey('world.Map', on_delete=models.CASCADE, related_name='ticks')
    number = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('map', 'number')]

    def __str__(self):
        return f"Tick {self.number} ({self.map})"


class HexTick(models.Model):
    tick = models.ForeignKey(Tick, on_delete=models.CASCADE, related_name='hex_ticks')
    hex = models.ForeignKey(Hex, on_delete=models.CASCADE, related_name='ticks')

    resources = models.IntegerField()
    encounter_likelihood = models.IntegerField()
    player_explored = models.BooleanField()
    player_visible = models.BooleanField()

    class Meta:
        unique_together = [('tick', 'hex')]

    def __str__(self):
        return f"Tick {self.tick.number} — {self.hex}"


class FactionTick(models.Model):
    tick = models.ForeignKey(Tick, on_delete=models.CASCADE, related_name='faction_ticks')
    faction = models.ForeignKey(Faction, on_delete=models.CASCADE, related_name='ticks')

    is_mobile = models.BooleanField()
    speed = models.IntegerField()
    population = models.IntegerField()
    current_hex = models.ForeignKey(
        Hex, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    destination = models.ForeignKey(
        Hex, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )

    action = models.CharField(max_length=20, choices=Action.choices, null=True, blank=True)
    dice_roll = models.IntegerField(null=True, blank=True)

    class Meta:
        unique_together = [('tick', 'faction')]

    def __str__(self):
        return f"Tick {self.tick.number} — {self.faction}"


class PartyTick(models.Model):
    tick = models.ForeignKey(Tick, on_delete=models.CASCADE, related_name='party_ticks')
    party = models.ForeignKey('world.Party', on_delete=models.CASCADE, related_name='ticks')

    current_hex = models.ForeignKey(
        Hex, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    action = models.CharField(max_length=20, choices=Action.choices, null=True, blank=True)
    last_action = models.CharField(max_length=20, choices=Action.choices, null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    sub_tick = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = [('tick', 'party')]

    def __str__(self):
        return f"Tick {self.tick.number} — {self.party}"
