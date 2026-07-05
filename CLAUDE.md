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
cd backend && pdm run <command>   # e.g. pdm run makemigrations, pdm run migrate, pdm run test
```

After changing `pyproject.toml`, rebuild: `docker-compose up --build`.
After changing frontend `package.json`, run `npm install` in `frontend/` locally (node_modules are not installed in the container image).

**On this dev machine, `pdm` is not on the Windows host or reachable from a Claude Code Bash tool call.** The Bash tool here runs Git-Bash/MSYS2 (`MINGW64`), which has no `pdm` or `python3.13` on PATH, and the Windows host itself only has Python 3.11/3.12 installed (the project pins `requires-python = "==3.13.*"`). The actual PDM project — with a pdm-managed Python 3.13 interpreter already provisioned — lives inside the WSL distro **`Ubuntu-22.04`**, which mounts this repo at `/mnt/c/Users/jfink/OneDrive/Documents/Projects/HexTick`. Run pdm/pytest commands via PowerShell:
```powershell
wsl -d Ubuntu-22.04 -- bash -lc "cd /mnt/c/Users/jfink/OneDrive/Documents/Projects/HexTick && pdm run test"
```
The running `hextick-web-1` Docker container also has `pdm` installed (`docker exec hextick-web-1 pdm ...`) as a fallback if WSL isn't available.

**`node`/`npm`/`npx` are not on the Windows host or reachable from a Claude Code Bash tool call either** (Git-Bash/MSYS2 has none of them on PATH, and PowerShell finds no `node`/`npm` command on this machine). Run frontend commands (`npx tsc --noEmit`, etc.) inside the running `hextick-frontend-1` container, which has `node_modules` already installed:
```powershell
docker exec hextick-frontend-1 npx tsc --noEmit
```

## Project layout

```
<repo root>/
  backend/                      # Django project root (contains manage.py)
    HexTick/                    # Django config package (settings, urls, wsgi)
    world/                      # The only Django app
      models/
        __init__.py             # re-exports everything; import from here
        world.py                # Map, AgeChoices, WeatherType, MapType
        hex.py                  # Hex, TerrainType, POIType, PointOfInterest
        faction.py              # Faction, Action
        ticks.py                # Tick, HexTick, FactionTick, PartyTick
        party.py                # Party
        settings.py             # WorldSettings singleton
      api/                      # Django Ninja API, split into per-resource routers
        __init__.py             # builds the NinjaAPI, mounts every router at '/'
        common.py               # api instance, _redis, SSE helpers (publish/broadcast_tick/tick_stream), shared tick schemas
        maps.py hexes.py factions.py tick.py party.py gallery.py
        # Routers are thin: validate/serialize + SSE plumbing. Error paths call common.api.create_response.
      actions.py                # ALL game logic — faction/hex/party tick, party actions.
                                # run_shift() (shift orchestration) and perform_party_action()
                                # (party action rules, raises PartyActionError) live here; the
                                # tick.py/party.py routers call them.
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

## Testing

Backend tests use **pytest + pytest-django**, not `manage.py test`. Config lives in root `pyproject.toml` (`[tool.pytest.ini_options]`): `DJANGO_SETTINGS_MODULE`, `pythonpath = ["backend"]`, `testpaths = ["backend/world/tests"]`. `pytest`, `pytest-django`, and `pytest-cov` are in the `test` PDM dependency-group (`[dependency-groups]`), not the main `dependencies` list.

Run via `pdm run test` (a `[tool.pdm.scripts]` entry) — this sources `.env` then forces `USE_SQLITE=true` regardless of what `.env` has for the Postgres vars, since `.env`'s `DB_HOST=db` only resolves inside Docker Compose. Add coverage with `pdm run test --cov=world --cov-report=term-missing` (the `world` package is on `pythonpath`).

Engine tests live in `backend/world/tests/`. `conftest.py` provides DB-backed factory fixtures (`map_factory`, `hex_factory`, `faction_factory`) — each creates the minimal valid instance and lets kwargs override fields; factories build their own dependency (e.g. `hex_factory` makes a `map_factory()` if none is passed).

**API tests live in `backend/world/tests/api/`** — one module per resource (`test_maps`/`test_hexes`/`test_factions`/`test_tick`/`test_party`/`test_gallery`), grouped to mirror the router split so each file sits next to its router. They are **pinning/characterization tests** locking current behavior so that split is verifiable as behavior-preserving. Harness in `tests/api/conftest.py`:
- Drives the real Django URLconf (`/api/...`) via a `django.test.Client` JSON wrapper (`client` fixture) constructed with `raise_request_exception=False`, so known-crash paths (H6/H7) can be pinned by status code (500) instead of raising. Use `.post_multipart(...)` for the `File`/`Form` endpoints (`create_map`, gallery upload).
- Replaces module-level `world.api._redis` with a **recording fake** (autouse `fake_redis`), since some endpoints publish synchronously (`locked`/`weather`/`highlight`/gallery `publish`) while `on_commit` broadcasts stay silent under the rolled-back test transaction (use `django_capture_on_commit_callbacks(execute=True)` to force + assert those).
- **Overrides `map_factory`** to give maps a non-empty `image` name — `MapSchema.image` is typed `str` and Ninja's `FieldFile` encoder returns `None` for an empty `ImageField` (a 500 on serialize). This override flows into `hex_factory`/`faction_factory` too.

Some tests intentionally **pin current, known-buggy behavior** documented in `design_docs/code-review.md` rather than the intended behavior — marked with a `CHARACTERIZATION — pins <id>` comment (remaining: H5/H6/H7/M3/M8). Expect each to need rewriting the moment its finding is fixed. (The faction-simplification pass removed the H1/H2/M1/M2 pins by deleting the behavior they described.)

### Frontend tests

Frontend tests use **Vitest + React Testing Library + jsdom**. Config lives in `frontend/vite.config.ts` under the `test` key (`globals: true`, `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']`). The setup file registers `@testing-library/jest-dom` matchers and runs `cleanup()` after each test. Tests are colocated as `*.test.ts`/`*.test.tsx` next to the code they cover.

Current coverage (116 tests): `utils/moveCost`, `components/HexMap/hexGeometry`, `store/useGameStore`, `hooks/useTickStream`, `api/client`, `api/maps`, `api/tick`, `api/gallery`, and the components `TimeOfDayBadge`, `EventLog`, `DiceModal`, `MonsterModal`, `NPCModal`, `LastActionResultModal`, `ActionModal`, `AddFactionModal`, `AddPOIModal`, `BulkHexPanel`, and `HexPanel`. Patterns worth reusing:
- **Shared render helper** — `src/test/renderWithProviders.tsx` wraps RTL `render` in a fresh `QueryClient` (`retry: false`) + `MemoryRouter` and resets `useGameStore` to its module-load snapshot in a `beforeEach` (registered on import). Use it for any component touching React Query, routing, or the store; seed cache via the returned `queryClient.setQueryData(...)`. Pass `routerEntries` for route-dependent components.
- **Component api mocking** — `vi.mock('../../api/maps' | '../../api/tick' | '../../api/gallery', …)` with `vi.fn()` stubs keeps form/action components offline; assert the submitted body off `mock.calls`. `HexPanel` mocks all three (its gallery query is `enabled` under `gmMode`).
- **HexPanel** is pinned (view/edit toggle, GM-only gating via `gmMode`, "Move party here" visibility, Last Action Result panel) **before** its planned extraction — treat these as characterization tests to preserve through the refactor.
- **Clipboard** (`MonsterModal`/`NPCModal` copy) — spy on `navigator.clipboard.writeText`, defining a stub first if jsdom lacks one; do NOT `vi.stubGlobal('navigator', …)` (breaks `user-event`).
- **Zustand store** — snapshot the initial state once at module load (`const initial = useGameStore.getState()`) and restore it in `beforeEach` via `useGameStore.setState(initial, true)` (the `true` replaces rather than merges). Call actions through `useGameStore.getState()` directly — no React needed.
- **`useTickStream` hook** — install a fake `EventSource` class on `globalThis` (records instances, exposes an `emit(data)` that calls `onmessage` with `JSON.stringify`), render with `renderHook` wrapped in a `QueryClientProvider`, and `vi.spyOn(qc, 'invalidateQueries')` to assert which query keys each SSE event type invalidates.
- **`api/client`** — stub `fetch` with `vi.stubGlobal('fetch', vi.fn())` (unstub in `afterEach`); assert method/body/headers off `fetchMock.mock.calls[0][1]`. Resolve `BASE` the same way `client.ts` does (`import.meta.env.VITE_API_URL ?? '…'`) — the container sets `VITE_API_URL=/api`, so a hardcoded base makes the assertion environment-dependent.

**`node`/`npm`/`npx` are not on the Windows host and WSL's Node is too old (v12) for Vite 8 / Vitest 4.** Run tests inside the `hextick-frontend-1` container, same as `tsc`:
```powershell
docker exec hextick-frontend-1 npx vitest run          # one-shot
docker exec hextick-frontend-1 npm run test            # watch mode
docker exec hextick-frontend-1 npm run test:types      # typecheck test files (tsconfig.vitest.json)
```
The container's `node_modules` is an anonymous volume (see `docker-compose.yml`); its start command runs `npm install` on boot, so host `package.json` is the source of truth — a rebuild/restart reinstalls test deps automatically.

**Build vs. tests split:** the production build (`npm run build` → `tsc -b`) excludes test files. `tsconfig.app.json` excludes `src/**/*.test.ts(x)` and `src/test`; test-file typechecking is a separate `tsconfig.vitest.json` (adds `vitest/globals` + `jest-dom` types, keeps `vite/client`). Don't remove those excludes or the build will try to compile test globals and fail.

## Hard rules

**Delete dead code immediately.** When a component, function, store key, or import is no longer used, remove it in the same session — don't leave it for later. Unused code creates false context for future sessions.

**Models are dumb.** No game logic, no dice rolls, no side effects in model methods. Properties that compute derived values are fine. Anything that changes state or rolls dice lives in `actions.py`.

**`actions.py` is the game engine.** It imports models freely. Models never import from `actions.py`.

**Tick records are immutable.** `HexTick`, `FactionTick` are history. Never update them after creation. All fields are `readonly_fields` in admin. `PartyTick` is the exception: on city maps, sub-tick actions within the same shift reuse the same `(tick, party)` record via `update_or_create` — the record is updated in place until the shift tick fires.

**`WorldSettings` is a singleton.** `save()` always forces `pk=1`. Always access via `WorldSettings.get()`. Holds `hex_resource_tick_modifier` — no tick state.

**Tick sequence is per-map.** `Map.current_tick` is the single source of truth for each map's tick number. `Tick` has a `map` FK; `unique_together = [('map', 'number')]`. `tick.number % 3 == 0` is a day; `tick.number % 21 == 0` is a week. Tick 0 never exists.

**`Map.map_type`** is either `regional` (default) or `city`. On city maps, `Map.sub_tick` counts party actions within the current shift (0–2). Every party action increments `sub_tick`; when `sub_tick % 3 == 0` it resets to 0 and `run_shift` fires (advancing the global tick). On regional maps, every party action fires `run_shift` immediately. Factions still tick once per shift regardless of map type. `PartyTick.sub_tick` records where in the shift the action fell (0 = shift tick, 1 or 2 = mid-shift).

**Time of day** cycles every 3 ticks: `% 3 == 0` → Morning, `% 3 == 1` → Afternoon, `% 3 == 2` → Night. Current day displayed as `floor(tick / 3)`. Night adds +2 via `night_bonus()` for faction/character non-movement uses. Movement uses `move_difficulty()` which applies its own night penalty of +1 (not +2). The frontend `TimeOfDayBadge` component reads from `GET /api/maps/{map_id}/tick/current/`.

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

**`AgeChoices` and `WeatherType` live in `world.py`**, not alongside the models that use them. `PointOfInterest.age` imports `AgeChoices` from there. `WeatherType` was moved from `hex.py` to `world.py` to avoid a circular import (`hex.py` imports `Map` from `world.py`, so `world.py` cannot import from `hex.py`).

**`TerrainType` is not a `TextChoices` enum.** It's a custom `str` subclass with `terrain_difficulty` and `resource_generation` as instance attributes. Use `TerrainType.from_value(str)` to look up by DB value. `terrain_difficulty` and `resource_generation` on `Hex` are `@property` — do not add them as DB columns.

**`modifier()`** — never inline `score // 10`. Always call `modifier()` from `world.utils`.

**`move_difficulty(origin, destination, tick_number, weather='fair')`** in `utils.py` is the backend source of truth for movement cost. Night adds +1 to all movement (road or not). Road rule: if both hexes `has_roads`, base is 1 + 1 at night. Otherwise base is `terrain_difficulty` + 1 at night. Weather adds: Overcast +0, Inclement +1, Extreme +2, Catastrophic returns 999 (impassable). Never inline this logic — always call `move_difficulty`. `night_bonus()` still exists for non-movement uses and returns +2.

**`computeMoveCost(origin, destination, tickNumber, weather)`** in `frontend/src/utils/moveCost.ts` mirrors `move_difficulty` for the frontend. Returns `{ total, base, modifiers[], blocked }` where `modifiers` is a list of `{ label, value }` entries and `blocked` is true for catastrophic weather. Use this for all move cost display and the `tooSlow` check — do not inline the logic in components.

**`Hex.has_roads`** — BooleanField (default False). Road travel between two `has_roads` hexes always costs 1 base + 1 at night. Editable via GM hex edit panel.

**`Hex.has_rivers`** — BooleanField (default False). No mechanical effect yet — purely informational. Editable via GM hex edit panel. Shown as a label pill in the player hex view.

**Dungeon lookup filters `hidden=False`**: `hex.pois.filter(poi_type='dungeon', hidden=False).first()`.

**`HexTick` does not copy POIs** — they are accessed live via `hex.pois.all()`.

---

## Faction movement restriction

`Faction.movement_restricted` (BooleanField, default False) + `Faction.allowed_hexes` (M2M to `Hex`, related name `restricted_factions`).

When `movement_restricted=True`, `run_shift` passes the `allowed_hexes` id set to `tick_faction`; only autonomous daytime **wandering** is confined to it. A GM-set `destination` (or `next_action`) deliberately **overrides** the restriction — a GM path ignores `allowed_hexes`.

The GM sets `allowed_hexes` via the faction edit form in `HexPanel`: check "Movement restricted", click "Select hexes" to enter `factionHexSelectMode` in Zustand, click hexes on the map (teal highlight, distinct from multi-select gold), then "Done selecting". On save, `PATCH /api/factions/{id}/` sends `movement_restricted` and `allowed_hexes` (list of IDs, `.set()` on the backend like `knowledge`).

Frontend store keys: `factionHexSelectMode`, `factionAllowedHexIds`, `setFactionHexSelectMode(active, initialIds?)`, `toggleFactionAllowedHex(id)`, `clearFactionHexSelect()`. GMPage routes hex clicks to `toggleFactionAllowedHex` when `factionHexSelectMode` is active.

---

## Factions

Factions are deliberately simple: the GM narrates faction actions in the fiction, so the
engine only moves them around and records a snapshot. **All** factions auto-tick via
`_select_action` (there is no `is_gm_faction` flag). Faction actions are only **SUPPLY,
TRAVEL, REST** — `Action` also defines SEARCH/EXPLORE/SOCIAL/DELVE but those are Party-only.

Dead factions (`is_dead = True`, a manual GM flag — factions no longer die from any engine
path) are excluded from `run_shift` entirely and do not tick.

## `_select_action` ladder (all factions)

`travel()` moves one adjacent hex, deducting `move_difficulty` cost; if `speed < cost` it
rests instead. `rest()` sets `speed = max_speed`. `supply()` is a flavour-only record.

1. `faction.next_action` set → perform it (SUPPLY/TRAVEL/REST), then `tick_faction` clears it. TRAVEL steps toward `destination` if set, else wanders. (This is the H1 fix — next_action is now consumed.)
2. `faction.destination` set → step one hex toward it (**ignores** `movement_restricted`/`allowed_hexes` — a GM destination overrides restrictions). Clears destination on arrival.
3. Night (`tick % 3 == 2`) → REST.
4. Day → roll d3: 1–2 = TRAVEL (wander to a random allowed adjacent hex), 3 = SUPPLY.

`run_shift` passes `allowed_hex_ids` (a set, or `None` when unrestricted); only rule-4
wandering honors it. There is no faction-vs-faction interaction, scouting, combat, economy,
or disease logic anymore.

## Party

`Party` (`models/party.py`) is the player group. It selects its own hex to move to, which triggers a world tick. All fields are manually set — no auto-tick logic. `Party` has no link to `Faction`.

**Key fields**: `player_count` (number of players, default 1), `supplies` (party resource pool, default 0), `resource_generation`, `speed`, `max_speed`, `is_lost` (BooleanField, default False).

**Speed gating** — `POST /party/{id}/action/` with `action: 'move'` is rejected (400) if `destination.terrain_difficulty > party.speed`. The player must rest first. `action: 'rest'` resets `party.speed = party.max_speed` and counts as a full action (triggers `run_shift`). Rest is always available.

**Movement rolls (regional maps only)** — on every `move` action, `party_move_rolls(origin, destination)` in `actions.py` fires two d6 rolls:

1. **Lost roll** — skipped if both hexes `has_roads` OR both hexes `has_rivers`. On a 6, `party.is_lost = True`. Party moves to the destination hex normally but must spend the terrain cost again (via `clear_lost`) before moving again.
2. **Wilderness event roll** — always fires. Maps 1–6 to `WildernessEvent` enum (Encounter / Sign / Environment / Loss / Exhaustion / Quiet). Purely informational — no mechanical effect yet.

Results are broadcast as a `type: "move_result"` SSE event so both GM and player views update in real time. `useTickStream` handles this by calling `setMoveResult` in the Zustand store.

**`clear_lost` action** — `POST /party/{id}/action/` with `action: 'clear_lost'`. Deducts `current_hex.terrain_difficulty + night_bonus` from speed (floor 0), sets `is_lost = False`, publishes `type: "navigation_update"` SSE event so the GM panel updates to "On course" without a full tick invalidation. Triggers `run_shift`.

**Last Move panel** — `HexPanel` always renders a "Last Move" section above the Party footer (visible to both GM and player). Shows: Navigation (On course / Lost — with "(Skipped)" if the roll was bypassed) and Wilderness Event. Populated via the Zustand `moveResult` store key, which is set by `useTickStream` on `move_result` / `navigation_update` SSE events. Persists until overwritten by the next move.

**Supply consumption** — every Morning tick (`tick.number % 3 == 0`), `run_shift` deducts `party.player_count` from `party.supplies` (floor 0). Supply action accepts an optional `amount` int; if provided, it is added to `party.supplies` before the tick runs.

**GM supply endpoint** — `PATCH /api/party/{id}/supplies/` with `{ supplies: int }` sets `party.supplies` directly (floor 0). Superseded by `PATCH /api/party/{id}/` for GM use — the broader endpoint is what `HexPanel` now calls. The supplies-only endpoint remains but is no longer wired to any UI.

`PartyTick` snapshots `current_hex`, `destination`, `action`, `last_action`, and `notes` (GM freetext) each tick. Notes can be updated after the fact via `PATCH /api/party/{id}/ticks/{tick_id}/notes/`.

---

## GM hex editing

The GM view has two modes toggled by the **Prep / Play** button in the top bar. The button label always shows the *next* state (click "Prep" to enter prep mode, click "Play" to leave it).

**Prep mode** — `prepMode: boolean` in Zustand. When true, selecting a hex immediately opens it in edit mode. When false, the hex panel opens in view mode and an **Edit** button is available to switch. Exiting prep mode also clears multi-select state.

**Multi-select mode** — `multiSelectMode: boolean` in Zustand, only available in prep mode. Toggled via the **Multi** button in the GM header (shows count badge when hexes are selected). In this mode hex clicks call `toggleSelectedHex` instead of `setSelectedHexId`; selected hexes render with a gold highlight. The sidebar swaps to `BulkHexPanel`, which edits `terrain_type`, `has_roads`, `has_rivers`, `player_visible`, `player_explored` across all selected hexes via `POST /api/hexes/bulk-patch/`. Checkboxes are tri-state: indeterminate = no change, checked = set true, unchecked = set false. Saving or cancelling exits multi-select mode.

**Edit mode** (inside `HexPanel`) — edits `terrain_type`, `resources`, `encounter_likelihood`, `player_explored`, `player_visible` in-place. Saved via `PATCH /api/hexes/{hex_id}/`. On save, React Query invalidates `['hexes', mapId]`. Cancel reverts draft to the current server state.

**Add POI** — the `+ Add POI` button in edit mode opens `AddPOIModal`. Fields shown are conditional on `poi_type` (difficulty and title on dungeon; difficulty on ruin; monster_type on monster_base; description/notes on dungeon only). Age and the three visibility flags are always shown. M2M fields (`items`, `knowledge`) and the `faction` FK (village) are not editable from this modal. POI is created via `POST /api/hexes/{hex_id}/pois/`.

**POI detail expand** — in view mode, each POI row is a clickable button. Clicking toggles an inline detail panel showing difficulty, description, GM notes, and visible/explored flags. Click again to collapse.

**Move party** — in view mode, a "Move party here" button appears (right-aligned, above the party footer) whenever the selected hex is not the party's current hex. It calls `PATCH /api/party/{id}/` with `{ current_hex: hex.id }` — no speed-gating, GM teleport only.

**Add Faction** — the `+ Add Faction` button in edit mode opens `AddFactionModal`. Fields: name, color (hex color picker + text), speed, max_speed, population, location (current hex, defaults to the selected hex), and the `mobile` flag. Destination is not set at creation. Created via `POST /maps/{map_id}/factions/`. The HexPanel faction detail also has a **"Path toward party"** button that PATCHes `destination = party.current_hex`.

**Faction arrows** — rendered in `HexMap` as an SVG layer above hex cells. Each faction with a `current_hex` gets a three-layer arrow (glow halo + solid shaft + white highlight, with a custom arrowhead marker per color). Factions with a `destination` draw a movement arrow from their hex to the destination; factions without a destination draw a short upward arrow on their hex. The 2-letter label in each hex also uses the faction's color.

---

## Non-obvious admin behaviours

**`HexAdmin` supports structured search** — `get_search_results` is overridden to parse `key=value` tokens. `map=name`, `row=3`, `col=4` apply as exact filters; anything else falls through to the normal `icontains` search. Mixed queries like `map=Ashenvale row=2 col=5` work.

**`Map.fog_of_war`** — controls whether `PlayerPage` renders fog. `GMPage` is hardcoded to `fogOfWar={false}` and ignores this flag. Togglable via admin actions on the Map list.

**`Map.player_actions_locked`** — BooleanField toggled via `PATCH /api/maps/{map_id}/locked/`. When true, the "Actions…" button on `PlayerPage` is disabled. The lock endpoint publishes to the SSE channel (`tick:{map_id}`) after saving so the player view updates immediately without a tick firing. `useTickStream` invalidates `['map', mapId]` on every SSE message for this reason.

**Hex highlight** — `POST /api/maps/{map_id}/highlight/` with `{ hex_id: int | null }` broadcasts `type: "hex_highlight"` on the SSE channel. No DB backing — ephemeral only; state resets on page reload. `useTickStream` handles this event type by calling `setHighlightedHexId` in the Zustand store directly (no query invalidation). The GM sets/clears from `HexPanel` (per-hex) or the GMPage header "Clear highlight" button (always visible when active). `PlayerPage` zooms to show both the highlighted hex and the party hex when a highlight arrives, and back to the party hex when cleared.

**SSE event types summary** — `useTickStream` handles these without full tick invalidation:
- `gallery_update` → invalidates `['gallery', mapId]`
- `hex_highlight` → `setHighlightedHexId` in Zustand
- `move_result` → `setMoveResult` in Zustand (fields: `lost`, `lost_roll`, `wilderness_event`, `event_roll`)
- `navigation_update` → patches `lost` field on existing `moveResult` in Zustand (no other fields)
- everything else → full invalidation of map/hexes/factions/currentTick/party queries

**`HexMap.focusHexIds`** — array of hex IDs to zoom to fit. Single-hex arrays use `zoomToHex` (same scale as page-load focus); multi-hex arrays use `zoomToFitHexList` (0.75× fit). This distinction is intentional — single-hex zoom should feel like the initial player load, not an extreme close-up.

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

**Map / hex creation**
- `POST /api/maps/` uses Pillow to infer rows/cols from image dimensions ÷ hex size — approximate, ignores origin offset. Formula: `cols = floor(w / (size * 1.5))`, `rows = floor(h / (size * √3))`.
- CreateMap page has a zoomable/pannable origin picker. `image_path` (relative to `MEDIA_ROOT`) lets you reuse an existing uploaded image without re-uploading.
