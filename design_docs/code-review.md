# HexTick Code Review

Date: 2026-07-01. Scope: full backend (`backend/world/`) and frontend (`frontend/src/`).
Line numbers reference the state of the code on this date.

## How to use this document (instructions for the implementing model)

- Each finding has an ID (`C1`, `H2`, …), severity, exact file/line references, a problem statement, a **Fix** section with explicit instructions, and an **Acceptance** check.
- Work in severity order: Critical → High → Medium → Low. One finding per commit where practical.
- Findings marked **[VERIFY FIRST]** contain a reproduction step — run it before changing code; if it does not reproduce, stop and report instead of fixing.
- Obey the project rules in `CLAUDE.md`, especially:
  - **Never run `makemigrations` or `migrate`.** If a fix changes a model, make the model change only and tell the user to run migrations.
  - Game logic lives in `actions.py`; models stay dumb; tick records are immutable.
  - Delete dead code fully (component + styles + store keys + imports), never comment it out.
- Some findings are design questions marked **[DECISION NEEDED]** — do not implement these without the user choosing an option.

---

## Status

Structural items track the §1 "Structural analysis" list (S1–S6 map to its six numbered points).

- [x] S1 — `_run_shift`/`party_action` game logic lives in the API layer, not `actions.py` (relates to H1). **Done 2026-07-05:** `run_shift()` + `perform_party_action()` (raising `PartyActionError`) moved to `actions.py`; the `tick.py`/`party.py` routers are now thin validate/serialize + SSE-plumbing wrappers. Behavior-preserving (153 tests green unchanged).
- [x] S2 — `api.py` monolith → `world/api/` router package. **Done 2026-07-05:** `common.py` + `maps`/`hexes`/`factions`/`knowledge`/`tick`/`party`/`gallery` routers mounted at `/` in `__init__.py`; behavior-preserving (153 tests green, only the conftest redis-patch target moved to `world.api.common._redis`). `_run_shift` stayed in `tick.py` — that relocation is S1.
- [ ] S3 — `HexPanel.tsx` (867 lines) → extract `FactionDetail`/`PartyFooter`/`HexEditForm`/`PoiList`
- [~] S4 — automated tests (see M9; substantially addressed, gaps remain)
- [ ] S5 — `design_docs`/CLAUDE.md drift re: deleted Characters feature (see L9)
- [x] **C1** — `resolve_leader` deleted; `leader: str = ''` serializes directly. Done.
- [x] **C2** — `rolls = {}` initialized once near `extra = {}`; redundant reset in the move branch removed. Done.
- [x] **C3** — Resolved by removing the feature rather than fixing the sync: `Party.faction` and `Faction.is_player_faction` deleted entirely (user decision, broader than fix options a/b). Backend (models, `api.py`, `actions.py`, `admin.py`) and frontend (`types/index.ts`, `api/maps.ts`, `FactionsPage`, `PlayerPage`, `AddFactionModal`) updated; `CLAUDE.md` and `design_docs/HexTick.md` doc drift fixed.
- [x] H1 — `next_action` dispatch. **Done 2026-07-05 (faction simplification):** `tick_faction` now consumes `next_action` (perform then clear) via the new `_select_action` ladder.
- [x] H2 — `_select_action` priority order. **Resolved by removal 2026-07-05:** the entire priority chain (delve/craft/train/trade/battle) was deleted; factions now use a 4-rule ladder (next_action → destination → night-rest → day d3). No priority ambiguity remains.
- [x] H3 — scouting radius mismatch. **Resolved by removal 2026-07-05:** `scouting` and all faction-vs-faction range logic deleted.
- [ ] H4 — `reset_to_tick` partial restore. **Partially addressed 2026-07-05:** the omitted stat columns were removed from `FactionTick`, so snapshot/restore now match for the surviving fields (`speed`/`population`/`current_hex`/`destination`). Party live-state / `sub_tick` restore still outstanding.
- [ ] H5 — `duplicate_map` shared image files
- [ ] H6 — `party_action` 500 on no `current_hex`
- [ ] H7 — first party action on a city map 500s (`PartyTick.tick` null) — found 2026-07-04 while writing pinning tests
- [x] M1 — disease re-contraction double-apply. **Resolved by removal 2026-07-05:** the entire disease system (`DiseaseType`, `ActiveDisease`, apply/expire) was deleted.
- [x] M2 — no stat floors. **Resolved by removal 2026-07-05:** `resources`/`technology`/`combat_skill`/`scouting` and the trade/battle math that drove them negative were deleted.
- [ ] M3 — `update_party_tick_notes` query-param mismatch
- [ ] M4 — SSE keepalive
- [ ] M5 — `WorldSettings.get()` N+1 on tick
- [ ] M6 — `useTickStream` build-breaking type
- [x] M7 — `create_faction` drops `notes`. **Done 2026-07-05:** `create_faction` now passes `notes=body.notes`.
- [ ] M8 — factions with `current_hex=None` vanish **[DECISION NEEDED]**
- [~] M9 — no automated tests — **substantially addressed 2026-07-04.** Backend suite 153 tests (was 47): full API pinning suite (`backend/world/tests/api/`, api.py 0%→95%) ahead of the router split, plus engine tests (`test_actions.py`, actions.py 58%→83%); `pytest-cov` in the `test` dependency-group. **Frontend suite expanded 44→116 tests** (steps 1–6 of the §"Frontend test plan"): added `src/test/renderWithProviders.tsx` helper, component tests for `EventLog`/`DiceModal`/`MonsterModal`/`NPCModal`/`LastActionResultModal`/`ActionModal` (gating matrix + submit body)/`AddFactionModal`/`AddPOIModal`/`BulkHexPanel` (tri-state), api wrappers `maps`/`tick`/`gallery`, and **`HexPanel` characterization tests written before its planned extraction**. Remaining backend gaps: SSE stream generator, random-driven `_run_shift` event emission, deep `duplicate_map` clone branches, `admin.py` (63%). Remaining frontend: `HexMap` render-smoke (step 7, deprioritized).
- [~] L1 — dead code inventory (8 items). **Partially resolved 2026-07-05:** item 1 (`merge`/`Action.MERGE`) and item 2 (faction `search`) deleted with the faction simplification. Items 3–8 still outstanding.
- [x] L2 — faction default drift. **Resolved 2026-07-05:** `FactionCreateSchema` defaults now match the model (speed/max_speed 4, population 10) and forward `notes`.
- [x] L3 — frontend/backend enum drift. **Resolved 2026-07-05:** `ActionType` rewritten to the new set (`supply`/`travel`/`rest`/`search`/`explore`/`social`/`delve`).
- [ ] L4 — `duplicate_map` N+1 on knowledge
- [ ] L5 — `Hex.save()` side effect
- [ ] L6 — concurrency: lock ordering
- [ ] L7 — `client.ts` Content-Type on GET/DELETE
- [ ] L8 — `post_tick` day-mode broadcast (no-op note, not a fix)
- [x] L9 — CLAUDE.md Characters/Knowledge drift. **Done 2026-07-05:** the Characters and Knowledge sections were removed and the Faction-types / `_select_action` / model-layout sections rewritten to match the simplified factions.

---

## 1. Structural analysis

### Layout and layering

The documented architecture (models → `actions.py` engine → `api.py` endpoints; React SPA talking to Django Ninja) is mostly respected: models contain no dice rolls or side effects, `actions.py` never imports from `api.py`, and the frontend keeps server state in React Query and UI state in Zustand. The hex-coordinate and move-cost logic is correctly centralized (`utils.py` / `moveCost.ts`).

Structural weaknesses, in priority order:

1. **`_run_shift` and `party_action` live in `api.py`, not `actions.py`** ([api.py:714-773](../backend/world/api.py), [api.py:1017-1181](../backend/world/api.py)). `CLAUDE.md` states "`actions.py` is the game engine — ALL game logic" but the shift orchestration (tick creation, faction candidate filtering, party supply consumption trigger, city sub-tick logic, player-faction sync) is a ~250-line block inside the API layer. `party_action` alone is a 165-line if/elif chain mixing HTTP validation, game rules, and SSE plumbing. **Recommendation:** move `_run_shift` and per-action party logic into `actions.py` (e.g. `run_shift(map_obj)`, `perform_party_action(party, action, …) -> PartyActionOutcome`), leaving `api.py` endpoints as thin validators/serializers.
2. **`api.py` is a 1,308-line monolith.** Django Ninja supports `Router`. **Recommendation:** split into `world/api/` package with routers: `maps.py`, `hexes.py`, `factions.py`, `knowledge.py`, `tick.py`, `party.py`, `gallery.py`, mounted from a central `api.py`. Pure mechanical move; no behavior change. Docs: https://django-ninja.dev/guides/routers/ **— DONE 2026-07-05:** `api.py` is now a `world/api/` package (`common.py` + `maps`/`hexes`/`factions`/`knowledge`/`tick`/`party`/`gallery` routers, mounted at `/` in `__init__.py`). All 153 tests green unchanged (only the conftest redis patch target moved to `world.api.common._redis`). `_run_shift` still lives in the API layer (`tick.py`) — relocating it to `actions.py` remains structural item 1, unaddressed.
3. **`HexPanel.tsx` is 867 lines** with at least six responsibilities (hex view, hex edit form, POI list + detail expand, faction list + faction edit form, party footer + party edit form, Last Move panel). **Recommendation:** extract `FactionDetail`, `PartyFooter`, `HexEditForm`, `PoiList` into sibling components under `components/HexPanel/`.
4. **Automated tests** — originally zero; as of 2026-07-04 the backend has a 153-test pytest suite (`backend/world/tests/`) covering the tick engine (`test_actions.py`) and all `api.py` endpoints (`tests/api/`, api.py 0%→95%). See M9 for the full inventory. The API tests are deliberately **characterization/pinning** tests written ahead of the router split (structural item 2) — they lock current behavior, bugs included, so the split can be verified as behavior-preserving. Frontend test scaffolding now exists (Vitest + RTL + jsdom, 2026-07-04): 44 tests across `utils/moveCost`, `components/HexMap/hexGeometry`, `store/useGameStore`, the `hooks/useTickStream` SSE-routing hook, the `api/client` fetch wrapper, and the `TimeOfDayBadge` component (first render test). Remaining backend gaps: `admin.py` (63%), the SSE stream, and random-driven `_run_shift` event emission. Frontend still untested: the larger stateful components (HexPanel, HexMap, the modals) and the resource-specific api wrappers (`maps.ts`, `tick.ts`, `gallery.ts` — though they're thin pass-throughs over the now-covered `client.ts`).
5. **`design_docs/` drift**: `CLAUDE.md` documents a Characters feature (`Character`, `CharacterTick`, `Item` models, `tick_character`, `update_character_visibility`, `CharactersPage`, `/map/:mapId/characters` route, `GET/POST /maps/{map_id}/characters/`) that was deleted in migration 0030. None of it exists in code. See L-9.

### Data-model observations

- Tick snapshot models (`HexTick`, `FactionTick`, `PartyTick`) are append-only as documented, but `FactionTick` snapshots more than `reset_to_tick` restores (H4) — the snapshot/restore pair has no single field list, so they drift.
- `Faction` numeric stats have no floors/caps at the model or engine level; several engine paths push `combat_skill`, `resources`, `population` negative (M3).
- `Hex.resources` grows without bound (+`resource_generation × hex_resource_tick_modifier` every morning, only drained by faction `supply`). Consider a cap if long campaigns matter.

---

## 2. Findings

### CRITICAL

---

#### C1 — `FactionSchema.resolve_leader` reads a nonexistent `leader_id` attribute **[VERIFY FIRST]**

- **Status:** Done
- **Severity:** Critical
- **File:** [backend/world/api.py:507-509](../backend/world/api.py)

`Faction.leader` was converted from a `ForeignKey(Character)` to a `CharField` in migration `0030_alter_faction_leader_…` ([backend/world/models/faction.py:34](../backend/world/models/faction.py)). A `CharField` does not create a `leader_id` attribute, so the resolver:

```python
@staticmethod
def resolve_leader(obj):
    return obj.leader_id
```

raises `AttributeError` when the schema serializes, which would 500 every `GET /maps/{id}/factions/`, `PATCH /factions/{id}/`, and `POST /maps/{id}/factions/`.

**Verify:** `cd backend && USE_SQLITE=true pdm run python manage.py shell -c "from world.models import Faction; print(Faction(name='x').leader_id)"` — expect `AttributeError`. Then hit `GET /api/maps/1/factions/` on a running instance and confirm the 500.

**Fix:** delete the `resolve_leader` static method entirely — `leader: str = ''` on the schema will serialize the CharField directly with no resolver.

**Acceptance:** faction list endpoint returns 200 with `leader` as a string; faction PATCH round-trips a `leader` value.

---

#### C2 — `UnboundLocalError` on `rolls` for supply/rest actions on city maps

- **Status:** Done
- **Severity:** Critical
- **File:** [backend/world/api.py:1085-1094](../backend/world/api.py) (supply), [api.py:1112-1119](../backend/world/api.py) (rest), crash site [api.py:1177](../backend/world/api.py)

In `party_action`, `rolls` is only assigned:
- in the `move` branch (`rolls = {}` then possibly `party_move_rolls(...)`),
- in the `supply`/`rest` branches **only when the map is not a city map** (`if supply_map and supply_map.map_type != MapType.CITY: rolls = ...`).

Line 1177 then evaluates `if body.action in ('move', 'supply', 'rest') and rolls:`. For a **supply or rest action on a city map**, `rolls` was never bound → `UnboundLocalError` → 500 → the whole transaction (including the already-run shift) rolls back.

**Fix:** initialize `rolls: dict = {}` once near the top of `party_action` (next to `extra = {}` at line 1022) and remove the now-redundant `rolls = {}` inside the move branch.

**Acceptance:** on a map with `map_type='city'`, `POST /api/party/{id}/action/` with `{"action": "supply"}` and `{"action": "rest"}` both return 200.

---

#### C3 — Player-faction sync after a move can teleport the party back to its old hex **[VERIFY FIRST]** **[DECISION NEEDED]**

- **Status:** Done — resolved by removing `Party.faction`/`Faction.is_player_faction` entirely rather than fix option (a) or (b) below (user decision). Migration pending.
- **Severity:** Critical (silent state corruption) — downgrade to High if no party has a linked faction in practice
- **File:** [backend/world/api.py:1051-1054](../backend/world/api.py) and [api.py:1162-1165](../backend/world/api.py)

Sequence when a party with `faction.is_player_faction=True` moves:
1. Line 1045: `party.current_hex = destination; party.save()` — party is at the destination.
2. Lines 1051-1054: the faction gets `current_action = TRAVEL`, `destination = destination` — but **its `current_hex` is not changed**.
3. `_run_shift` runs. In `tick_faction` ([actions.py:187-194](../backend/world/actions.py)), player factions **skip `_select_action`** — nothing in the engine ever moves a player faction toward its destination.
4. Lines 1162-1165: `party.refresh_from_db(); party.current_hex = party.faction.current_hex; party.save()` — the party is set back to the faction's **unchanged, old** hex, silently undoing the move made in step 1.

**Verify:** create a party linked to an `is_player_faction` faction, both on hex A; `POST action=move` to adjacent hex B; then `GET /maps/{id}/party/` — if `current_hex` is back to A, the bug is confirmed.

**Fix options (user must choose):**
- **(a) Faction follows party** (likely intent): replace lines 1051-1054 with `party.faction.current_hex = destination; party.faction.current_action = Action.TRAVEL; party.faction.destination = None; party.faction.save()`, and delete the sync-back block at 1162-1165.
- **(b) Party follows faction**: keep the sync-back but make the engine actually move player factions with a destination (contradicts the "player factions don't auto-tick" rule — not recommended).

**Acceptance:** after a party move, both `party.current_hex` and `party.faction.current_hex` equal the destination.

---

### HIGH

---

#### H1 — `Faction.next_action` is stored and editable but never consumed by the engine

- **Severity:** High (advertised feature has no effect)
- **Files:** [backend/world/actions.py:180-194](../backend/world/actions.py), [backend/world/api.py:559](../backend/world/api.py) (patch schema), HexPanel faction edit form

`next_action` is settable via `PATCH /api/factions/{id}/` and the HexPanel edit form, and `CLAUDE.md` describes GM/player factions acting on a GM-set action. But `tick_faction` only ever **clears** it (`faction.next_action = None` for NPC factions, [actions.py:191](../backend/world/actions.py)) and never reads it. GM/player factions tick with `ActionResult(action=faction.current_action)` — a snapshot label with no executed effect either.

**Fix (intended semantics per CLAUDE.md faction-types table):** in `tick_faction`, for GM/player factions: if `faction.next_action` is set, promote it (`faction.current_action = faction.next_action; faction.next_action = None`) **and dispatch the corresponding action function** (`supply`/`travel`(toward `destination`)/`trade`/`train`/`craft`/`delve`/`battle` — reuse the same functions `_select_action` calls; skip actions needing a target that is absent, falling back to `ActionResult(action=..., success=False, notes='no valid target')`). Keep NPC behavior unchanged.

**Acceptance:** setting `next_action='train'` on a GM faction and firing a shift increases its `combat_skill` and records a `FactionTick` with `action='train'`; `next_action` is null afterward.

---

#### H2 — `_select_action` priority order makes delve/craft branches unreachable; diverges from documented spec **[DECISION NEEDED]**

- **Severity:** High (game balance / spec mismatch)
- **File:** [backend/world/actions.py:154-177](../backend/world/actions.py)

`CLAUDE.md` documents the priority as: … 6) comfort ≥ 0 → supply, 7) comfort < 0 → travel, 8) dungeon delve, 9) craft, 10) train. The code implements 6/7 as an if/else that **returns in both arms whenever any adjacent hex exists**:

```python
if faction.comfort(...) >= 0:
    return supply(...)
else:
    best = min(candidate_hexes, ...)
    if best:
        return travel(...)
# delve / craft / train only reachable when comfort < 0 AND no candidates
```

Consequences: NPC factions essentially never delve, craft, or train (train only via the `travel()` speed-fallback). Additional spec mismatches in the same block:
- Delve gate uses `faction.resources > modifier(faction.population)` (line 169); CLAUDE.md says `resources > population`.
- Craft gate likewise uses `modifier(faction.population)` (line 174).

**Fix (needs user decision on intended rules):** if CLAUDE.md is the spec, restructure so delve/craft checks run **before** the comfort travel/supply fallthrough or at least before `return supply(...)`, and align the resource thresholds with the doc (or update the doc to match the code). Add unit tests pinning the chosen priority order.

**Acceptance:** a test faction on a hex with a visible dungeon, `resources > population`, and a passing theology roll produces `action='delve'` on tick.

---

#### H3 — Scouting radius computed two different ways (prefilter vs. selection)

- **Severity:** High (NPC AI effectively blind with default stats)
- **Files:** [backend/world/api.py:729-735](../backend/world/api.py) vs [backend/world/actions.py:119-122](../backend/world/actions.py)

`_run_shift` prefilters `nearby` with `hex_distance(...) <= modifier(faction.scouting)` (i.e. `scouting // 10` — **0** for the default `scouting=1`, so only same-hex factions pass). `_select_action` then filters the already-filtered list with `hex_distance(hex, f.current_hex) <= faction.scouting` (raw score). Two sources of truth; the tighter one (modifier) always wins, so raising `scouting` from 1→9 does nothing and the doc'd "scouting range" is ambiguous.

**Fix:** pick one definition — recommended: **raw `faction.scouting` as hex radius** (matches `_select_action` and gives the stat visible effect). Change the `_run_shift` prefilter to `<= faction.scouting` and delete the redundant re-filter in `_select_action` (keep the `min(...)`-closest computation). If modifier-based range is intended instead, change `_select_action` to use `modifier(faction.scouting)` and update CLAUDE.md.

**Acceptance:** a faction with `scouting=3` reacts (battle/trade/flee) to a faction 3 hexes away; with `scouting=1` it does not.

---

#### H4 — `reset_to_tick` restores only a subset of snapshotted state

- **Severity:** High (time-travel reset silently corrupts campaign state)
- **File:** [backend/world/api.py:934-970](../backend/world/api.py)

`FactionTick` snapshots `scouting`, `theology`, `famine_streak` ([models/ticks.py](../backend/world/models/ticks.py)) but the reset's `Faction.objects.update(...)` omits all three. Also not restored: `Faction.is_dead` / dead factions (excluded from ticking, so they have no snapshot at later ticks but remain dead after reset to a tick where they were alive), active diseases, `Faction.last_action`/`current_action`, `Party` live state (a `PartyTick` snapshot exists at-or-before the target tick), and `Map.sub_tick` on city maps.

**Fix, in scope order:**
1. Add `scouting=ft.scouting, theology=ft.theology, famine_streak=ft.famine_streak` to the faction update (pure omission — no schema change).
2. Restore party live state from the most-recent `PartyTick` at-or-before the target tick (`current_hex_id`, `destination_id`, `current_action=pt.action`, `last_action`).
3. Reset `map_obj.sub_tick = 0` alongside `current_tick`.
4. `is_dead`/diseases require new snapshot fields on `FactionTick` (model change → **user runs migrations**) — propose separately, do not bundle.

**Acceptance:** run 5 shifts mutating a faction's theology/famine, reset to tick 2, and confirm the faction's live `scouting/theology/famine_streak` equal its tick-2 `FactionTick` row.

---

#### H5 — `duplicate_map` shares image files with the source; deleting a duplicate's gallery image destroys the original's file

- **Severity:** High (permanent data loss of uploaded media)
- **Files:** [backend/world/api.py:170-213](../backend/world/api.py) (duplicate assigns `image=source.image` / `image=gi.image` — same storage path), [api.py:1288-1293](../backend/world/api.py) (`delete_gallery_image` calls `img.image.delete(save=False)` which removes the file from disk)

After duplicating a map, both `GalleryImage` rows point at the same file under `media/gallery/`. Deleting either one deletes the file, breaking the other (and the same applies to `Map.image` if map deletion ever removes files).

**Fix (two parts):**
1. In `duplicate_map`, copy the underlying files: for each cloned image field, open the source file and save it to a new name, e.g. `new_gi.image.save(os.path.basename(gi.image.name), ContentFile(gi.image.read()), save=True)` (`from django.core.files.base import ContentFile`). Same for `new_map.image`.
2. Defensively, in `delete_gallery_image`, only delete the file if no other `GalleryImage` (or `Map`) row references the same `image.name`.

**Acceptance:** duplicate a map with one gallery image; delete the duplicate's gallery image; the source map's gallery image still loads over HTTP.

---

#### H6 — `party_action` 500s when the party has no `current_hex` (non-move actions)

- **Severity:** High (unhandled 500, easy to hit on a freshly created party)
- **File:** [backend/world/api.py:1021](../backend/world/api.py) (`map_id = party.current_hex.map_id if party.current_hex else None`), crash at [api.py:1143](../backend/world/api.py)/[api.py:1158](../backend/world/api.py)

For `search`/`supply`/`social`/`rest` with `party.current_hex = None`: `map_id` stays `None`, `Map.objects.get(id=None)` raises `Map.DoesNotExist` at line 1143, and even if it survived, `_run_shift(None)` would crash. Note `party.map_id` exists (`Party.map` OneToOneField) and is the better source.

**Fix:** derive `map_id` as `party.current_hex.map_id if party.current_hex else party.map_id`; if still `None`, return 400 `'Party is not on a map.'` early.

**Acceptance:** `POST /api/party/{id}/action/` with `{"action": "rest"}` on a party with `current_hex=None` but `map` set returns 200 and fires a shift; with neither set returns 400.

---

#### H7 — First party action on a city map 500s because `PartyTick.tick` is null

- **Severity:** High (unhandled 500 on a normal first action; found 2026-07-04 while writing pinning tests — not in the original review)
- **File:** [backend/world/api.py:1126-1149](../backend/world/api.py) (`party_action` sub-tick path), [api.py:990-1002](../backend/world/api.py) (`_create_party_tick`), [backend/world/models/ticks.py](../backend/world/models/ticks.py) (`PartyTick.tick` FK)

On a **city map**, the first party action is a mid-shift sub-tick: `map_obj.sub_tick` goes 0→1, so `is_shift` is False and `_run_shift` never runs. On a freshly created map `map_obj.current_tick` is still `None` (no `Tick` rows exist yet), so `tick = map_obj.current_tick` is `None`. `_create_party_tick(party, tick=None, …)` then does `PartyTick.objects.update_or_create(tick=None, …)`; `PartyTick.tick` is a non-null FK → `IntegrityError: NOT NULL constraint failed: world_partytick.tick_id` → 500, rolling back the action. Regional maps are unaffected (every action runs a shift, creating the tick first).

**Verify:** on a `map_type='city'` map with no ticks, `POST /api/party/{id}/action/` with `{"action": "supply"}` returns 500. Pinned by `backend/world/tests/api/test_party.py::TestCityMapActions::test_first_action_on_fresh_city_map_500` (characterization — expects the current 500).

**Fix (choose one):**
- **(a) Guarantee a tick before sub-tick actions** — when a city map's first action fires mid-shift with no `current_tick`, run/seed the shift so a `Tick` exists (or seed tick 0/1 at map creation). Keeps `PartyTick.tick` non-null.
- **(b) Make `PartyTick.tick` nullable** (model change → **user runs migrations**) and handle null downstream in the tick-state/history lookups. Broader blast radius; not recommended.

**Acceptance:** the first `supply`/`rest` action on a fresh city map returns 200 and records a `PartyTick`; rewrite the pinning test to assert 200.

---

### MEDIUM

---

#### M1 — Disease re-contraction double-applies stat effects, causing permanent drift

- **Severity:** Medium
- **File:** [backend/world/actions.py:311-347](../backend/world/actions.py)

`_apply_disease` always applies the stat delta (e.g. Restless: `scouting += effect_value`; The Runs: `combat_skill -= effect_value`) and then `update_or_create` **overwrites** `effect_value`. If a faction re-contracts an active disease, the effect is applied a second time but only the second roll is recorded, so `_expire_disease` reverts only the latest amount — the first application leaks permanently. (CLAUDE.md says re-contraction "resets duration rather than stacking" — the duration resets, but stats do stack.)

**Fix:** in `_apply_disease`, check for an existing `ActiveDisease` first: `existing = faction.diseases.filter(disease_type=disease_type).first()`. If found, only refresh `duration_days_remaining` and return; apply stat effects only on first contraction.

**Acceptance:** applying Restless twice then letting it expire returns `scouting` exactly to its original value.

---

#### M2 — No stat floors: `trade`, `battle`, and diseases can push resources/combat_skill/population negative

- **Severity:** Medium (game-balance corruption over long campaigns)
- **Files:** [backend/world/actions.py:431-455](../backend/world/actions.py) (`trade` subtracts `trade_amount` from the counterparty without checking balance), [actions.py:480-493](../backend/world/actions.py) (`battle`: `winner.combat_skill -= loser.combat_skill // 2` can go negative, then `winner.resources += winner.combat_skill` **reduces** resources; loser population negative until next tick), [actions.py:315-329](../backend/world/actions.py) (Madness/The Runs)

**Fix:** clamp at the point of mutation: `max(0, ...)` on `resources`, `technology`, `combat_skill`, `scouting` in `trade`, `battle`, `_apply_disease`. In `battle`, compute the loot **before** reducing the winner's skill, or clamp: `winner.resources += max(0, winner.combat_skill)`. Leave `population` unclamped (the ≤ 0 → dead check in `tick_faction` handles it) or clamp to 0 there too — either is fine, be consistent.

**Acceptance:** unit test: trade against a faction with 0 resources leaves both parties non-negative; a battle between skill-1 and skill-20 factions leaves all stats ≥ 0 except population-death.

---

#### M3 — `update_party_tick_notes` binds `notes` as a query parameter; the frontend sends a JSON body

- **Severity:** Medium (dormant — no UI calls it yet, but it will 422 the moment one does)
- **Files:** [backend/world/api.py:1184-1190](../backend/world/api.py), [frontend/src/api/tick.ts:58-59](../frontend/src/api/tick.ts)

Django Ninja binds a bare `notes: str` parameter as a **query** param; `patchPartyTickNotes` sends `{ notes }` as JSON. Any future UI wiring gets a 422.

**Fix:** define `class PartyTickNotesSchema(Schema): notes: str` and change the signature to `(request, party_id: int, party_tick_id: int, body: PartyTickNotesSchema)`, using `body.notes`.

**Acceptance:** `curl -X PATCH .../party/1/ticks/1/notes/ -d '{"notes":"x"}' -H 'Content-Type: application/json'` returns 200 with the note persisted.

---

#### M4 — SSE stream blocks a gunicorn worker thread per client and sends no periodic keepalive

- **Severity:** Medium (reliability under multiple viewers)
- **File:** [backend/world/api.py:30-48](../backend/world/api.py)

`pubsub.listen()` blocks forever inside a sync generator: each GM/player tab pins a worker thread for its lifetime, and the `": keepalive"` branch only fires on pubsub control messages (effectively only the initial subscribe), so idle connections can be dropped by proxies/browsers.

**Fix (minimal, no stack change):** replace `pubsub.listen()` with a loop over `pubsub.get_message(timeout=15.0)`; when it returns `None`, yield `": keepalive\n\n"`; when it returns a message dict of type `message`, yield the data frame. Also document that gunicorn needs enough threads for expected concurrent tabs (`--threads`), or note ASGI/`EventStream` as the long-term fix. Docs: https://redis.readthedocs.io/en/stable/advanced_features.html#publish-subscribe

**Acceptance:** with an open EventSource and no ticks for 60s, the client receives keepalive comments and stays connected.

---

#### M5 — `WorldSettings.get()` executes a query for every hex on every morning tick

- **Severity:** Medium (perf; N queries per tick on large maps)
- **File:** [backend/world/actions.py:270-273](../backend/world/actions.py) (`tick_hex`), caller [api.py:724-725](../backend/world/api.py)

`WorldSettings.get()` is `get_or_create` — one query (sometimes two) per hex, per morning tick, inside the tick transaction. A 40×30 map = 1,200 extra queries every third tick. Similarly, `HexTick.objects.create` runs once per hex — acceptable, but the settings lookup is pure waste. Note `tick_hex` also violates the "DB queries stay out of the engine" rule from CLAUDE.md.

**Fix:** fetch `settings = WorldSettings.get()` once in `_run_shift` and pass `hex_resource_tick_modifier` (or the settings object) into `tick_hex` as a parameter. Optional further win: collect `HexTick` rows and `bulk_create` them.

**Acceptance:** a shift on an N-hex map performs O(1) `WorldSettings` queries (verify with `django.db.connection.queries` in a test with `DEBUG=True`).

---

#### M6 — `useTickStream` accesses `parsed.action`, which is absent from its inline type — production build likely fails **[VERIFY FIRST]**

- **Severity:** Medium (build health; `npm run build` runs `tsc -b`)
- **File:** [frontend/src/hooks/useTickStream.ts:24](../frontend/src/hooks/useTickStream.ts) (type), [useTickStream.ts:46](../frontend/src/hooks/useTickStream.ts) (`parsed.action ?? 'move'`)

The inline type for `parsed` declares `type/hex_id/lost/lost_roll/wilderness_event/event_roll` but not `action`. `vite dev` does not typecheck, so this only surfaces on `npm run build` (TS2339).

**Verify:** `cd frontend && npx tsc -b --noEmit` (or `npm run build`).

**Fix:** add `action?: string` to the inline type. Better: extract a shared `SseEvent` interface into `types/index.ts` and reuse it. Fix any other errors tsc reports in the same pass.

**Acceptance:** `npm run build` completes with zero TypeScript errors.

---

#### M7 — `create_faction` silently drops `notes` (and other accepted-but-ignored fields)

- **Severity:** Medium (data loss on create)
- **File:** [backend/world/api.py:520-535](../backend/world/api.py) (schema accepts `notes`), [api.py:595-617](../backend/world/api.py) (create omits it)

`FactionCreateSchema` accepts `notes` but `Faction.objects.create(...)` never passes it — a note supplied at creation vanishes without error.

**Fix:** pass `notes=body.notes` in the create call. Audit the create for other schema fields not forwarded (currently just `notes`). Also see L-2 (default drift between schema and model).

**Acceptance:** `POST /maps/{id}/factions/` with `notes` set returns the faction and a subsequent GET shows the note.

---

#### M8 — Factions with `current_hex = None` disappear from the API entirely

- **Severity:** Medium (confusing data loss appearance)
- **File:** [backend/world/api.py:538-541](../backend/world/api.py) (`filter(current_hex__map_id=map_id)`); same pattern in `_run_shift` [api.py:722](../backend/world/api.py) and `duplicate_map` [api.py:264-265](../backend/world/api.py)

`Faction` has no `map` FK — map membership is inferred from `current_hex`. A faction whose hex is cleared (GM edit, or `SET_NULL` on hex deletion) vanishes from every list, the map view, and map duplication, but still exists in the DB. This is an architectural gap rather than a bug; at minimum it deserves a decision.

**Fix [DECISION NEEDED]:** either (a) add `Faction.map = ForeignKey(Map)` (model change → user runs migrations; backfill from `current_hex__map`; filter lists by `map_id`), or (b) accept the behavior and guard against it: forbid clearing `current_hex` via `PATCH /factions/{id}/` unless the faction is being deleted, and document the invariant in CLAUDE.md.

**Acceptance (option a):** a faction with a null hex still appears in `GET /maps/{id}/factions/`.

---

#### M9 — No automated tests

- **Status:** Substantially addressed (2026-07-04). Scaffolding uses **pytest + pytest-django** (not `manage.py test` — user preference); config in root `pyproject.toml`, run via `pdm run test`. `pytest-cov` is now in the `test` dependency-group; coverage: **api.py 0%→95%, actions.py 58%→83%, suite 47→153 tests.** Tests:
  - `test_engine.py` — `hex_distance`, `move_difficulty` matrix.
  - `test_faction_stats.py` — `modifier()`, `Faction.comfort()`.
  - `test_diseases.py` — `_apply_disease`/`_expire_disease` round-trips + the M1 re-contraction pin.
  - `test_select_action.py` — top of the `_select_action` priority chain.
  - **`test_actions.py`** (new) — the previously-missing engine branches: `_select_action` detour / hostile-steer / outmatched-flee / recent-battle arms, `travel` speed-fallback, `trade`, `battle` (traveler branch + the **M2 negative-stat pin**), `train`/`craft`/`delve`/`merge`, `random_encounter` buckets, and `tick_faction` daily/weekly/death. Randomness pinned per test.
  - **`tests/api/`** (new package) — end-to-end pinning tests for all 30 `api.py` endpoints, grouped by resource to mirror the planned router split (`test_maps`/`test_hexes`/`test_factions`/`test_knowledge`/`test_tick`/`test_party`/`test_gallery`). Harness in `tests/api/conftest.py` (see below). These pin **current** behavior including the known bugs, so the router split can be verified as behavior-preserving; tests encoding bugs are marked `CHARACTERIZATION — pins <id>` (H4/H5/H6/H7/M3/M7/M8, plus H2/M2 in the engine) and must be rewritten when each fix lands — same convention as the M1 pin.
  - `tests/conftest.py` / `tests/api/conftest.py` — shared `map_factory`/`hex_factory`/`faction_factory` DB fixtures; the api-level conftest overrides `map_factory` (non-empty `image`), replaces `world.api._redis` with a recording fake, and wraps `django.test.Client` for JSON.

  Remaining backend gaps: SSE stream generator, random-driven `_run_shift` event emission, deep `duplicate_map` clone branches, `admin.py` (63%). H2's delve/craft/train tail is pinned as *unreachable* (characterization) rather than exercised, pending the H2 reorder.

  **Frontend scaffolding added 2026-07-04** — **Vitest + React Testing Library + jsdom**. Config in `frontend/vite.config.ts` (`test` key) + `frontend/src/test/setup.ts` (jest-dom matchers, `cleanup()` per test). Scripts: `test` (watch), `test:run` (one-shot), `test:types` (`tsconfig.vitest.json`). Runs **in the `hextick-frontend-1` container** (`docker exec hextick-frontend-1 npx vitest run`) — the Windows host has no Node and WSL's Node is v12 (too old for Vite 8 / Vitest 4). Production build (`tsc -b`) excludes test files via `tsconfig.app.json`; test typechecking is the separate `tsconfig.vitest.json`. Covered so far (44 tests): `utils/moveCost` (mirrors the backend `move_difficulty` matrix — road/terrain base, night +1, weather penalties, catastrophic→blocked); `components/HexMap/hexGeometry` (`hexToPixel` odd-col offset / row-up, `flatTopPoints`, `mapBounds`); `store/useGameStore` (selection resets, multi-select toggles, faction-hex set copying, `setMoveResult` vs `recordMoveResult` sequence bump); `hooks/useTickStream` (SSE event routing — gallery/highlight/move_result/navigation_update/full-invalidate fallback, via a fake `EventSource` + real `QueryClient`); `api/client` (method/body/header handling per verb, `postForm` empty-header multipart, non-ok error text — via a stubbed `fetch`); `TimeOfDayBadge` (morning/afternoon/night label + `Day floor(tick/3)`, first RTL render test). Note M6 is already fixed in code (the inline `parsed` type includes `action`). Still untested: the larger stateful components (HexPanel, HexMap, modals). L3 enum-drift is a natural next target.

##### Frontend test plan — remaining targets (for a fresh session)

Run everything in the container: `docker exec hextick-frontend-1 npx vitest run` (+ `npm run test:types`, then `npx tsc -b` to confirm the production build). Colocate `*.test.ts(x)` beside the source. Reuse the harness patterns already documented in `CLAUDE.md` → Testing → Frontend (store snapshot/restore, fake `EventSource`, `fetch` stub with `import.meta.env.VITE_API_URL` base). Suggested order — cheapest/highest-value first:

1. **Shared render helper** (`src/test/renderWithProviders.tsx`) — wrap RTL `render` in a fresh `QueryClientProvider` (new `QueryClient` per call, `retry: false`) + `MemoryRouter`, and reset `useGameStore` to its snapshot in `beforeEach`. Every component test below depends on this; build it first. Seed React Query cache via `qc.setQueryData(['gallery', mapId], …)` instead of mocking network where a component reads a query directly.

2. **Small pure-ish components (RTL render):**
   - `ShiftActionsIndicator`, `TimeOfDayBadge` (done) — label/derived-number rendering.
   - `EventLog` — renders a list of `pendingEvents`; assert empty state vs N rows.
   - `DiceModal` / `MonsterModal` / `NPCModal` / `LastActionResultModal` — open/closed by prop, renders passed content, calls `onClose`. Use `@testing-library/user-event` for the close button.

3. **`api/` resource wrappers** (`maps.ts`, `tick.ts`, `gallery.ts`) — thin; assert each fn calls the right verb+path on a stubbed `client`. Either `vi.mock('./client', …)` and assert the mocked `api.get/post/...` args, or reuse the `fetch` stub and assert the URL. Lower value (pass-throughs over the covered `client.ts`) — do only the non-obvious ones (e.g. `publishGalleryImage` path, `postPartyAction` body shape).

4. **`AddFactionModal` / `AddPOIModal` / `ActionModal`** (form + submit): render, fill fields with `user-event`, submit, assert the POST body / the passed `onSubmit` payload. `ActionModal` also gates actions by context (current vs other hex, dungeon presence) — pin the enable/disable matrix. Mock the api module so no real fetch fires.

5. **`BulkHexPanel`** — tri-state checkbox logic (indeterminate = no change / checked = true / unchecked = false) mapping to the `POST /hexes/bulk-patch/` body. This is fiddly logic worth pinning; assert the constructed payload for each checkbox state.

6. **`HexPanel`** (867 lines, structural hotspot §1.2 item 3) — do this **after** it's extracted into `FactionDetail` / `PartyFooter` / `HexEditForm` / `PoiList` (structural recommendation), and test the extracted pieces individually. Testing the monolith directly is high-effort/low-signal; the extraction is the prerequisite. Focus: view/edit mode toggle, GM-only gating (`gmMode` prop hides faction edit + party edit), the "Move party here" button visibility rule, and the Last Move panel reading from `moveResult`.

7. **`HexMap`** — mostly SVG geometry (already unit-tested via `hexGeometry`) plus broken scroll-zoom (see CLAUDE.md "not wired up"). Render-smoke only (renders N hex cells for an N-hex map, faction arrows for factions with `current_hex`); do **not** try to test pan/zoom (native listeners + direct DOM mutation, jsdom has no layout). Low priority.

Do **not** chase a coverage %; prioritize logic-bearing components (BulkHexPanel tri-state, ActionModal gating, form submit payloads) over presentational ones. Skip `main.tsx`, route wiring, and CSS-only components.
- **Severity:** Medium (process; prerequisite for H2/H3/M1/M2)
- **Files:** `backend/world/tests/`

See structural analysis §1.4. Original fix note (superseded by the pytest choice above): create `backend/world/tests/test_engine.py` covering, at minimum: `hex_distance` known pairs (odd-q offset cases), `move_difficulty` full matrix (road/no-road × day/night × 5 weathers), `modifier`, `comfort` with/without restless, disease apply→expire round-trip, `travel` speed-fallback, `battle` clamping (after M2), and one end-to-end `_run_shift` smoke test on an in-memory map. Use `USE_SQLITE=true`.

**Acceptance:** `pdm run test` passes; the H2/H3 fixes each land with a pinning test.

---

### LOW

---

#### L1 — Dead code inventory (delete per CLAUDE.md "delete dead code immediately")

- **Severity:** Low — but the project's own hard rule says remove these now
- Items, each independently deletable:

| # | Item | Location | Evidence |
|---|------|----------|----------|
| 1 | `merge()` function and `Action.MERGE` choice | [actions.py:458-465](../backend/world/actions.py), [models/faction.py Action](../backend/world/models/faction.py) | No caller anywhere. Removing the enum value touches model choices → needs a (user-run) migration; the TS `ActionType` union also lists `'merge'`. |
| 2 | `search(faction, hex)` engine function | [actions.py:518-520](../backend/world/actions.py) | No caller; duplicates `reveal_pois_on_search`. (The party `search` action uses `reveal_pois_on_search`, not this.) |
| 3 | `HexModal` component (69 lines + CSS) | `frontend/src/components/HexModal/` | Imported by nothing. |
| 4 | `patchPartySupplies` fetch wrapper | [frontend/src/api/tick.ts:62-63](../frontend/src/api/tick.ts) | No UI caller (CLAUDE.md confirms superseded by `patchParty`). Optionally also delete the backend `PATCH /party/{id}/supplies/` endpoint ([api.py:1193-1203](../backend/world/api.py)). |
| 5 | `HexTick.points_of_interest` M2M | [models/ticks.py:24](../backend/world/models/ticks.py) | Never written (CLAUDE.md: "HexTick does not copy POIs"). Model change → user runs migrations. |
| 6 | No-op line `hex_obj.pois.all()  # prefetch for resolver` | [api.py:429](../backend/world/api.py) | An unevaluated lazy queryset; prefetches nothing. Delete the line (the resolver queries anyway). Same pattern at [api.py:689](../backend/world/api.py) (`obj.related_knowledge.all()`). |
| 7 | `Party.destination` field | [models/party.py](../backend/world/models/party.py) | No code path ever sets it (not in `party_action`, not in `PartyPatchSchema`); always null. Displayed in HexPanel footer and snapshotted into `PartyTick` as permanently-null data. Either wire it up or delete it (model change → user migration + PartySchema/TS/HexPanel cleanup). **[DECISION NEEDED]** |
| 8 | `patchPartyTickNotes` | [frontend/src/api/tick.ts:58-59](../frontend/src/api/tick.ts) | Keep only if M3 is fixed and a UI is planned (CLAUDE.md lists the missing UI as known); otherwise delete both wrapper and endpoint. |

**Acceptance:** `npx tsc -b --noEmit` and `pdm run python manage.py check` pass after each deletion; `grep` finds no remaining references.

---

#### L2 — Faction default values drift between model and create schema

- **Severity:** Low
- **Files:** [models/faction.py:36-45](../backend/world/models/faction.py) (speed 4, population 50, technology 20, resources 50, combat_skill 20) vs [api.py:520-535](../backend/world/api.py) (speed 3, population 10, technology 5, resources 10, combat_skill 5) vs `AddFactionModal` defaults

Three sources of truth for "a new faction". Harmless today but a trap. **Fix:** make the API schema defaults match the model (or drop schema defaults and let the model decide), and have `AddFactionModal` initialize from one constant.

---

#### L3 — Frontend type unions out of sync with backend enums

- **Severity:** Low
- **File:** [frontend/src/types/index.ts:3-5](../frontend/src/types/index.ts)

`ActionType` omits `'social'` and `'rest'` (both exist in the backend `Action` enum and are stored in `current_action`/`last_action`, which are typed `ActionType | null`); `PartyActionRequest` omits the `amount` field the supply action accepts ([api.py:985](../backend/world/api.py)). **Fix:** add `'social' | 'rest'` to `ActionType`; add `amount?: number` to `PartyActionRequest`.

---

#### L4 — `duplicate_map` N+1 on knowledge re-fetch

- **Severity:** Low (GM-only, rare operation)
- **File:** [backend/world/api.py:196](../backend/world/api.py)

`{k.id: Knowledge.objects.get(id=knowledge_map[k.id]) ...}` issues one query per knowledge row; the `new_k` instances were already in hand in the creation loop. **Fix:** store the instances in the first loop (`new_knowledge_by_old[k.id] = new_k`) and delete the re-fetch dict comprehension.

---

#### L5 — `Hex.save()` fetches `self.map` and silently mutates `can_enter`

- **Severity:** Low
- **File:** [backend/world/models/hex.py save()](../backend/world/models/hex.py)

Each save of a `can_enter=True` hex triggers a `Map` query (short-circuited otherwise), and the invariant is enforced only on `.save()` — `queryset.update()` paths (bulk-patch, reset) bypass it. Borderline against "models are dumb". **Fix (optional):** move the invariant into `patch_hex`/validation and drop the override, or `select_related('map')` where hexes are loaded for save-heavy paths.

---

#### L6 — Concurrency: party/map mutations happen before the map row lock is taken

- **Severity:** Low (single-GM local app)
- **File:** [backend/world/api.py:1019-1155](../backend/world/api.py)

`party_action` mutates `party` and increments `map_obj.sub_tick` before `_run_shift` takes `select_for_update()` on the map. Two simultaneous player actions could interleave sub_tick math. **Fix (cheap):** `Map.objects.select_for_update().get(...)` once at the top of `party_action` and pass it through instead of re-fetching the map 3–4 times (lines 1031, 1091, 1117, 1126, 1143 — also a readability win).

---

#### L7 — `client.ts` sends `Content-Type: application/json` on GET/DELETE

- **Severity:** Low (cosmetic; harmless with current backend)
- **File:** [frontend/src/api/client.ts:4-7](../frontend/src/api/client.ts)

**Fix (optional):** only set the header when a JSON body is present.

---

#### L8 — `post_tick` day-mode broadcasts only the final tick number

- **Severity:** Low (works — clients do a full invalidation anyway — but the two intermediate ticks emit no SSE)
- **File:** [backend/world/api.py:781-788](../backend/world/api.py)

Intentionally fine today; note only so nobody "fixes" the loop into three broadcasts without knowing clients treat any tick message as full-invalidate.

---

#### L9 — Documentation drift: CLAUDE.md describes deleted Characters feature and stale API notes

- **Severity:** Low (but actively misleading for future sessions — CLAUDE.md's own rule is to prevent exactly this)
- **File:** `CLAUDE.md`

Stale content to remove/correct:
- The entire **Characters** section (`Character` model, `CharactersPage`, `/map/:mapId/characters`, `GET/POST /maps/{id}/characters/`, `CharacterTick`) — deleted in migration 0030.
- `models/characters.py` described as holding "Item, Knowledge, Character, CharacterTick" — it holds only `Knowledge`.
- References to `tick_character` and `update_character_visibility` (including the "What's not wired up yet" bullet) — neither exists.
- "Restless halves `comfort()`" callers description mentions per-faction disease checks in `actions.py` — still accurate, keep.
- `_select_action` priority list — update after H2 is decided so doc and code agree.

**Fix:** edit CLAUDE.md accordingly; also skim `design_docs/API.md` and `design_docs/Factions.md` for the same drift.

---

## 3. Suggested implementation order

1. **C2, C1** — one-line/one-block crash fixes (verify C1 first).
2. **C3** — after user decision (option a recommended).
3. **M9 scaffolding** — minimal test setup, so subsequent engine fixes land with tests.
4. **H3, M1, M2** — engine correctness with pinning tests.
5. **H2** — after user confirms intended priority rules.
6. **H1** — next_action dispatch.
7. **H4, H5, H6, M3–M8** — in any order.
8. **L1 dead-code sweep** (batch the model-touching items 1/5/7 together so the user runs migrations once), then **L2–L9**.

Migration-touching items (user must run `makemigrations`/`migrate`): H4 step 4, M8 option (a), L1 items 1, 5, 7.
Decision-needed items: C3, H2, M8, L1 item 7.
