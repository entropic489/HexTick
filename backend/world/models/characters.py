from django.db import models

from .world import AgeChoices, Map


class Knowledge(models.Model):
    map = models.ForeignKey(Map, on_delete=models.CASCADE, related_name='knowledge')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    do_players_know = models.BooleanField(default=False)
    age = models.IntegerField(choices=AgeChoices.choices, default=AgeChoices.DYING)
    related_knowledge = models.ManyToManyField('self', blank=True, symmetrical=False)

    def __str__(self):
        return self.title
