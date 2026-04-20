# HexTick API Design

Django Ninja. All routes under `/api/`. All responses are JSON.

---

## Maps

### `GET /api/maps/`
Returns all maps. Used by the Map Selection page.

**Response:** `Map[]`
```json
[{ "id": 1, "name": "The Reach", "image": "/media/maps/reach.png", "hex_size": 40, "origin_x": 50, "origin_y": 50 }]
```

---

### `GET /api/maps/{map_id}/`
Single map detail.

**Response:** `Map`

---

### `GET /api/maps/{map_id}/hexes/`
All hexes for a map, with POIs nested. Used to render the hex grid.

**Response:** `Hex[]`
```json
[{
  "id": 12,
  "map": 1,
  "row": 0,
  "col": 3,
  "terrain_type": "forest",
  "terrain_difficulty": 2,
  "resource_generation": 1,
  "resources": 34,
  "weather": "fair",
  "encounter_likelihood": 0,
  "player_explored": true,
  "player_visible": true,
  "pois": [
    {
      "id": 5,
      "poi_type": "dungeon",
      "name": "The Pit",
      "difficulty": 14,
      "title": "Tomb of the First King",
      "description": "A crumbling entrance...",
      "notes": "GM only: dragon inside",
      "hidden": false,
      "player_visible": true,
      "player_explored": false
    }
  ]
}]
```

Notes:
- `terrain_difficulty` and `resource_generation` are model properties derived from `terrain_type`, not DB columns.
- The frontend filters POIs by `player_visible` for the Player page; the GM page shows all.

---

### `GET /api/maps/{map_id}/factions/`
All factions whose `current_hex` belongs to this map.

**Response:** `Faction[]`
```json
[{
  "id": 3,
  "name": "Iron Warband",
  "speed": 4,
  "population": 62,
  "technology": 18,
  "resources": 45,
  "combat_skill": 30,
  "current_action": "travel",
  "last_action": "supply",
  "current_hex": 12,
  "destination": 17,
  "is_mobile": true,
  "is_player_faction": false,
  "is_gm_faction": false,
  "is_famine": false,
  "is_dying": false,
  "max_speed": 4
}]
```

Notes:
- `is_famine`, `is_dying`, `max_speed` are model properties.
- The Player page only renders the player's own faction icon. The GM page renders all.

---

## Tick

### `POST /api/tick/`
Advances the world by one shift (or one full day = 3 shifts).

**Request:**
```json
{ "map_id": 1, "mode": "shift" }
```
`mode` is `"shift"` or `"day"`.

**Response:** `TickResponse`
```json
{
  "tick_number": 14,
  "events": [
    { "type": "battle", "message": "Iron Warband attacked Pale Monks (roll: 17)", "faction_id": 3, "hex_id": 12 },
    { "type": "famine", "message": "Pale Monks are starving", "faction_id": 7, "hex_id": 8 },
    { "type": "death", "message": "Pale Monks have collapsed (pop < 20, trend < 0)", "faction_id": 7, "hex_id": 8 }
  ]
}
```

**Orchestration (one shift):**
1. Determine latest `Tick.number`; create `Tick(number=latest+1)`.
2. Fetch all hexes on `map_id`. Build `hex_by_id` dict.
3. Fetch all factions with `current_hex__map=map_id`. Build `factions_by_hex` dict.
4. For each hex: `tick_hex(hex, tick)` → creates `HexTick` snapshot.
5. For each faction: build `nearby_factions` (those within `modifier(faction.scouting)` hexes via `hex_distance()`), then call `tick_faction(faction, tick, nearby_factions, all_hexes)` → creates `FactionTick` snapshot.
6. Fetch all characters with `current_hex__map=map_id`. For each: `tick_character(character, tick, factions_on_same_hex)` → creates `CharacterTick` snapshot.
7. Collect events from the resulting `FactionTick` records (see Event Rules below).
8. Return `{ tick_number, events }`.

For `mode = "day"`: run steps 1–8 three times in sequence (3 shifts = 1 day). Return events from all three combined, with `tick_number` of the final tick.

**Event rules** (derived from `FactionTick` records post-tick):
- `action == BATTLE` → battle event with `dice_roll`
- `faction.is_famine` → famine event
- `faction.is_dying` → death warning event
- Any others TBD as the engine produces interesting state

**Not yet implemented:** reverse tick. The engine has no undo mechanism — snapshots are immutable history. A future implementation could restore model state from the previous tick's snapshots. Returns `501` for now.

---

## Party

### `POST /api/party/{party_id}/move/`
The player party moves to a new hex. Triggers one shift tick.

**Request:**
```json
{ "hex_id": 17 }
```

**Preconditions (validated server-side):**
- `hex_id` must be on the same map as `party.current_hex`.
- `party.faction` must exist and have `is_player_faction=True`.
- `hex.player_visible` must be `True` (can only move to visible hexes).

**Orchestration:**
1. Set `party.faction.current_action = 'travel'`, `party.faction.destination = hex`.
2. Save faction.
3. Run one shift tick (same logic as `POST /api/tick/` with `mode="shift"`).
4. After tick: sync `party.current_hex = party.faction.current_hex`, save party.
5. Return same `TickResponse` shape.

---

## Shared Types

```
Map          { id, name, image, hex_size, origin_x, origin_y }
Hex          { id, map, row, col, terrain_type, terrain_difficulty, resource_generation,
               resources, weather, encounter_likelihood, player_explored, player_visible, pois[] }
POI          { id, poi_type, name, difficulty, title, description, notes,
               hidden, player_visible, player_explored }
Faction      { id, name, speed, population, technology, resources, combat_skill,
               current_action, last_action, current_hex, destination,
               is_mobile, is_player_faction, is_gm_faction, is_famine, is_dying, max_speed }
TickResponse { tick_number, events[] }
TickEvent    { type, message, hex_id?, faction_id? }
```

---

## Open Questions

- Should `GET /api/maps/{map_id}/factions/` also include factions with no `current_hex` (e.g. not yet placed)? Probably not for the map view, but a GM management endpoint might want them.
- GM faction action-setting: the GM needs to set `faction.current_action` before ticking. This currently requires Django admin. A `PATCH /api/factions/{id}/action/` endpoint may be needed.
- Visibility updates: `update_character_visibility()` is not called anywhere in the tick flow above. Needs a home — probably called per character in step 6.
