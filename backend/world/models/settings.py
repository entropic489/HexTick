from django.db import models


class WorldSettings(models.Model):
    trade_amount = models.IntegerField(default=5)
    hex_resource_tick_modifier = models.IntegerField(default=5)
    current_tick = models.ForeignKey(
        'world.Tick', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='+',
    )

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    class Meta:
        verbose_name = 'World Settings'
        verbose_name_plural = 'World Settings'
