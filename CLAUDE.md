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
      components/               # HexMap, HexModal, TickControls, EventLog
      pages/                    # MapSelection, GMPage, PlayerPage
      store/useGameStore.ts     # Zustand: selectedMapId, selectedHexId, pendingEvents
      types/index.ts            # TypeScript interfaces mirroring Django models
  design_docs/                  # API.md, Factions.md
  docker-compose.yml
  Dockerfile                    # Python only — frontend uses node:22-alpine image directly
```

## Docker networking

- Frontend proxies `/api/*` to `http://web:8000` (Docker service name, set via `VITE_BACKEND_URL` env var).
- `web` must be in Django's `ALLOWED_HOSTS`.
- Vite dev server binds to `0.0.0.0` so it's reachable from the host.

## Hard rules

**Models are dumb.** No game logic, no dice rolls, no side effects in model methods. Properties that compute derived values are fine. Anything that changes state or rolls dice lives in `actions.py`.

**`actions.py` is the game engine.** It imports models freely. Models never import from `actions.py`.

**Tick records are immutable.** `HexTick`, `FactionTick`, `CharacterTick`, `PartyTick` are history. Never update them after creation. All fields are `readonly_fields` in admin.

**`WorldSettings` is a singleton.** `save()` always forces `pk=1`. Always access via `WorldSettings.get()`. Holds `current_tick` FK — the single source of truth for the global tick number.

**Tick sequence starts at 1.** `tick.number % 3 == 0` is a day; `tick.number % 21 == 0` is a week. Tick 0 never exists.

**DB queries stay out of the engine.** `tick_faction`, `tick_hex`, `tick_character` accept pre-fetched lists (`nearby_factions`, `candidate_hexes`, `factions_on_hex`). Don't add queries inside these functions.

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

## What's not wired up yet

- `PlayerPage` passes `playerFaction.id` as the party ID to `POST /api/party/{id}/action/` — should be `Party.id`. Needs a party fetch in the component.
- `FactionTick` does not snapshot `last_action` or `is_gm_faction` / `is_player_faction`
- `Knowledge` FK on `Character` is commented out — pending decision on whether characters carry knowledge directly
- Reverse tick not implemented — engine has no undo; snapshots are immutable history
- `PATCH /api/factions/{id}/action/` not yet implemented — GM currently sets faction actions via Django admin
