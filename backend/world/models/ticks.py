from django.db import models

from .hex import Hex, WeatherType, PointOfInterest
from .faction import Faction, Action


class Tick(models.Model):
    number = models.PositiveIntegerField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Tick {self.number}"


class HexTick(models.Model):
    tick = models.ForeignKey(Tick, on_delete=models.CASCADE, related_name='hex_ticks')
    hex = models.ForeignKey(Hex, on_delete=models.CASCADE, related_name='ticks')

    terrain_type = models.CharField(max_length=20)
    resources = models.IntegerField()
    points_of_interest = models.ManyToManyField(PointOfInterest, blank=True)
    weather = models.CharField(max_length=20, choices=WeatherType.choices)
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
    technology = models.IntegerField()
    technology_max = models.IntegerField()
    resources = models.IntegerField()
    agreeableness = models.IntegerField()
    combat_skill = models.IntegerField()
    scouting = models.IntegerField()
    theology = models.IntegerField()
    famine_streak = models.IntegerField()
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
    destination = models.ForeignKey(
        Hex, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    action = models.CharField(max_length=20, choices=Action.choices, null=True, blank=True)
    last_action = models.CharField(max_length=20, choices=Action.choices, null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    class Meta:
        unique_together = [('tick', 'party')]

    def __str__(self):
        return f"Tick {self.tick.number} — {self.party}"
