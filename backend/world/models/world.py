from django.db import models


class Map(models.Model):
    name = models.CharField(max_length=200)
    image = models.ImageField(upload_to='maps/')

    # Pixel radius of each hex — frontend uses this to derive hex centers from (row, col)
    hex_size = models.IntegerField(default=40)

    # Pixel position of the hex at (row=0, col=0)
    origin_x = models.IntegerField(default=0)
    origin_y = models.IntegerField(default=0)

    def __str__(self):
        return self.name
