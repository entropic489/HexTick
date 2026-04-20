from django.db import models

from .hex import Hex
from ..utils import modifier


class FactionAction(models.TextChoices):
    SUPPLY = 'supply', 'Supply'
    TRAVEL = 'travel', 'Travel'
    TRADE  = 'trade',  'Trade'
    MERGE  = 'merge',  'Merge'
    BATTLE = 'battle', 'Battle'
    TRAIN  = 'train',  'Train'
    CRAFT  = 'craft',  'Craft'
    DELVE  = 'delve',  'Delve'


class DiseaseType(models.TextChoices):
    MADNESS     = 'madness',     'Madness'
    BLACK_DEATH = 'black_death', 'Black Death'
    THE_RUNS    = 'the_runs',    'The Runs'
    RAVENOUS    = 'ravenous',    'Ravenous'
    BAD_FOOD    = 'bad_food',    'Bad Food'
    RESTLESS    = 'restless',    'Restless'


class Faction(models.Model):
    name = models.CharField(max_length=200)
    leader = models.ForeignKey(
        'world.Character', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='led_factions',
    )

    is_mobile = models.BooleanField(default=True)
    is_player_faction = models.BooleanField(default=False)
    is_gm_faction = models.BooleanField(default=False)

    # Core 1–100 attributes
    speed = models.IntegerField(default=0)
    population = models.IntegerField(default=50)
    technology = models.IntegerField(default=20)
    technology_max = models.IntegerField(default=50)
    resources = models.IntegerField(default=50)
    agreeableness = models.IntegerField(default=0)
    combat_skill = models.IntegerField(default=50)
    scouting = models.IntegerField(default=1)
    theology = models.IntegerField(default=50)

    current_action = models.CharField(
        max_length=20, choices=FactionAction.choices, null=True, blank=True
    )
    last_action = models.CharField(
        max_length=20, choices=FactionAction.choices, null=True, blank=True
    )

    # Set by Black Death for its duration; overrides the computed property
    population_trend_override = models.IntegerField(null=True, blank=True)

    # Counts consecutive days where resources < population; Famine triggers at 3
    famine_streak = models.IntegerField(default=0)

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

    @property
    def resource_generation(self) -> int:
        """Score (1–100). Modifier = score // 10."""
        return (self.population + self.technology) // 2

    @property
    def combat_skill_max(self) -> int:
        base = modifier((self.population + self.technology + self.resources) // 3)
        agreeableness_bonus = max(0, -self.agreeableness) // 10
        return base + agreeableness_bonus

    @property
    def population_trend(self) -> int:
        if self.famine_streak > 0:
            return -5 * self.famine_streak
        if self.population_trend_override is not None:
            return self.population_trend_override
        return (self.resources - self.population) // 10

    @property
    def max_speed(self) -> int:
        return modifier((self.population + self.resources + self.technology) // 3)

    def comfort(self, hex_resources: int) -> int:
        rg_modifier = self.resource_generation // 10
        value = self.population - self.resources + (rg_modifier * hex_resources)
        if self.diseases.filter(disease_type=DiseaseType.RESTLESS).exists():
            value //= 2
        return value

    @property
    def is_famine(self) -> bool:
        return self.famine_streak >= 3

    @property
    def is_dying(self) -> bool:
        return self.population < 20 and self.population_trend < 0

    def __str__(self):
        return self.name


class ActiveDisease(models.Model):
    faction = models.ForeignKey(
        Faction, on_delete=models.CASCADE, related_name='diseases'
    )
    disease_type = models.CharField(max_length=20, choices=DiseaseType.choices)
    duration_days_remaining = models.IntegerField()
    # Stores the rolled amount for reversible effects (The Runs, Bad Food, Restless)
    effect_value = models.IntegerField(default=0)

    class Meta:
        unique_together = [('faction', 'disease_type')]

    def __str__(self):
        return f"{self.get_disease_type_display()} on {self.faction}"
