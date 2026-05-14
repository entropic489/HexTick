# HexTick

> **Note to self:** Keep this file lean. Only add things that can't be recovered by reading the code — design intent, hard constraints, non-obvious quirks, architectural decisions. Field lists, formulas, and mechanics all live in the code; don't duplicate them here. Only update this file if you genuinely need to remember something for your next session that isn't obvious from the code.




A Django + React application that runs autonomous factions on a hex map, with player exploration following Cairn 2e rules. Runs locally via Docker Compose (three services: backend, frontend, redis).

## Stack

- **Backend**: Django 5.2 + Django Ninja (REST API), Python 3.13
- **Database**: PostgreSQL (`psycopg2-binary`) in Docker; SQLite locally via `USE_SQLITE=true`
- **Redis**: `redis:7-alpine` on port 6379. Used for SSE pub/sub cross-worker broadcast (`tick:{map_id}` channels). `REDIS_URL` env var consumed by `settings.py`; `_redis` client in `api.py` is module-level and shared across threads.
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
        world.py                # Map, AgeChoices
        hex.py                  # Hex, TerrainType, WeatherType, POIType, PointOfInterest
        faction.py              # Faction, Action, DiseaseType, ActiveDisease
        characters.py           # Item, Knowledge, Character, CharacterTick
        ticks.py                # Tick, HexTick, FactionTick, PartyTick
        party.py                # Party
        settings.py             # WorldSettings singleton
      api.py                    # Django Ninja API — all endpoints live here
      actions.py                # ALL game logic — tick, actions, encounters, diseases
      admin.py
      utils.py                  # modifier(), hex_distance(), adjacent_hexes()
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
- Admin static files (`/static/admin/…`) require `staticfiles_urlpatterns()` in `urls.py` (under `if settings.DEBUG`) because the backend runs under **gunicorn**, which does not auto-serve static files the way `manage.py runserver` does. `STATIC_ROOT = BASE_DIR / 'staticfiles'`; `collectstatic` runs in `backend-entrypoint.sh`.
- `map.image` is serialized by Django as the full `/media/maps/foo.png` path (not just the relative part). Use it directly as an `<img src>` or SVG `<image href>` — do not prepend `/media/` again.
- Vite proxies both `/api` and `/media` to the backend (`vite.config.ts`).

## Hard rules

**Models are dumb.** No game logic, no dice rolls, no side effects in model methods. Properties that compute derived values are fine. Anything that changes state or rolls dice lives in `actions.py`.

**`actions.py` is the game engine.** It imports models freely. Models never import from `actions.py`.

**Tick records are immutable.** `HexTick`, `FactionTick`, `CharacterTick` are history. Never update them after creation. All fields are `readonly_fields` in admin. `PartyTick` is the exception: on city maps, sub-tick actions within the same shift reuse the same `(tick, party)` record via `update_or_create` — the record is updated in place until the shift tick fires.

**`WorldSettings` is a singleton.** `save()` always forces `pk=1`. Always access via `WorldSettings.get()`. Holds `trade_amount` and `hex_resource_tick_modifier` — no tick state.

**Tick sequence is per-map.** `Map.current_tick` is the single source of truth for each map's tick number. `Tick` has a `map` FK; `unique_together = [('map', 'number')]`. `tick.number % 3 == 0` is a day; `tick.number % 21 == 0` is a week. Tick 0 never exists.

**`Map.map_type`** is either `regional` (default) or `city`. On city maps, `Map.sub_tick` counts party actions within the current shift (0–2). Each non-movement party action increments `sub_tick`; when `sub_tick % 3 == 0` it resets to 0 and `_run_shift` fires (advancing the global tick). **Movement on city maps does not consume a sub_tick** — it costs speed (still speed-gated by `terrain_difficulty`) but never increments `sub_tick` and never fires `_run_shift`. On regional maps, every party action fires `_run_shift` immediately. Factions still tick once per shift regardless of map type. `PartyTick.sub_tick` records where in the shift the action fell (0 = shift tick, 1 or 2 = mid-shift).

**Time of day** cycles every 3 ticks: `% 3 == 0` → Morning, `% 3 == 1` → Afternoon, `% 3 == 2` → Night. Current day displayed as `floor(tick / 3)`. Night adds +2 to `terrain_difficulty` for all movement (factions, characters, party) via `night_bonus()` in `utils.py`. The frontend `TimeOfDayBadge` component reads from `GET /api/maps/{map_id}/tick/current/`.

**DB queries stay out of the engine.** `tick_faction`, `tick_hex`, `tick_character` accept pre-fetched lists (`nearby_factions`, `candidate_hexes`, `factions_on_hex`). Don't add queries inside these functions.

**Migrations must be run by the user.** Never run `makemigrations` or `migrate` automatically. After model changes, instruct the user to run: `cd backend && pdm run python manage.py makemigrations && pdm run python manage.py migrate`.

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

**`AgeChoices` lives in `world.py`**, not alongside the models that use it. `PointOfInterest.age` and `Knowledge.age` both import from there.

**`TerrainType` is not a `TextChoices` enum.** It's a custom `str` subclass with `terrain_difficulty` and `resource_generation` as instance attributes. Use `TerrainType.from_value(str)` to look up by DB value. `terrain_difficulty` and `resource_generation` on `Hex` are `@property` — do not add them as DB columns.

**`modifier()`** — never inline `score // 10`. Always call `modifier()` from `world.utils`.

**`move_difficulty(origin, destination, tick_number)`** in `utils.py` is the single source of truth for movement cost. It encapsulates both terrain and night penalty, and the road rule: if both hexes `has_roads`, base cost is 1 and night adds +1 (not +2). Never inline `destination.terrain_difficulty + night_bonus(...)` for movement — always call `move_difficulty`. `night_bonus()` still exists for non-movement uses.

**`Hex.has_roads`** — BooleanField (default False). Road travel between two `has_roads` hexes always costs 1 base + 1 at night. Editable via GM hex edit panel.

**`Hex.has_rivers`** — BooleanField (default False). No mechanical effect yet — purely informational. Editable via GM hex edit panel. Shown as a label pill in the player hex view.

**Dungeon lookup filters `hidden=False`**: `hex.pois.filter(poi_type='dungeon', hidden=False).first()`.

**`HexTick` does not copy POIs** — they are accessed live via `hex.pois.all()`.

**Restless halves `comfort()`** — `comfort()` takes `has_restless: bool`. Callers in `actions.py` compute it via `any(d.disease_type == DiseaseType.RESTLESS for d in faction.diseases.all())` against the prefetched queryset.

**Disease re-contraction uses `update_or_create`** — resets duration rather than stacking.

---

## Faction types

| Flag | Auto-tick | Notes |
|---|---|---|
| `is_player_faction = True` | No | `current_action` must be set before tick runs |
| `is_gm_faction = True` | No | GM sets action via frontend modal |
| neither | Yes | `_select_action` runs each tick |

Dead factions (`is_dead = True`, set when `population <= 0`) are excluded from `_run_shift` entirely and do not tick.

## `_select_action` priority (NPC factions only)

Travel always moves one adjacent hex per tick (via `adjacent_hexes()`), never teleports. `travel()` falls back to supply/train if `faction.speed < terrain_difficulty`.

1. `faction.destination` set → step one adjacent hex toward destination, detouring around disagreeable factions (`agreeableness < 50`). Clears destination on arrival.
2. Disagreeable faction in scouting range AND `last_action != BATTLE` → battle (same hex) or step toward them
3. Outmatched (`combat_skill < closest.combat_skill`) → flee to best adjacent hex
4. `agreeableness < 0` and not outmatched → battle
5. `closest.agreeableness >= 0` AND `last_action != TRADE` → trade
6. `comfort(hex.resources) >= 0` → supply
7. `comfort < 0` → travel to best adjacent hex (min `terrain_difficulty - resources`)
8. Dungeon on hex (`hidden=False`) AND `resources > population` AND `d12 - modifier(theology) >= 9` → delve
9. `resources > population` AND `technology_max - technology > 10` → craft
10. Default → train

BATTLE and TRADE each have a 1-tick cooldown via `last_action`.

## Party

`Party` (`models/party.py`) is the player group. It selects its own hex to move to, which triggers a world tick. All fields are manually set — no auto-tick logic. If `faction` (OneToOneField) is set, that faction's `is_player_faction` should be `True`.

**Key fields**: `player_count` (number of players, default 1), `supplies` (party resource pool, default 0), `resource_generation`, `speed`, `max_speed`.

**Speed gating** — `POST /party/{id}/action/` with `action: 'move'` is rejected (400) if `destination.terrain_difficulty > party.speed`. The player must rest first. `action: 'rest'` resets `party.speed = party.max_speed` and counts as a full action (triggers `_run_shift`). Rest is always available.

**Supply consumption** — every Morning tick (`tick.number % 3 == 0`), `_run_shift` deducts `party.player_count` from `party.supplies` (floor 0). Supply action accepts an optional `amount` int; if provided, it is added to `party.supplies` before the tick runs.

**GM supply endpoint** — `PATCH /api/party/{id}/supplies/` with `{ supplies: int }` sets `party.supplies` directly (floor 0). Superseded by `PATCH /api/party/{id}/` for GM use — the broader endpoint is what `HexPanel` now calls. The supplies-only endpoint remains but is no longer wired to any UI.

`PartyTick` snapshots `current_hex`, `destination`, `action`, `last_action`, and `notes` (GM freetext) each tick. Notes can be updated after the fact via `PATCH /api/party/{id}/ticks/{tick_id}/notes/`.

---

## GM hex editing

The GM view has two modes toggled by the **Prep / Play** button in the top bar. The button label always shows the *next* state (click "Prep" to enter prep mode, click "Play" to leave it).

**Prep mode** — `prepMode: boolean` in Zustand. When true, selecting a hex immediately opens it in edit mode. When false, the hex panel opens in view mode and an **Edit** button is available to switch. Exiting prep mode also clears multi-select state.

**Multi-select mode** — `multiSelectMode: boolean` in Zustand, only available in prep mode. Toggled via the **Multi** button in the GM header (shows count badge when hexes are selected). In this mode hex clicks call `toggleSelectedHex` instead of `setSelectedHexId`; selected hexes render with a gold highlight. The sidebar swaps to `BulkHexPanel`, which edits `terrain_type`, `has_roads`, `has_rivers`, `player_visible`, `player_explored` across all selected hexes via `POST /api/hexes/bulk-patch/`. Checkboxes are tri-state: indeterminate = no change, checked = set true, unchecked = set false. Saving or cancelling exits multi-select mode.

**Edit mode** (inside `HexPanel`) — edits `terrain_type`, `weather`, `resources`, `encounter_likelihood`, `player_explored`, `player_visible` in-place. Saved via `PATCH /api/hexes/{hex_id}/`. On save, React Query invalidates `['hexes', mapId]`. Cancel reverts draft to the current server state.

**Add POI** — the `+ Add POI` button in edit mode opens `AddPOIModal`. Fields shown are conditional on `poi_type` (difficulty and title on dungeon; difficulty on ruin; monster_type on monster_base; description/notes on dungeon only). Age and the three visibility flags are always shown. M2M fields (`items`, `knowledge`) and the `faction` FK (village) are not editable from this modal. POI is created via `POST /api/hexes/{hex_id}/pois/`.

**POI detail expand** — in view mode, each POI row is a clickable button. Clicking toggles an inline detail panel showing difficulty, description, GM notes, and visible/explored flags. Click again to collapse.

**Move party** — in view mode, a "Move party here" button appears (right-aligned, above the party footer) whenever the selected hex is not the party's current hex. It calls `PATCH /api/party/{id}/` with `{ current_hex: hex.id }` — no speed-gating, GM teleport only.

**Add Faction** — the `+ Add Faction` button in edit mode opens `AddFactionModal`. Fields: name, color (hex color picker + text), speed, population, technology, resources, combat_skill, agreeableness, theology, location (current hex, defaults to the selected hex), and faction type flags (mobile, GM faction, player faction). Destination is not set at creation. Created via `POST /maps/{map_id}/factions/`.

**Faction arrows** — rendered in `HexMap` as an SVG layer above hex cells. Each faction with a `current_hex` gets a three-layer arrow (glow halo + solid shaft + white highlight, with a custom arrowhead marker per color). Factions with a `destination` draw a movement arrow from their hex to the destination; factions without a destination draw a short upward arrow on their hex. The 2-letter label in each hex also uses the faction's color.

---

## Knowledge

`Knowledge` has a `map` FK (`CASCADE`). The frontend page lives at `/map/:mapId/knowledge` and fetches only knowledge for that map.

`related_knowledge` is a **directional** (asymmetrical) self-referential M2M. A→B does not imply B→A. The API accepts a list of IDs on both `POST /knowledge/` and `PATCH /knowledge/{id}/` and calls `.set()` to replace the full relation.

Both `Faction` and `Character` have a `knowledge` M2M to `Knowledge`. Exposed as `list[int]` (IDs) on their schemas. Editable via `PATCH /api/factions/{id}/` and `PATCH /api/characters/{id}/` by passing a `knowledge` list — replaces the full relation with `.set()`.

The `KnowledgePage` is a GM-only view (linked from the GMPage header). No player-facing knowledge UI exists.

---

## Characters

`Character` lives in `models/characters.py`. Characters belong to a `Faction` (FK, nullable) and optionally have a `current_hex`. The list endpoint returns characters where `current_hex` or `faction.current_hex` is on the requested map.

**API**: `GET /maps/{map_id}/characters/`, `POST /maps/{map_id}/characters/`, `PATCH /characters/{id}/`.

**Frontend**: `CharactersPage` at `/map/:mapId/characters`, linked from the GMPage header. Inline edit row (all fields) + create modal. Knowledge multi-select uses the same `KnowledgeDropdown` pattern as `KnowledgePage`.

**`resolve_knowledge` pattern** — both `FactionSchema` and `CharacterSchema` resolve knowledge IDs as `[k.id for k in obj.knowledge.all()]`. Do NOT use `.values_list()` here — it bypasses the prefetch cache and causes N+1 queries. The list endpoints use `.prefetch_related('knowledge')` and a single `Q`-filtered queryset (not `|` union) to avoid Django's "cannot combine unique with non-unique" error.

---

## Non-obvious admin behaviours

**`HexAdmin` supports structured search** — `get_search_results` is overridden to parse `key=value` tokens. `map=name`, `row=3`, `col=4` apply as exact filters; anything else falls through to the normal `icontains` search. Mixed queries like `map=Ashenvale row=2 col=5` work.

**`Map.fog_of_war`** — controls whether `PlayerPage` renders fog. `GMPage` is hardcoded to `fogOfWar={false}` and ignores this flag. Togglable via admin actions on the Map list.

**`Map.player_actions_locked`** — BooleanField toggled via `PATCH /api/maps/{map_id}/locked/`. When true, the "Actions…" button on `PlayerPage` is disabled. The lock endpoint publishes to the SSE channel (`tick:{map_id}`) after saving so the player view updates immediately without a tick firing. `useTickStream` invalidates `['map', mapId]` on every SSE message for this reason.

---

## Gallery

`GalleryImage` (`models/gallery.py`) belongs to a `Map` (FK, CASCADE). Fields: `name`, `image` (ImageField → `gallery/`), `is_published` (BooleanField).

Only one image can be published at a time — `PATCH /gallery/{id}/publish/` auto-unpublishes any previously published image before setting the new one. Toggling a published image unpublishes it.

Publishing/unpublishing broadcasts `type: "gallery_update"` on the SSE channel (`tick:{map_id}`). `useTickStream` parses the event type and invalidates only `['gallery', mapId]` — it does **not** trigger a full tick invalidation for gallery events.

`PlayerPage` renders a fullscreen overlay (`z-index: 200`) when any gallery image has `is_published = true`. There is no close button on the player side — the GM controls visibility via Publish/Unpublish.

The GM can unpublish from two places: the **Gallery page** header button (prominent, only visible when something is live) and the **GMPage** header button (same — appears only when an image is published).

File upload uses the same multipart/form-data pattern as map image upload: `File[UploadedFile]` + `Form[str]` on the backend, `api.postForm(FormData)` on the frontend. Do not diverge from this pattern.

Route: `/map/:mapId/gallery` → `GalleryPage`. Linked via "Gallery" button in the GMPage header.

**Faction images** — `Faction` has an `image` FK to `GalleryImage` (nullable, `SET_NULL`). Assignable via `PATCH /api/factions/{id}/` with `{ "image": <gallery_image_id> }`, via the faction edit form in `HexPanel` (GM mode only — `<select>` populated from `['gallery', map.id]`), or via Django admin. When a player clicks **Interact** on a faction that has an image set, `PATCH /gallery/{id}/publish/` fires immediately (no modal) — the SSE broadcast triggers the fullscreen overlay on `PlayerPage`. Factions without an image open the standard flavour-text `InteractModal` instead.

---

## What's not wired up yet

**API**
- `PATCH /api/factions/{id}/action/` not yet implemented as a dedicated endpoint — `next_action` is now editable via `PATCH /api/factions/{id}/` from the HexPanel faction detail
- Party is fetched via `GET /api/maps/{map_id}/party/` (one party per map via `OneToOneField`). `PATCH /api/party/{id}/` exists and accepts `player_count`, `supplies`, `speed`, `max_speed`, `resource_generation`, `current_action`, `current_hex` (all optional). `current_hex` accepts a hex ID and teleports the party with no speed check.
- Reverse tick not implemented — returns 501 per spec; engine has no undo
- No API endpoint to edit or delete existing POIs — use Django admin for that

**Backend**
- `FactionTick` does not snapshot `last_action`, `next_action`, `notes`, `is_gm_faction`, or `is_player_faction`
- `update_character_visibility()` is not called anywhere in the tick flow — needs a home in step 6 of `_run_shift`

**Frontend**
- "Show on map" on the Factions page selects the faction's hex but does not pan/zoom to it. Programmatic pan requires exposing the ref-based transform in `HexMap` — deferred.
- `PlayerPage` fetches the party via `['party', mapId]` and passes `party.id` to `POST /api/party/{id}/action/`.
- `HexPanel` accepts an optional `party` prop — renders a pinned footer with party stats (speed, hex, destination, action, resource gen). `PlayerPage` passes `factions` filtered to `selectedHex.id` (for the selected-hex view) and `partyHexFactions` filtered to `party.current_hex` (non-player factions only) — the latter renders the **Factions Present** footer with Interact buttons regardless of which hex is selected. The faction detail expand and edit form are gated behind `gmMode`. In `gmMode` the footer has an Edit button that opens an inline edit form for `player_count`, `supplies`, `speed`, `max_speed`, `resource_generation`, and `current_action`; saved via `PATCH /party/{id}/`.
- Player view renders a **hex labels bar** (pill badges) below the hex info when `player_visible || player_explored`. Labels: terrain type, weather (both shown if `player_visible || player_explored`), Roads (if `has_roads`), Rivers (if `has_rivers`).
- POI player-mode visibility rule is `!hidden` (not `player_visible`) — any non-hidden POI renders for the player.
- `ActionModal` is built and wired into `PlayerPage` — opens via "Actions…" button when a hex is selected. Offers Move, Supply, Delve, Search, Social. Each action is enabled/disabled based on context (current hex vs other hex, dungeon presence). `Social` action records the tick but has no game effect.
- GM faction action-setting modal not yet built — `next_action`, `destination`, `notes`, and `agreeableness` are now editable from the HexPanel faction expand/edit, but a dedicated modal for full faction management is not built
- `patchPartyTickNotes` wired in `api/tick.ts` but no UI to trigger it
- HexMap scroll-to-zoom is broken — anchor drifts toward bottom-right when cursor is not at top-left. Root cause unknown after investigation; pan/zoom now uses native listeners + direct SVG style mutation (refs, no React state). Needs a fresh look.
- `AddPOIModal` does not support setting the `faction` FK (village type) — needs a faction picker

**Map / hex creation**
- `POST /api/maps/` uses Pillow to infer rows/cols from image dimensions ÷ hex size — approximate, ignores origin offset. Formula: `cols = floor(w / (size * 1.5))`, `rows = floor(h / (size * √3))`.
- CreateMap page has a zoomable/pannable origin picker. `image_path` (relative to `MEDIA_ROOT`) lets you reuse an existing uploaded image without re-uploading.
