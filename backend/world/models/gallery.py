from django.db import models


class GalleryImage(models.Model):
    map = models.ForeignKey('world.Map', on_delete=models.CASCADE, related_name='gallery_images')
    name = models.CharField(max_length=200, blank=True)
    image = models.ImageField(upload_to='gallery/')
    is_published = models.BooleanField(default=False)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return self.name or f"Gallery image {self.pk}"
