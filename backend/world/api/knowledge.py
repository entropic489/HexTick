from typing import Optional

from ninja import Router, Schema
from django.shortcuts import get_object_or_404
from django.db import transaction

from world.models import Map
from world.models.characters import Knowledge

router = Router()


class KnowledgeRefSchema(Schema):
    id: int
    title: str


class KnowledgeSchema(Schema):
    id: int
    title: str
    description: str
    do_players_know: bool
    age: int
    related_knowledge: list[KnowledgeRefSchema]

    @staticmethod
    def resolve_related_knowledge(obj):
        return list(obj.related_knowledge.all())


class KnowledgePatchSchema(Schema):
    title: Optional[str] = None
    description: Optional[str] = None
    do_players_know: Optional[bool] = None
    age: Optional[int] = None
    related_knowledge: Optional[list[int]] = None


class KnowledgeCreateSchema(Schema):
    title: str
    description: str = ''
    do_players_know: bool = False
    age: int = 4
    related_knowledge: list[int] = []


@router.get("/maps/{map_id}/knowledge/", response=list[KnowledgeSchema])
def list_knowledge(request, map_id: int):
    get_object_or_404(Map, id=map_id)
    return list(Knowledge.objects.filter(map_id=map_id).prefetch_related('related_knowledge'))


@router.post("/maps/{map_id}/knowledge/", response=KnowledgeSchema)
@transaction.atomic
def create_knowledge(request, map_id: int, body: KnowledgeCreateSchema):
    map_obj = get_object_or_404(Map, id=map_id)
    obj = Knowledge.objects.create(
        map=map_obj,
        title=body.title,
        description=body.description,
        do_players_know=body.do_players_know,
        age=body.age,
    )
    if body.related_knowledge:
        obj.related_knowledge.set(Knowledge.objects.filter(id__in=body.related_knowledge))
    return obj


@router.patch("/knowledge/{knowledge_id}/", response=KnowledgeSchema)
@transaction.atomic
def patch_knowledge(request, knowledge_id: int, body: KnowledgePatchSchema):
    obj = get_object_or_404(Knowledge, id=knowledge_id)
    data = body.dict(exclude_unset=True)
    related_ids = data.pop('related_knowledge', None)
    for field, value in data.items():
        setattr(obj, field, value)
    obj.save()
    if related_ids is not None:
        obj.related_knowledge.set(Knowledge.objects.filter(id__in=related_ids))
    obj.related_knowledge.all()  # prefetch for resolver
    return obj
