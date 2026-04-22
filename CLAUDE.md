# HexTick

> **Note to self:** Keep this file lean. Only add things that can't be recovered by reading the code — design intent, hard constraints, non-obvious quirks, architectural decisions. Field lists, formulas, and mechanics all live in the code; don't duplicate them here.



A Django + React application that runs autonomous factions on a hex map, with player exploration following Cairn 2e rules. Runs locally via Docker Compose (two services: backend and frontend).

## Stack

- **Backend**: Django 5.2 + Django Ninja (REST API), Python 3.13
- **Database**: PostgreSQL (`psycopg2-binary`) in Docker; SQLite locally via `USE_SQLITE=true`
- **Package manager**: PDM (`pyproject.toml` + `pdm.lock`). Deps exported to `requirements.txt` at build time via `pdm export`; pip installs into the system Python — no venv in the container.
- **Frontend**: React 19 + TypeScript + Vite, CSS Modules, React Query + Zustand, React Router. Standalone SPA served on port 5173. Proxies `/api/*` to the Django backend.

## Running locally

```bash
cp .env.example .env   # fill in values
docker-compose up      # backend: :8000, frontend: :5173
                       # migrate runs automatically via backend-entrypoint.sh
```

For one-off management commands outside Docker:
```bash
cd backend && pdm run <command>   # e.g. pdm run makemigrations, pdm run migrate
```

After changing `pyproject.toml`, rebuild: `docker-compose up --build`.
After changing frontend `package.json`, run `npm install` in `frontend/` locally (node_modules are not installed in the container image).

## Project layout

```
<repo root>/
  backend/                      # Django project root (contains manage.py)
    HexTick/                    # Django config package (settings, urls, wsgi)
    world/                      # The only Django app
      models/
        __init__.py             # re-exports everything; import from here
        world.py                # Map
        hex.py                  # Hex, TerrainType, WeatherType, POIType, PointOfInterest
        faction.py              # Faction, Action, DiseaseType, ActiveDisease
        characters.py           # Item, Knowledge, Character, CharacterTick
        ticks.py                # Tick, HexTick, FactionTick, PartyTick
        party.py                # Party
        settings.py             # WorldSettings singleton
      api.py                    # Django Ninja API — all endpoints live here
      actions.py                # ALL game logic — tick, actions, encounters, diseases
      admin.py
      utils.py                  # modifier(), hex_distance()
  frontend/                     # Vite React app
    src/
      api/                      # fetch wrappers (client.ts, maps.ts, tick.ts)
      components/               # HexMap, HexPanel, AddPOIModal, TickControls, EventLog
      pages/                    # MapSelection, GMPage, PlayerPage
      store/useGameStore.ts     # Zustand: selectedMapId, selectedHexId, pendingEvents, prepMode
      types/index.ts            # TypeScript interfaces mirroring Django models
  design_docs/                  # API.md, Factions.md
  docker-compose.yml
  Dockerfile                    # Python only — frontend uses node:22-alpine image directly
```

## Docker networking

- Frontend proxies `/api/*` to `http://web:8000` (Docker service name, set via `VITE_BACKEND_URL` env var).
- `web` must be in Django's `ALLOWED_HOSTS`.
- Vite dev server binds to `0.0.0.0` so it's reachable from the host.
- Media files (`/media/`) are served by Django via `urls.py` using `static()` — only active when `DEBUG=True`. In production, serve via nginx or a storage backend.
- `map.image` is serialized by Django as the full `/media/maps/foo.png` path (not just the relative part). Use it directly as an `<img src>` or SVG `<image href>` — do not prepend `/media/` again.
- Vite proxies both `/api` and `/media` to the backend (`vite.config.ts`).

## Hard rules

**Models are dumb.** No game logic, no dice rolls, no side effects in model methods. Properties that compute derived values are fine. Anything that changes state or rolls dice lives in `actions.py`.

**`actions.py` is the game engine.** It imports models freely. Models never import from `actions.py`.

**Tick records are immutable.** `HexTick`, `FactionTick`, `CharacterTick`, `PartyTick` are history. Never update them after creation. All fields are `readonly_fields` in admin.

**`WorldSettings` is a singleton.** `save()` always forces `pk=1`. Always access via `WorldSettings.get()`. Holds `current_tick` FK — the single source of truth for the global tick number.

**Tick sequence starts at 1.** `tick.number % 3 == 0` is a day; `tick.number % 21 == 0` is a week. Tick 0 never exists.

**DB queries stay out of the engine.** `tick_faction`, `tick_hex`, `tick_character` accept pre-fetched lists (`nearby_factions`, `candidate_hexes`, `factions_on_hex`). Don't add queries inside these functions.

---

## Hex coordinate system

**Rows increase upward, cols increase rightward** (standard tabletop convention). `origin_x`/`origin_y` on `Map` is the pixel center of the **bottom-left hex** (row=0, col=0) in the map image.

`hexToPixel(row, col, size, originX, originY)` in `hexGeometry.ts`:
- `x = originX + col * size * 1.5`
- `y = originY - row * size * √3 - (col % 2 === 1 ? size * √3 / 2 : 0)`

`mapBounds` returns `{ width, height, viewBox }`. The SVG uses `viewBox` when rendering without a background image (no hexes yet), and natural image dimensions when the image is loaded.

**All hex coordinates are in image-pixel space.** The SVG transform zooms/pans the whole scene uniformly — hex grid and background image never drift relative to each other.

---

## Non-obvious quirks

**`TerrainType` is not a `TextChoices` enum.** It's a custom `str` subclass with `terrain_difficulty` and `resource_generation` as instance attributes. Use `TerrainType.from_value(str)` to look up by DB value. `terrain_difficulty` and `resource_generation` on `Hex` are `@property` — do not add them as DB columns.

**`modifier()`** — never inline `score // 10`. Always call `modifier()` from `world.utils`.

**Dungeon lookup filters `hidden=False`**: `hex.pois.filter(poi_type='dungeon', hidden=False).first()`.

**`HexTick` does not copy POIs** — they are accessed live via `hex.pois.all()`.

**Restless halves `comfort()`** — implemented inside the property with a DB query. Be aware if calling in a hot loop.

**Disease re-contraction uses `update_or_create`** — resets duration rather than stacking.

---

## Faction types

| Flag | Auto-tick | Notes |
|---|---|---|
| `is_player_faction = True` | No | `current_action` must be set before tick runs |
| `is_gm_faction = True` | No | GM sets action via frontend modal |
| neither | Yes | `_select_action` runs each tick |

## `_select_action` priority (NPC factions only)

1. `faction.destination` set → travel, detouring around disagreeable factions (`agreeableness < 50`)
2. Disagreeable faction in scouting range AND `last_action != BATTLE` → battle (same hex) or set destination and travel
3. Outmatched (`combat_skill < closest.combat_skill`) → flee
4. `agreeableness < 0` and not outmatched → battle
5. `closest.agreeableness >= 0` AND `last_action != TRADE` → trade
6. `comfort(hex.resources) >= 0` → supply
7. `comfort < 0` → travel to best hex (min `terrain_difficulty - resources`)
8. Dungeon on hex (`hidden=False`) AND `resources > population` AND `d12 - modifier(theology) >= 9` → delve
9. `resources > population` AND `technology_max - technology > 10` → craft
10. Default → train

BATTLE and TRADE each have a 1-tick cooldown via `last_action`.

## Party

`Party` (`models/party.py`) is the player group. It selects its own hex to move to, which triggers a world tick. All fields are manually set — no auto-tick logic. If `faction` (OneToOneField) is set, that faction's `is_player_faction` should be `True`.

`PartyTick` snapshots `current_hex`, `destination`, `action`, `last_action`, and `notes` (GM freetext) each tick. Notes can be updated after the fact via `PATCH /api/party/{id}/ticks/{tick_id}/notes/`.

---

## GM hex editing

The GM view has two modes toggled by the **Prep / Play** button in the top bar. The button label always shows the *next* state (click "Prep" to enter prep mode, click "Play" to leave it).

**Prep mode** — `prepMode: boolean` in Zustand. When true, selecting a hex immediately opens it in edit mode. When false, the hex panel opens in view mode and an **Edit** button is available to switch.

**Edit mode** (inside `HexPanel`) — edits `terrain_type`, `weather`, `resources`, `encounter_likelihood`, `player_explored`, `player_visible` in-place. Saved via `PATCH /api/hexes/{hex_id}/`. On save, React Query invalidates `['hexes', mapId]`. Cancel reverts draft to the current server state.

**Add POI** — the `+ Add POI` button in edit mode opens `AddPOIModal`. Fields shown are conditional on `poi_type` (difficulty and title on dungeon; difficulty on ruin; monster_type on monster_base; description/notes on dungeon only). Age and the three visibility flags are always shown. M2M fields (`items`, `knowledge`) and the `faction` FK (village) are not editable from this modal. POI is created via `POST /api/hexes/{hex_id}/pois/`.

**POI detail expand** — in view mode, each POI row is a clickable button. Clicking toggles an inline detail panel showing difficulty, description, GM notes, and visible/explored flags. Click again to collapse.

**Add Faction** — the `+ Add Faction` button in edit mode opens `AddFactionModal`. Fields: name, color (hex color picker + text), speed, population, technology, resources, combat_skill, location (current hex, defaults to the selected hex), and faction type flags (mobile, GM faction, player faction). Destination is not set at creation. Created via `POST /maps/{map_id}/factions/`.

**Faction arrows** — rendered in `HexMap` as an SVG layer above hex cells. Each faction with a `current_hex` gets a three-layer arrow (glow halo + solid shaft + white highlight, with a custom arrowhead marker per color). Factions with a `destination` draw a movement arrow from their hex to the destination; factions without a destination draw a short upward arrow on their hex. The 2-letter label in each hex also uses the faction's color.

---

## What's not wired up yet

**API**
- `PATCH /api/factions/{id}/action/` not yet implemented as a dedicated endpoint — `next_action` is now editable via `PATCH /api/factions/{id}/` from the HexPanel faction detail
- `GET /api/party/{id}/` not yet implemented — no endpoint to fetch party state
- Reverse tick not implemented — returns 501 per spec; engine has no undo
- No endpoint to edit or delete existing POIs

**Backend**
- `FactionTick` does not snapshot `last_action`, `next_action`, `notes`, `is_gm_faction`, or `is_player_faction`
- `Knowledge` FK on `Character` is commented out — pending decision on whether characters carry knowledge directly
- `update_character_visibility()` is not called anywhere in the tick flow — needs a home in step 6 of `_run_shift`

**Frontend**
- "Show on map" on the Factions page selects the faction's hex but does not pan/zoom to it. Programmatic pan requires exposing the ref-based transform in `HexMap` — deferred.
- `PlayerPage` passes `playerFaction.id` as the party ID to `POST /api/party/{id}/action/` — should be `Party.id`. Needs a party fetch in the component.
- Party action radial menu (Search, Move, Explore, Supply) not yet built
- GM faction action-setting modal not yet built — `next_action`, `destination`, and `notes` are now editable from the HexPanel faction expand/edit, but a dedicated modal for full faction management is not built
- `patchPartyTickNotes` wired in `api/tick.ts` but no UI to trigger it
- HexMap scroll-to-zoom is broken — anchor drifts toward bottom-right when cursor is not at top-left. Root cause unknown after investigation; pan/zoom now uses native listeners + direct SVG style mutation (refs, no React state). Needs a fresh look.
- `AddPOIModal` does not support setting the `faction` FK (village type) — needs a faction picker

**Map / hex creation**
- `POST /api/maps/` uses Pillow to infer rows/cols from image dimensions ÷ hex size — approximate, ignores origin offset. Formula: `cols = floor(w / (size * 1.5))`, `rows = floor(h / (size * √3))`.
- CreateMap page has a zoomable/pannable origin picker. `image_path` (relative to `MEDIA_ROOT`) lets you reuse an existing uploaded image without re-uploading.
