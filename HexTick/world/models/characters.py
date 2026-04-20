from django.core.exceptions import ValidationError
from django.db import models

from .hex import Hex


class Item(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')

    def __str__(self):
        return self.title


class Knowledge(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    do_players_know = models.BooleanField(default=False)

    def __str__(self):
        return self.title


class Character(models.Model):
    faction = models.ForeignKey(
        'world.Faction', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='characters',
    )

    name = models.CharField(max_length=200)
    age = models.IntegerField(null=True, blank=True)

    is_player = models.BooleanField(default=False)
    is_leader = models.BooleanField(default=False)
    is_wanderer = models.BooleanField(default=False)
    is_dead = models.BooleanField(default=False)
    can_merge = models.BooleanField(default=True)

    combat_skill = models.IntegerField(default=10)
    speed = models.IntegerField(default=0)
    max_speed = models.IntegerField(default=4)
    scouting = models.IntegerField(default=0)
    resource_generation = models.IntegerField(default=1)
    ration_limit = models.IntegerField(default=5)
    rations = models.IntegerField(default=0)
    famine_streak = models.IntegerField(default=0)

    current_hex = models.ForeignKey(
        Hex, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='characters',
    )
    destination = models.ForeignKey(
        Hex, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='character_destinations',
    )

    notes = models.TextField(blank=True, default='')
    drive = models.TextField(blank=True, default='')
    items = models.ManyToManyField(Item, blank=True)
    knowledge = models.ManyToManyField(Knowledge, blank=True)

    def clean(self):
        if self.is_wanderer and self.current_hex is None:
            raise ValidationError('Wanderers must have a current_hex.')

    @property
    def is_hungry(self) -> bool:
        return self.faction is not None and self.faction.famine_streak > 0

    @property
    def is_scout(self) -> bool:
        return self.scouting > 0 and self.faction is not None and self.faction.is_player_faction

    def __str__(self):
        return self.name


class CharacterTick(models.Model):
    tick = models.ForeignKey(
        'world.Tick', on_delete=models.CASCADE, related_name='character_ticks'
    )
    character = models.ForeignKey(
        Character, on_delete=models.CASCADE, related_name='ticks'
    )

    rations = models.IntegerField()
    famine_streak = models.IntegerField()
    speed = models.IntegerField()
    is_dead = models.BooleanField()
    is_wanderer = models.BooleanField()
    destination = models.ForeignKey(
        Hex, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    current_hex = models.ForeignKey(
        Hex, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    action = models.CharField(max_length=20, null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    class Meta:
        unique_together = [('tick', 'character')]

    def __str__(self):
        return f"Tick {self.tick.number} — {self.character}"
