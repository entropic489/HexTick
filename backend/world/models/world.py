from django.db import models


class AgeChoices(models.IntegerChoices):
    MAGIC    = 1, 'Age of Magic'
    ARTIFICE = 2, 'Age of Artifice'
    DESPAIR  = 3, 'Age of Despair'
    DYING    = 4, 'Age of Dying'


class MapType(models.TextChoices):
    REGIONAL = 'regional', 'Regional'
    CITY     = 'city',     'City'


class Map(models.Model):
    name = models.CharField(max_length=200)
    image = models.ImageField(upload_to='maps/')

    # Pixel radius of each hex — frontend uses this to derive hex centers from (row, col)
    hex_size = models.IntegerField(default=40)

    # Pixel position of the hex at (row=0, col=0)
    origin_x = models.IntegerField(default=0)
    origin_y = models.IntegerField(default=0)
    fog_of_war = models.BooleanField(default=True)

    map_type = models.CharField(max_length=20, choices=MapType.choices, default=MapType.REGIONAL)
    # City maps only: counts party actions within the current shift (0–2). Resets to 0 on shift tick.
    sub_tick = models.PositiveIntegerField(default=0)
    current_tick = models.ForeignKey(
        'world.Tick', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='+',
    )

    def __str__(self):
        return self.name
