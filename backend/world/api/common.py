"""Shared API infrastructure: the NinjaAPI instance, the Redis client, SSE
helpers, and schemas used by more than one router.

All SSE publishes go through `publish()` / `broadcast_tick()` so they read the
module-level `_redis` at call time — this is the object tests patch
(`world.api.common._redis`) to capture broadcasts.
"""
import json
from typing import Optional

import redis
from django.conf import settings as django_settings
from django.http import StreamingHttpResponse
from ninja import NinjaAPI, Schema

api = NinjaAPI(urls_namespace="api")

_redis = redis.Redis.from_url(django_settings.REDIS_URL, decode_responses=True)


def _sse_channel(map_id: int) -> str:
    return f"tick:{map_id}"


def publish(map_id: int, payload: dict) -> None:
    _redis.publish(_sse_channel(map_id), json.dumps(payload))


def broadcast_tick(map_id: int, tick_number: int) -> None:
    _redis.publish(_sse_channel(map_id), json.dumps({"tick_number": tick_number}))


def tick_stream(request, map_id: int):
    def event_stream():
        pubsub = _redis.pubsub()
        pubsub.subscribe(_sse_channel(map_id))
        try:
            yield "retry: 3000\n\n"
            # Poll with a timeout instead of blocking forever in listen(): when no
            # message arrives within the window, emit a keepalive comment so idle
            # connections aren't dropped by proxies/browsers.
            while True:
                message = pubsub.get_message(ignore_subscribe_messages=True, timeout=15.0)
                if message is None:
                    yield ": keepalive\n\n"
                elif message["type"] == "message":
                    yield f"data: {message['data']}\n\n"
        finally:
            pubsub.unsubscribe()
            pubsub.close()

    response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


# --- Schemas shared across routers ---

class TickEventSchema(Schema):
    type: str
    message: str
    faction_id: Optional[int] = None
    hex_id: Optional[int] = None


class TickResponseSchema(Schema):
    tick_number: int
    events: list[TickEventSchema]
