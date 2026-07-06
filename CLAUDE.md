# HexTick

> **Note to self:** Keep this file lean. Only add things that can't be recovered by reading the code — design intent, hard constraints, non-obvious quirks, environment traps. Field lists, formulas, and mechanics live in the code; don't duplicate them here. When a mechanic changes, fix or delete its line here in the same session.

A Django + React application that runs autonomous factions on a hex map, with player exploration following Cairn 2e rules. Local two-tab table app (GM view + player view); there is no auth — the player browser receives full GM data and the UI merely hides it. That trust model is a deliberate constraint (see `design_docs/code-review.md` S6), not an oversight.

`design_docs/code-review.md` is the live findings list (dated 2026-07-05); work it in severity order and check off the Status list as items land.

## Stack

- **Backend**: Django 5.2 + Django Ninja, Python 3.13. PostgreSQL in Docker; SQLite locally via `USE_SQLITE=true`. Redis 7 for SSE pub/sub (`tick:{map_id}` channels).
- **Package manager**: PDM (`pyproject.toml` + `pdm.lock`); deps exported to `requirements.txt` at image build; no venv in the container.
- **Frontend**: React 19 + TypeScript + Vite, CSS Modules, React Query (server state) + Zustand (UI state), React Router. SPA on :5173, proxies `/api` and `/media` to Django (:8000).

## Environment traps (this dev machine)

**Neither `pdm`/Python 3.13 nor `node`/`npm` exist on the Windows host or in the Claude Code Bash tool (Git-Bash/MSYS2).** Standing workarounds:

- **Backend commands** run in WSL `Ubuntu-22.04` (repo mounted at `/mnt/c/Users/jfink/OneDrive/Documents/Projects/HexTick`, pdm-managed 3.13 already provisioned):
  ```powershell
  wsl -d Ubuntu-22.04 -- bash -lc "cd /mnt/c/Users/jfink/OneDrive/Documents/Projects/HexTick && pdm run test"
  ```
  Fallback: `docker exec hextick-web-1 pdm ...` if the stack is up.
- **Frontend commands** run in the running container (WSL's node is v12 — too old):
  ```powershell
  docker exec hextick-frontend-1 npx vitest run
  docker exec hextick-frontend-1 npx tsc -b --noEmit
  docker exec hextick-frontend-1 npm run test:types
  ```
  The container's `node_modules` is an anonymous volume; its start command runs `npm install`, so host `package.json` is the source of truth and a restart reinstalls deps.
- **Migrations, two paths:**
  - *Generate/check* (WSL, no DB needed — force SQLite so `DB_HOST=db` never resolves):
    ```bash
    wsl -d Ubuntu-22.04 -- bash -lc "cd /mnt/c/.../HexTick && set -a && . ./.env 2>/dev/null; export USE_SQLITE=true SECRET_KEY=dummy && cd backend && pdm run python manage.py makemigrations"
    ```
  - *Apply* (dev Postgres is only reachable inside Docker):
    ```powershell
    docker exec hextick-web-1 pdm run python manage.py migrate
    ```
    If nothing is running, `docker-compose up` — the entrypoint migrates on boot.

Run locally: `cp .env.example .env`, `docker-compose up` (backend :8000, frontend :5173). Rebuild after `pyproject.toml` changes; run `npm install` in the container after `package.json` changes (or just restart it).

## Project layout

```
backend/world/            # the only Django app
  models/                 # import from models/__init__.py (re-exports everything)
  api/                    # Django Ninja routers, one file per resource
    common.py             # api instance, _redis, SSE helpers, shared schemas
  actions.py              # ALL game logic: run_shift, perform_party_action,
                          # faction ladder, wilderness/weather rolls, PartyActionError
  utils.py                # modifier(), hex_distance(), adjacent_hexes(), move_difficulty()
frontend/src/
  api/                    # fetch wrappers over client.ts
  components/ pages/      # HexMap, HexPanel (+ extracted children), modals, pages
  store/useGameStore.ts   # Zustand UI state
  types/index.ts          # hand-mirrored backend types — known to drift (review S5)
design_docs/              # code-review.md (live), API.md, Factions.md
```

## Hard rules

- **Models are dumb.** No dice, no side effects in model methods; derived-value properties are fine. State changes and rolls live in `actions.py`. Models never import from `actions.py`.
- **DB queries stay out of the engine.** `tick_faction`/`tick_hex` take pre-fetched lists/values; `run_shift` does the fetching.
- **Tick records are immutable** (`HexTick`, `FactionTick`; admin readonly). Exception: `PartyTick` on city maps is `update_or_create`d per `(tick, party)` until the shift fires.
- **Delete dead code immediately** — component + styles + store keys + imports, same session.
- **Never inline** `score // 10` (use `modifier()`), movement cost (use `move_difficulty()` / frontend `computeMoveCost()` — they mirror each other, change both), or hex distance (`hex_distance()`).
- **`WorldSettings` is a singleton** — `WorldSettings.get()`, pk always 1.
- **Migrations may be generated and applied automatically** (paths above); report what ran.
- Multipart endpoints (map create/duplicate, gallery upload) use Ninja `File[...]`+`Form[...]` and frontend `api.postForm(FormData)` — don't diverge.

## Core mechanics (intent, not formulas)

- **Ticks are per-map.** `Map.current_tick` is the source of truth; `unique_together ('map','number')`; tick 0 never exists. `% 3`: 0 Morning / 1 Afternoon / 2 Night; day = `floor(tick/3)`; `% 21 == 0` is a week. Night: `night_bonus()` +2 for non-movement, movement gets its own +1 inside `move_difficulty`.
- **Map types**: `regional` (every party action fires `run_shift`) vs `city` (`Map.sub_tick` counts actions 0–2; shift fires every third action; **speed gating, speed cost, and wilderness rolls are all skipped on city maps**). Factions tick once per shift either way.
- **Factions are deliberately simple** — the GM narrates; the engine only moves them and snapshots a `FactionTick`. Action ladder in `_select_action`: 1) GM `next_action` (consumed), 2) GM `destination` (steps each tick, **ignores** `movement_restricted`/`allowed_hexes` — GM overrides restriction by design), 3) night → rest, 4) day d3: 1–2 wander (honors `allowed_hexes`), 3 supply. Faction actions are SUPPLY/TRAVEL/REST only; the rest of `Action` is party-only. `is_dead` is a manual GM flag excluding the faction from ticking. `is_mobile=False` means the faction never moves under any path (GM `destination`, `next_action=TRAVEL`, and wander all fall through to rest instead) — a GM can still relocate it directly via `current_hex`.
- **Party moves** (regional): move → `party_move_rolls` = lost d6 (skipped if both hexes share roads or rivers; 6 = lost) + wilderness d5 (Encounter/Sign/Weather/Loss/Quiet). **Supply and rest also roll the wilderness d5** (rest remaps Sign→Quiet). A **Weather** result rolls a d8 that shifts `Map.weather` along the fair→catastrophic scale (`_shift_weather`). Results broadcast as `move_result` SSE; `clear_lost` charges terrain cost and emits `navigation_update`. Known gap: lost state isn't enforced on move (review H3).
- **Supplies**: every Morning tick deducts `player_count` from `party.supplies` (floor 0) — only when `party.tracks_supplies` (GM-toggleable; hides the supply UI when off).
- **Every party action sets `player_actions_locked = True`** (GM must unlock between actions). The GM header lock has three states: locked / unlocked-once / **permanent unlock** (auto-unlocks whenever the flag flips on). History browsing (TickControls) also toggles the lock.
- **Weather** is also GM-settable: TickControls stepper (staged, then "Set") → `PATCH /maps/{id}/weather/`.
- **Time-travel**: TickControls browses `FactionTick`/`HexTick`/`PartyTick` snapshots and can reset to a tick. Known gap: weather and party speed/supplies/is_lost aren't snapshotted, so reset doesn't restore them (review H4).

## Fog, reveal, and city entry

- `Map.fog_of_war` gates the player view only (GM view hardcodes it off). `reveal_mode`: `grey_fog` (solid cover on unexplored) or `two_layer` (`image` = vague NPC map everywhere; `detail_image` revealed per `player_visible` hex via SVG clip-path).
- Moving reveals: destination explored+visible, neighbors visible (`reveal_hex_on_move`). Search reveals POIs (`player_visible` on non-hidden POIs). Dungeon lookups filter `hidden=False`.
- **City entry**: on a regional map, a `city`-terrain hex with `can_enter` + `linked_map` shows "Enter the city" in HexPanel, navigating to the linked map's GM/player page. `Hex.save()` force-clears `can_enter` unless terrain is city on a regional map — an invariant guard, and the reason `patch_hex` uses `select_related('map')`. `queryset.update()` paths bypass it (bulk-patch doesn't expose `can_enter`).

## Non-obvious quirks

- **`TerrainType` is not TextChoices** — a custom `str` subclass carrying `terrain_difficulty`/`resource_generation`; `Hex.terrain_difficulty`/`resource_generation` are properties, never DB columns. `TerrainType.from_value(str)` to look up.
- **`AgeChoices`/`WeatherType` live in `models/world.py`** (not with their users) to avoid a circular import with `hex.py`.
- **`Faction.map` FK — not `current_hex.map` — is the source of truth** for map membership (lists, `run_shift`, duplication). Anything that creates a faction must set it; the admin currently doesn't (review H5).
- **Hex coordinates**: rows increase upward, cols rightward; `origin_x/y` is the pixel center of the bottom-left hex; odd columns shift up (odd-q). All hex math is in image-pixel space; the SVG transform pans/zooms the whole scene (refs, not React state — synchronous DOM writes). `hex_distance` converts offset→axial first; don't shortcut it.
- **`map.image` serializes with the full `/media/...` path** — use directly as `src`, never prepend `/media/`. `MapSchema.detail_image` must stay `Optional[str]` (Ninja's FieldFile encoder yields None for empty ImageFields → 500 otherwise); same reason the test `map_factory` forces a non-empty `image`.
- **SSE**: `common.publish()`/`broadcast_tick()` read module-level `_redis` at call time (the thing tests patch). Transactional endpoints must publish via `transaction.on_commit`. `tick_stream` polls `get_message(timeout=15)` and emits keepalive comments. `useTickStream` routes by `type`: `gallery_update` → gallery invalidation only; `hex_highlight` → store only (ephemeral, no DB); `move_result` → `recordMoveResult` (bumps `moveResultSeq`, which is what pops the player result modal); `navigation_update` → patches `lost` only; anything else → full map/hexes/factions/currentTick/party invalidation (this catch-all is why `locked`/`weather` updates work).
- **Gallery**: one published image per map (publish endpoint auto-unpublishes others; toggling unpublishes). Published image = fullscreen player overlay, no player close. Factions with an `image` FK publish it directly on player "Interact"; without one they get the flavour `InteractModal`.
- **Player action UI is the inline `ActionList`** on PlayerPage (gated by `player_actions_locked`); the near-identical **`ActionModal` is GM-only** ("Actions…" in HexPanel) — known duplication slated for extraction (review S2). GM "Move party here" is a teleport via `PATCH /party/{id}/` — no speed gating.
- **GM prep/multi-select**: `prepMode` (hex click opens edit directly), `multiSelectMode` (gold highlight, `BulkHexPanel` tri-state bulk patch: indeterminate = no change), `factionHexSelectMode` (teal highlight, picks `allowed_hexes`). All in Zustand; exiting prep clears multi-select.
- **HexAdmin structured search**: `map=name row=2 col=5` tokens filter exactly; the rest falls through to icontains.
- **Map/hex creation**: `POST /maps/` infers rows/cols from image size ÷ hex size via Pillow; `image_path`/`detail_image_path` reuse an existing file under `MEDIA_ROOT`. `duplicate_map` deep-copies (hexes/POIs/factions/party/gallery, with `_clone_file_field` giving clones their own files) and optionally swaps reveal mode/images.

## Testing

Backend: **pytest + pytest-django** (never `manage.py test`); config in root `pyproject.toml`; run `pdm run test` (forces `USE_SQLITE=true`). 137 tests. Engine tests in `backend/world/tests/`, API pinning tests in `tests/api/` (one module per router; they lock behavior — when a test pins a known bug it carries a `CHARACTERIZATION — pins <id>` comment referencing `code-review.md` and must be rewritten when the fix lands). Harness (`tests/api/conftest.py`): `django.test.Client` JSON wrapper with `raise_request_exception=False`, `.post_multipart` for File/Form endpoints, autouse `fake_redis` recording fake replacing `world.api.common._redis` (use `django_capture_on_commit_callbacks(execute=True)` for on-commit broadcasts), `map_factory` override with non-empty `image`. DB factory fixtures: `map_factory`/`hex_factory`/`faction_factory` (kwargs override; factories build their own deps).

Frontend: **Vitest + RTL + jsdom**, config under `test` in `vite.config.ts`, tests colocated `*.test.ts(x)`. 116 tests. Patterns that took effort — reuse them:
- `src/test/renderWithProviders.tsx` — fresh QueryClient (`retry: false`) + MemoryRouter + store reset per test; seed cache with `queryClient.setQueryData`.
- Store: snapshot `useGameStore.getState()` at module load, restore with `setState(initial, true)`.
- SSE hook: fake `EventSource` class on `globalThis` with an `emit()`; spy `invalidateQueries`.
- `fetch` stub via `vi.stubGlobal`; resolve the base URL the way `client.ts` does (`import.meta.env.VITE_API_URL` — the container sets `/api`).
- Clipboard: spy `navigator.clipboard.writeText`, stub first if missing; never `vi.stubGlobal('navigator', …)` (breaks user-event).
- Component API mocking: `vi.mock('../../api/…')` with `vi.fn()` stubs; assert bodies off `mock.calls`.

**Build/test split**: `tsconfig.app.json` excludes tests from `tsc -b`; `tsconfig.vitest.json` typechecks them (`npm run test:types`). Don't remove the excludes or the production build compiles test globals and fails.

## Docker networking

Frontend proxies `/api` + `/media` to `http://web:8000` (`VITE_BACKEND_URL`); `web` must be in `ALLOWED_HOSTS`; Vite binds 0.0.0.0. Backend runs under **gunicorn**, so admin static needs `staticfiles_urlpatterns()` under `DEBUG` and media is served by `static()` (DEBUG only — production needs nginx or a storage backend).
