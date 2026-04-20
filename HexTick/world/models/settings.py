from django.db import models


class WorldSettings(models.Model):
    trade_amount = models.IntegerField(default=5)

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
