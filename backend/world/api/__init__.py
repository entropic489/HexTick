"""HexTick API package.

`api.py` was split into per-resource routers (design_docs/code-review.md §1.2) —
a pure structural move with no behavior change. Importing this package builds the
single `NinjaAPI` instance and mounts every router at the root, preserving all
existing `/api/...` paths.

`api` and `tick_stream` are re-exported for `HexTick/urls.py`.
"""
from .common import api, tick_stream, _redis  # noqa: F401

from .maps import router as maps_router
from .hexes import router as hexes_router
from .factions import router as factions_router
from .knowledge import router as knowledge_router
from .tick import router as tick_router
from .party import router as party_router
from .gallery import router as gallery_router

api.add_router("/", maps_router)
api.add_router("/", hexes_router)
api.add_router("/", factions_router)
api.add_router("/", knowledge_router)
api.add_router("/", tick_router)
api.add_router("/", party_router)
api.add_router("/", gallery_router)
