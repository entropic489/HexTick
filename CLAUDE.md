# HexTick

A Django application that runs autonomous factions on a hex map, with player exploration following Cairn 2e rules. Runs locally via Docker Compose. Frontend is a React island (single map component) mounted inside a Django template.

## Stack

- **Backend**: Django 5.2, Python 3.13 (3.14 target once a stable Docker image exists)
- **Database**: PostgreSQL (`psycopg2-binary`)
- **Object storage**: MinIO via `django-storages[s3]` — S3-compatible, local only
- **Package manager**: PDM (`pyproject.toml` + `pdm.lock`)
- **Frontend**: React island at `<div id="map">`, Vite dev server alongside Django

## Running locally

```bash
cp .env.example .env   # fill in values
docker-compose up
docker-compose exec web pdm run python HexTick/manage.py migrate
```

**The `.venv/` directory is a broken Linux symlink.** Do not try to use or repair it. All Python execution goes through Docker or a freshly created local venv.

After changing `pyproject.toml`, run `pdm lock` before rebuilding.

## Project layout

```
HexTick/                        # repo root
  docker-compose.yml
  Dockerfile
  pyproject.toml
  .env.example
  HexTick/                      # Django project root (contains manage.py)
    HexTick/                    # Django config package (settings, urls, wsgi)
    world/                      # The only Django app
      models/
        __init__.py             # re-exports everything; import from here
        world.py                # Map
        hex.py                  # Hex, TerrainType, WeatherType, POIType, PointOfInterest
        faction.py              # Faction, Action, DiseaseType, ActiveDisease
        characters.py           # Item, Knowledge, Character, CharacterTick
        ticks.py                # Tick, HexTick, FactionTick
        settings.py             # WorldSettings singleton
      actions.py                # ALL game logic — tick, actions, encounters, diseases
      admin.py                  # Admin registrations
      utils.py                  # modifier(), hex_distance()
```

## Hard rules

**Models are dumb.** No game logic, no dice rolls, no side effects in model methods. Properties that compute derived values (e.g. `population_trend`, `comfort`) are fine. Anything that changes state or rolls dice lives in `actions.py`.

**`actions.py` is the game engine.** It imports models freely. Models never import from `actions.py`.

**Tick records are immutable.** `HexTick`, `FactionTick`, and `CharacterTick` are history. Never update them after creation. All their fields are `readonly_fields` in admin.

**`WorldSettings` is a singleton.** `save()` always forces `pk=1`. Always access via `WorldSettings.get()`.

**Tick sequence starts at 1.** `tick.number % 3 == 0` is a day; `tick.number % 21 == 0` is a week. Tick 0 never exists.

---

## Core concepts

### Scores vs modifiers

Every attribute is a **1–100 score**. The modifier is `score // 10`. The helper:

```python
from world.utils import modifier
modifier(57)  # → 5
```

When the design doc says something "gets a modifier," it means `// 10`. Never inline `// 10` — always call `modifier()`.

### Hex coordinates

Axial coordinates: `row`, `col`. Hex distance uses the cube coordinate formula in `utils.hex_distance(a, b)`. The `unique_together` on `Hex` is `('map', 'row', 'col')` — coordinates are only unique within a map.

### TerrainType

**Not a `TextChoices` enum.** It is a custom `str` subclass that carries `terrain_difficulty` and `resource_generation` as instance attributes. Instances live in `_TERRAIN_TYPES` at module level. Use `TerrainType.from_value(str)` to look up by DB value. Constants are `TerrainType.PLAINS`, `TerrainType.FOREST`, etc.

`terrain_difficulty` and `resource_generation` on `Hex` are `@property` — derived from `terrain_type`, not stored. Do not add them as DB columns.

### Points of Interest

POIs are `PointOfInterest` model instances with a FK to `Hex` (related name `pois`). Each has a `poi_type` from `POIType` choices. Set up during world prep — not modified by ticks.

| Type | Key fields |
|---|---|
| `DUNGEON` | `difficulty`, `title`, `description`, `notes`, `technology_max_modifier`, `items`, `knowledge` |
| `VILLAGE` | `faction` (FK), `name` |
| `RUIN` | `difficulty`, `items`, `knowledge` |
| `STASH` | `items`, `knowledge` |
| `MONSTER_BASE` | `monster_type` (CharField) |

All POIs have `player_explored` (bool). `items` and `knowledge` are M2M to `Item` and `Knowledge`.

`HexTick` snapshots the hex state each tick but does **not** copy POIs — they are accessed live via `hex.pois.all()`.

### WorldSettings

Editable singleton. Fields:
- `trade_amount` (default 5) — resources/technology swapped per trade action
- `hex_resource_tick_modifier` (default 5) — multiplied by `hex.resource_generation` each daily tick

### Tick architecture

One tick = one 8-hour shift.

```
tick.number % 3 == 0   → daily effects (speed reset, resource consumption, famine)
tick.number % 21 == 0  → weekly effects (population roll)
```

Entry points:
- `tick_hex(hex, tick) → HexTick` — regenerates resources on daily tick, snapshots hex state
- `tick_faction(faction, tick, nearby_factions, candidate_hexes) → FactionTick` — resolves action, applies daily/weekly effects, snapshots faction state
- `tick_character(character, tick, factions_on_hex) → CharacterTick` — only acts if `is_wanderer`; resolves travel/supply/merge, applies daily ration consumption and famine

The caller is responsible for providing `nearby_factions`, `candidate_hexes`, and `factions_on_hex`. These are not queried inside the tick functions — keep DB queries out of the engine.

### Faction types

| Flag | Auto-tick | Notes |
|---|---|---|
| `is_player_faction = True` | No | `current_action` must be set before tick runs |
| `is_gm_faction = True` | No | GM sets action via frontend modal |
| neither | Yes | `_select_action` runs each tick |

All three types still get daily/weekly effects applied and a `FactionTick` snapshot created.

### `_select_action` priority (NPC factions only)

1. `faction.destination` is set → travel toward it, steering around any disagreeable faction (`agreeableness < 50`) on the current hex via detour. Detour = nearest candidate hex to destination that the blocker doesn't occupy.
2. Disagreeable faction in scouting range AND `last_action != BATTLE`:
   - Same hex → battle
   - Different hex → set `destination` to enemy hex, travel toward it
3. Outmatched (`combat_skill < closest.combat_skill`) → flee (best candidate hex maximising distance from threat + resources - difficulty)
4. `faction.agreeableness < 0` and not outmatched → battle
5. `closest.agreeableness >= 0` AND `last_action != TRADE` → trade
6. `faction.comfort(hex.resources) >= 0` → supply
7. `comfort < 0` → travel to best candidate hex (min `terrain_difficulty - resources`)
8. Dungeon POI on hex AND `resources > population` AND `d12 - modifier(theology) >= 9` → delve
9. `resources > population` AND `technology_max - technology > 10` → craft
10. Default → train

**Cooldowns**: BATTLE and TRADE each have a 1-tick cooldown enforced by `last_action`. A faction cannot battle two ticks in a row, nor trade two ticks in a row.

### `comfort(hex_resources)`

Read-only computed value. Used by `_select_action` to decide stay vs travel. Formula:

```
population - resources + (resource_generation // 10) * hex_resources
```

Halved when RESTLESS disease is active (DB query inside — be aware if calling in a hot loop).

### `population_trend`

Computed property. Priority order:

1. `famine_streak > 0` → `-5 * famine_streak` (overrides everything)
2. `population_trend_override is not None` → that value (set by Black Death)
3. `(resources - population) // 10`

### Famine

`famine_streak` increments each day `resources == 0` (after consumption), resets when `resources > 0`. Consumption is skipped entirely when `resources == 0`. Ravenous disease multiplies daily consumption by 1.5.

### Disease system

Diseases are contracted via `_apply_disease()`, called from `random_encounter()` on hex entry. `apply_diseases()` is called in `tick_faction` after each tick.

| Disease | On contraction | Per tick | On expiry |
|---|---|---|---|
| Madness | `population -= combat_skill` | — | — (damage is permanent) |
| Black Death | `population -= 1d12`, `population_trend_override = -5` | — | clear `population_trend_override` |
| The Runs | `combat_skill -= 1d12` (stored in `effect_value`) | — | `combat_skill += effect_value` |
| Ravenous | — | daily consumption × 1.5 | — |
| Bad Food | `scouting //= 2` (delta in `effect_value`) | `speed //= 2` (after daily reset) | `scouting += effect_value` |
| Restless | `scouting *= 1.5` (delta in `effect_value`) | — | `scouting -= effect_value` |

Restless additionally halves `comfort()` — implemented in the property itself, not via stored modification.

`ActiveDisease.effect_value` stores the rolled/computed delta for reversible effects. `update_or_create` is used so re-contracting a disease resets duration rather than stacking.

### Random encounters

Triggered on every `travel()` call (entering a new hex). Roll: `1d20 + hex.encounter_likelihood`.

| Roll | Event |
|---|---|
| ≤ 1 | Roll on disease table |
| 2–5 | Monster encounter (difficulty = roll - 1). **No mechanical effect yet** — logged in notes only. |
| 6–17 | Nothing |
| 18 | Beneficial trade: swap 5 of higher stat for 10 of the other |
| 19 | Wanderers: `+1d6 population` |
| 20+ | `+1d20 resources` |

### Dungeons

Dungeons are `PointOfInterest` instances with `poi_type = 'dungeon'`. Retrieved via `hex.pois.filter(poi_type='dungeon').first()`.

Delve roll: `1d20 + modifier(combat_skill) >= poi.difficulty`. Regardless of success, `theology -= 5` (floored at 0). On success, `faction.technology_max += poi.technology_max_modifier`.

### Trade

Amount is `WorldSettings.get().trade_amount` (default 5, editable in admin). Direction is automatic: the trading faction offers whichever of resources or technology it has more of. The faction with higher population shifts the other's theology toward its own by `modifier(dominant.theology)` per trade, capped at the dominant faction's theology value.

### Battle

- If `other.current_action == TRAVEL`: attacker deals `combat_skill // 2` population damage, defender gains 3 speed. No roll.
- Otherwise: both roll `1d20 + combat_skill`. Winner subtracts their `combat_skill` from loser's `population`, loses `loser.combat_skill // 2` from their own `combat_skill`, and gains `combat_skill` resources.

### Character tick (`tick_character`)

Only executes action logic if `is_wanderer = True` and `is_dead = False`. Daily effects (rations, famine) always apply on `tick.number % 3 == 0`.

**Action priority:**
1. `destination` is set → travel (costs `terrain_difficulty` from `speed`, clears `destination` on arrival)
2. `rations < ration_limit // 2` → supply (gain `resource_generation` rations from the hex; does **not** reduce `hex.resources`)
3. Not a scout AND `can_merge` AND faction on hex has `agreeableness > 50`, `resources > population`, and combined agreeableness with character's faction `> 100` → merge (character joins that faction, `target.population += 1`)

**Daily (tick % 3 == 0):**
- `speed` resets to `max_speed`
- `rations -= 1` (floored at 0)
- `famine_streak += 1` if `rations == 0`, else reset to 0
- `is_dead = True` if `famine_streak >= 5`

**Character fields:** `speed` (current), `max_speed` (default 4, GM-settable), `rations`, `ration_limit`, `famine_streak`, `resource_generation` (1–3), `combat_skill`, `scouting`, `can_merge`, `is_wanderer`, `is_dead`, `destination` (FK Hex), `current_hex` (FK Hex, required if `is_wanderer`).

### Scout visibility (`update_character_visibility`)

`update_character_visibility(character, all_hexes)` — if `character.scouting > 0` and `current_hex` is set, marks all hexes within `modifier(scouting)` distance as `player_explored = True`. Skips hexes already explored. Caller passes the full hex list; no DB queries inside. Call this after a character moves or on each tick for scouting characters.

---

## Models not yet built

- `Party` — referenced by `PartyTick.party`. `PartyTick` exists in `ticks.py` but is inert until `Party` is created.

---

## What's not wired up yet

- No `POST /tick/` endpoint — the tick functions exist but there is no view or URL routing
- No React frontend — island architecture planned; Vite dev server runs alongside Django
- No migrations have been generated or run — venv/Docker must be sorted first
- `FactionTick` does not snapshot `last_action` or `is_gm_faction` / `is_player_faction` — add if needed for history replay
- `Knowledge` FK on `Character` is commented out pending decision on whether characters carry knowledge directly or only via their faction/POI interactions
