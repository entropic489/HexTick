from ninja import Router, Schema, File, Form
from ninja.files import UploadedFile
from django.shortcuts import get_object_or_404
from django.db import transaction

from world.models import Map, GalleryImage

from .common import publish

router = Router()


class GalleryImageSchema(Schema):
    id: int
    name: str
    image: str
    is_published: bool

    @staticmethod
    def resolve_image(obj):
        return obj.image.url if obj.image else ''


@router.get("/maps/{map_id}/gallery/", response=list[GalleryImageSchema])
def list_gallery(request, map_id: int):
    get_object_or_404(Map, id=map_id)
    return list(GalleryImage.objects.filter(map_id=map_id))


@router.post("/maps/{map_id}/gallery/", response=GalleryImageSchema)
def upload_gallery_image(
    request,
    map_id: int,
    image: File[UploadedFile],
    name: Form[str] = '',
):
    map_obj = get_object_or_404(Map, id=map_id)
    img = GalleryImage(map=map_obj, name=name)
    img.image = image
    img.save()
    return img


@router.delete("/gallery/{image_id}/")
def delete_gallery_image(request, image_id: int):
    img = get_object_or_404(GalleryImage, id=image_id)
    img.image.delete(save=False)
    img.delete()
    return {'ok': True}


@router.patch("/gallery/{image_id}/publish/", response=GalleryImageSchema)
@transaction.atomic
def publish_gallery_image(request, image_id: int):
    img = get_object_or_404(GalleryImage, id=image_id)
    if img.is_published:
        img.is_published = False
        img.save(update_fields=['is_published'])
    else:
        GalleryImage.objects.filter(map=img.map, is_published=True).update(is_published=False)
        img.is_published = True
        img.save(update_fields=['is_published'])
    publish(img.map_id, {"type": "gallery_update"})
    return img
