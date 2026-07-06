# HexTick Code Review

Date: 2026-07-05. Scope: full backend (`backend/world/`) and frontend (`frontend/src/`).
Line numbers reference the state of the code on this date.

This document **replaces** the 2026-07-01 review. Every finding from that review was
resolved (see git history for the record); its remaining open thread — structural item S5,
CLAUDE.md drift — is carried forward here as L1. IDs below start fresh and do not collide
with the old review's IDs. No live `CHARACTERIZATION — pins <id>` test comments reference
old IDs (only a stale docstring, L2).

Baseline at review time: backend **137 tests green** (`pdm run test`), frontend **116
tests green** + `tsc -b` clean (in the `hextick-frontend-1` container).

## How to use this document (instructions for the implementing model)

- Each finding has an ID (`H1`, `M2`, …), severity, exact file/line references, a problem statement, a **Fix** section with explicit instructions, and an **Acceptance** check.
- Work in severity order: High → Medium → Low. One finding per commit where practical.
- Findings marked **[VERIFY FIRST]** contain a reproduction step — run it before changing code; if it does not reproduce, stop and report instead of fixing.
- Findings marked **[DECISION NEEDED]** are design questions — do not implement without the user choosing an option.
- Model changes require migrations — generate them, apply per CLAUDE.md's two-path procedure, and report what ran.
- Obey the project rules in `CLAUDE.md`: game logic lives in `actions.py`; models stay dumb; tick records are immutable; delete dead code fully; add a pinning test with each behavior fix.

---

## Status

- [ ] S1 — `perform_party_action` if/elif monolith
- [ ] S2 — ActionList / ActionModal duplication
- [ ] S3 — dead `events` plumbing
- [ ] S4 — snapshot/restore field drift (mechanism; see H4 for the acute case)
- [ ] S5 — hand-maintained TS request types drift
- [ ] S6 — player client receives full GM data
- [x] H1 — `is_mobile` never consumed by the engine
- [ ] H2 — player POI leak in `PoiList`
- [ ] H3 — `is_lost` not enforced on move
- [ ] H4 — reset-to-tick does not restore weather or party speed/supplies/is_lost
- [ ] H5 — admin-created factions get `map=None` and vanish
- [ ] M1 — GM ActionModal ignores weather
- [ ] M2 — city-map move gating mismatch (frontend blocks, backend allows)
- [ ] M3 — SSE publish inside open transaction (gallery publish)
- [ ] M4 — deleting a published gallery image leaves the player overlay stuck
- [x] M5 — GM party teleport skips map check and reveal semantics (intended, this is a GM emergency tool)
- [ ] M6 — `duplicate_map` drops `weather` and `party.is_lost`
- [ ] M7 — `create_map` 500s on a bad `image_path`; `reveal_mode`/`weather` unvalidated
- [ ] L1 — CLAUDE.md drift (superseded by the CLAUDE.md rewrite if adopted)
- [ ] L2 — stale docstring in `tests/api/conftest.py`
- [ ] L3 — debug `console.log` leftovers
- [ ] L4 — faction default drift (model 50 vs schema/UI 10)
- [ ] L5 — `_perform_travel` does not clear `destination` on arrival
- [ ] L6 — supply `amount` accepted by API but no UI sends it
- [ ] L7 — GMPage setState-during-render
- [ ] L8 — `TickAdmin` lists ticks across maps with no map column/filter
- [ ] L9 — PartyAdmin fieldsets omit newer fields

---

## 1. Structural analysis

### What holds up

The architecture documented in CLAUDE.md is now genuinely enforced in code, and the
previous review's two big moves (S1/S2 of that review) have settled well:

- **Layering is clean.** Models contain no dice rolls or side effects (the one `Hex.save()`
  invariant is a guard, not logic). `actions.py` owns the engine — `run_shift`,
  `perform_party_action`, the faction ladder, the wilderness/weather rolls — and never
  imports from the API layer. Routers are thin: validate, delegate, serialize, publish
  on commit. `PartyActionError`/`PartyActionOutcome` is a good seam.
- **The router split held.** `world/api/` reads as seven small, single-purpose files;
  `common.py` correctly centralizes the SSE surface that tests patch.
- **Single sources of truth are respected**: `move_difficulty`/`computeMoveCost` mirror
  each other (including the weather table), `hex_distance` is used everywhere, and the
  frontend keeps server state in React Query and UI state in Zustand with no leakage.
- **The test culture works.** 137 backend + 116 frontend tests, factory fixtures, a fake
  redis, characterization pins with an explicit rewrite convention. The previous review's
  fixes each landed with tests.

### Structural weaknesses, in priority order

1. **S1 — `perform_party_action` is a 180-line if/elif monolith**
   ([actions.py:352-530](../backend/world/actions.py)). It moved to the right file (old S1)
   but kept its shape: nine action branches, each repeating the
   `last_action = current_action; current_action = X; save()` bookkeeping, plus city
   sub-tick math, shift firing, lock setting, and SSE assembly in one function. Every new
   party action grows it. **Recommendation:** extract one function per action
   (`_do_move`, `_do_rest`, …) each returning `(rolls, extra, sse_messages)`, dispatched
   from a dict; keep the shared bookkeeping and the shift/sub-tick epilogue in
   `perform_party_action`. Pure refactor — the existing API pinning tests verify it.

2. **S2 — `ActionModal` and `ActionList` are near-verbatim duplicates**
   ([components/ActionModal/ActionModal.tsx](../frontend/src/components/ActionModal/ActionModal.tsx),
   [components/ActionList/ActionList.tsx](../frontend/src/components/ActionList/ActionList.tsx)).
   The `ActionDef[]` gating matrix, `formatMoveCost`, and the mutation (including the
   `setMoveResult` block and the five invalidations) are copy-pasted; they have already
   drifted (M1: the modal dropped the `weather` argument). **Recommendation:** extract a
   shared `usePartyActions(party, selectedHex, originHex, mapId, tickNumber, weather)`
   hook returning `{ actions, mutate, isPending, error }`; the two components become thin
   list/modal renderers. The existing `ActionModal.test.tsx` gating-matrix test pins the
   behavior through the refactor.

3. **S3 — the `events` pipeline is dead.** `run_shift` always returns `(tick_number, [])`
   ([actions.py:290](../backend/world/actions.py)); nothing ever appends an event. Yet
   `TickEventSchema`/`TickResponseSchema` ([api/common.py:60-69](../backend/world/api/common.py)),
   `PartyActionOutcome.events`, the `events` key in both endpoint responses, the frontend
   `TickEvent` type, the Zustand `pendingEvents` keys, and the `EventLog` component (both
   pages render it) all exist to carry that permanently-empty list. Under CLAUDE.md's
   "delete dead code immediately" rule this is the largest violation in the codebase.
   **[DECISION NEEDED]:** (a) delete the whole pipeline end-to-end (backend schemas +
   frontend EventLog/pendingEvents), or (b) keep it because faction tick events are
   planned soon — in which case make `tick_faction` results actually emit events so the
   pipe carries something. Recommend (a); it can be re-added when a producer exists.

4. **S4 — snapshot/restore drift has no mechanism, only vigilance.** The previous review's
   H4 fixed the then-known omissions; since then two new pieces of live state appeared and
   are again not covered: `Map.weather` (now mutated by wilderness rolls) and
   `Party.speed/supplies/is_lost` (never snapshotted on `PartyTick`). See H4 for the acute
   fix. Structurally: there is no single place that pairs "state the shift can mutate"
   with "state a snapshot row records" with "state `reset_to_tick` restores" — each new
   mechanic must remember to touch all three. **Recommendation:** after fixing H4, add an
   engine test that runs shifts mutating *every* mutable live field, resets, and asserts
   full equality of the mutated set — so the next drift fails a test instead of a session.

5. **S5 — hand-maintained TS request types drift silently.** `PatchHexParams`
   ([api/maps.ts:7-13](../frontend/src/api/maps.ts)) is missing `has_roads`/`has_rivers`/
   `can_enter`/`linked_map_id` even though `HexEditForm` sends them; `PartyPatch`
   ([api/tick.ts:52-60](../frontend/src/api/tick.ts)) is missing `tracks_supplies` even
   though `PartyFooter` sends it; `PartyActionRequest` ([types/index.ts](../frontend/src/types/index.ts))
   is missing `amount`. All compile because TS doesn't excess-check spreads/variable
   assignments — so the types are worse than useless: they document the wrong contract.
   **Recommendation:** complete the three types now (see the field lists in the backend
   schemas); longer-term consider generating types from the Ninja OpenAPI schema
   (`/api/openapi.json`) instead of hand-mirroring. Docs: https://django-ninja.dev/guides/response/

6. **S6 — the trust model is "the player won't open devtools".** The player page consumes
   the same `HexSchema`/`POISchema`/`FactionSchema` as the GM: hex `resources`,
   `encounter_likelihood`, POI `notes`, `hidden`, and every faction's position/destination
   arrive in the player browser and are merely not rendered (and H2 shows how easily a
   render slip leaks them). For a local two-tab table app this is acceptable — but it is a
   standing constraint, not an oversight, and should be recorded in CLAUDE.md (the
   CLAUDE.md rewrite does this). No code change recommended now; if it ever matters,
   the fix is player-scoped response schemas, not frontend filtering.

### Data-model observations

- `Hex.resources` still grows without bound (morning tick adds `resource_generation ×
  modifier`; nothing drains it since faction `supply` became flavour-only). Harmless
  today; cap it if long campaigns matter.
- `Faction.next_action` accepts party-only actions (`search`/`explore`/…) via
  `PATCH /factions/{id}/` — `_select_action` handles this gracefully (records it without
  effect, [actions.py:170-171](../backend/world/actions.py)), and the UI only offers
  supply/travel/rest, so this is fine; noted so nobody "fixes" the pass-through.
- `Party.resource_generation` is stored, editable in two UIs, snapshotted nowhere, and
  read by no engine path — candidate for the next dead-code sweep, or for the supply
  mechanic it presumably anticipates. **[DECISION NEEDED]** before deleting.

---

## 2. Findings

### HIGH

---

#### H1 — `Faction.is_mobile` is stored, editable, snapshotted — and never read by the engine

- **Severity:** High (advertised flag has no effect — same class as the old review's H1)
- **Files:** [backend/world/actions.py:148-194](../backend/world/actions.py) (`_select_action` — no `is_mobile` check), [actions.py:306-313](../backend/world/actions.py) (`travel`), [models/faction.py:32](../backend/world/models/faction.py)

`is_mobile` is settable at creation (`AddFactionModal`, `FactionCreateSchema`), patchable, filtered on in admin, and snapshotted into `FactionTick` — but `grep is_mobile backend/world/actions.py` finds only the snapshot write. An "immobile" faction wanders on daytime rule 4, steps toward GM destinations, and travels on `next_action=TRAVEL` exactly like a mobile one.

**Fix [DECISION NEEDED — choose the semantics]:**
- **(a) Immobile = never moves** (likely intent): in `_select_action`, when `not faction.is_mobile`, skip rules 2's step and 4's wander (rest/supply instead), and make `_perform_travel` fall through to `rest`. A GM who wants a one-off move can still PATCH `current_hex` directly.
- **(b) Immobile = no autonomous wandering, GM overrides still work**: only rule 4's wander checks the flag; `destination`/`next_action` paths ignore it (consistent with how `movement_restricted` treats GM overrides).

**Acceptance:** engine test — a faction with `is_mobile=False` on a day tick with adjacent candidates records SUPPLY or REST, never TRAVEL (option a: also with `destination` set; option b: destination still moves it). Update the CLAUDE.md faction-ladder section to state the chosen rule.

---

#### H2 — Player hex panel shows unrevealed POIs (ignores `player_visible`)

- **Severity:** High (information leak defeating the search mechanic)
- **File:** [frontend/src/components/HexPanel/PoiList.tsx:12](../frontend/src/components/HexPanel/PoiList.tsx)

```ts
const visible = pois.filter((p) => gmMode || !p.hidden);
```

For players this filters only `hidden` — `player_visible` is never consulted. A player who clicks any visible hex sees every non-hidden POI (name, type, difficulty, description) **before** searching, making the `search` action (whose whole effect is `reveal_pois_on_search` flipping `player_visible`) pointless. The map-layer star ([HexCell.tsx:60](../frontend/src/components/HexMap/HexCell.tsx)) checks `p.player_visible` correctly — the two disagree. The expanded detail also renders the `visible`/`explored` flag chips to players ([PoiList.tsx:44-47](../frontend/src/components/HexPanel/PoiList.tsx)), which is GM bookkeeping.

**Fix:** change the filter to `gmMode ? pois : pois.filter((p) => p.player_visible && !p.hidden)` (hidden POIs stay GM-only even if some path sets them visible), and gate the flag-chips row with `gmMode`.

**Acceptance:** frontend test — render `PoiList` with `gmMode={false}` and a mix of `{player_visible: false}` / `{player_visible: true, hidden: false}` POIs; only the latter renders. GM mode renders all. (Colocate as `PoiList.test.tsx`.)

---

#### H3 — A lost party can keep moving; the next move's roll silently un-loses it

- **Severity:** High (core Cairn travel rule not enforced anywhere)
- **Files:** [backend/world/actions.py:378-408](../backend/world/actions.py) (move branch — no `is_lost` check; line 407 `party.is_lost = rolls['lost']` overwrites), [frontend/src/components/ActionList/ActionList.tsx:40-56](../frontend/src/components/ActionList/ActionList.tsx) (Move gating — no `is_lost` check)

CLAUDE.md and the `clear_lost` action (which charges terrain cost to recover) both encode the rule "a lost party must clear lost before moving again". Nothing enforces it: the backend move branch never checks `party.is_lost`, and line 407 assigns the *new* roll's result, so a lost party that moves and rolls 1–5 becomes un-lost for free — `clear_lost`'s cost is strictly optional. The frontend Move button is equally ungated.

**Fix:** in `perform_party_action`'s move branch, before anything else: `if party.is_lost: raise PartyActionError('Party is lost — clear lost before moving.')`. Mirror in the frontend gating matrix (`enabled: … && !party.is_lost`, disabledReason `'Party is lost.'`) in the shared hook once S2 lands (or in both components before then). Rest/supply/search while lost remain allowed (resting while lost is legitimate).

**Acceptance:** API test — party with `is_lost=True`, `POST action=move` returns 400 and the party has not moved; after `clear_lost`, the same move returns 200. Frontend: Move button disabled when `party.is_lost`.

---

#### H4 — `reset_to_tick` does not restore `Map.weather` or `Party.speed/supplies/is_lost`

- **Severity:** High (time-travel reset silently corrupts campaign state — recurrence of the old review's H4 for state added since)
- **Files:** [backend/world/api/tick.py:131-180](../backend/world/api/tick.py) (reset), [backend/world/models/ticks.py:59-75](../backend/world/models/ticks.py) (`PartyTick` — no speed/supplies/is_lost), [backend/world/models/world.py:50](../backend/world/models/world.py) (`Map.weather`), [backend/world/actions.py:44-54](../backend/world/actions.py) (`_shift_weather` mutates it)

Weather is no longer a static GM dial: wilderness Weather events shift `map.weather` mid-play. Nothing snapshots it (`Tick` has no weather column), so resetting to tick N keeps the *current* weather. Likewise `Party.speed`, `supplies`, and `is_lost` mutate every action/shift but `PartyTick` doesn't record them, so a reset restores the party's hex/action but not its speed, supplies, or lost state — a "rewind" that leaves the party half in the future.

**Fix (model changes → migrations):**
1. Add `weather = models.CharField(max_length=20)` to `Tick`; set it in `run_shift` when creating the tick (snapshot the *pre-shift* value is fine — pick one and document); restore `map_obj.weather = tick.weather` in `reset_to_tick`.
2. Add `speed`, `supplies`, `is_lost` to `PartyTick`; write them in `_create_party_tick`; restore them in the reset's party update.
3. Then add the S4 full-field regression test.

Note the mid-shift wrinkle: on regional maps the wilderness roll fires *after* `run_shift` inside the same action, so a same-tick weather shift postdates the snapshot — acceptable (the reset lands on the shift boundary), but state the choice in a comment.

**Acceptance:** run 4 shifts forcing a weather shift and party speed/supply changes, reset to tick 1, assert `map.weather`, `party.speed`, `party.supplies`, `party.is_lost` all equal their tick-1 values.

---

#### H5 — Factions created or edited in Django admin get `map=None` and vanish from the app

- **Severity:** High (admin path silently reintroduces the old M8 bug the `map` FK was added to kill)
- **File:** [backend/world/admin.py:111-123](../backend/world/admin.py) (`FactionAdmin.fieldsets` — no `map`)

`Faction.map` is now the source of truth for list/`run_shift`/duplication membership, but `FactionAdmin`'s explicit fieldsets omit it. A faction created in admin saves with `map=None`: it appears in no list, never ticks, and is skipped by duplication — while looking perfectly healthy in admin. (Django admin with explicit `fieldsets` simply never renders the missing field.)

**Fix:** add `'map'` to the first fieldset tuple (next to `current_hex`). Consider also `list_display` + `list_filter` on `map` for parity with `HexAdmin`.

**Acceptance:** creating a faction via admin with a map selected makes it appear in `GET /maps/{id}/factions/` and tick on the next shift. (Manual check is fine; admin is untested.)

---

### MEDIUM

---

#### M1 — GM "Actions…" modal ignores weather in move costs

- **Severity:** Medium (wrong cost shown; catastrophic weather not flagged — drift caused by the S2 duplication)
- **File:** [frontend/src/components/ActionModal/ActionModal.tsx:36](../frontend/src/components/ActionModal/ActionModal.tsx) (`computeMoveCost(originHex, selectedHex, tickNumber)` — no 4th arg, defaults `'fair'`), props lack `weather`; caller [HexPanel.tsx:230-239](../frontend/src/components/HexPanel/HexPanel.tsx)

`ActionList` (player) passes `map.weather`; `ActionModal` (GM) doesn't, so during inclement/extreme weather the GM modal shows a cost 1–2 lower than the backend charges, and during catastrophic weather Move looks affordable but the backend returns 400 (regional maps). The backend stays correct — this is display/gating drift only.

**Fix:** add `weather: WeatherType` to `ActionModal`'s props, pass `map.weather` from `HexPanel` (extend `HexPanel`'s `map` prop type with `weather`), and forward it to `computeMoveCost` plus the `blocked` handling `ActionList` already has. Subsumed by the S2 shared-hook extraction if done together — prefer doing S2 + M1 as one change.

**Acceptance:** extend `ActionModal.test.tsx`'s gating matrix with a catastrophic-weather case (Move disabled) and an extreme-weather case (cost includes +2).

---

#### M2 — City maps: frontend blocks moves the backend allows

- **Severity:** Medium (players on city maps get stuck in the UI)
- **Files:** [backend/world/actions.py:389-398](../backend/world/actions.py) (city maps skip speed gating and deduction), [frontend/src/components/ActionList/ActionList.tsx:38-56](../frontend/src/components/ActionList/ActionList.tsx) (gates on `tooSlow` unconditionally)

`perform_party_action` deliberately exempts city maps from the speed economy (`if move_map.map_type != MapType.CITY` around both the gate and the deduction). The frontend gating matrix doesn't know this: a party with speed 0 on a city map has Move disabled ("Not enough speed") even though the backend would accept it. Same for the cost text, which is meaningless on city maps.

**Fix:** pass `map.map_type` into the gating logic (via the S2 shared hook); on city maps skip the `tooSlow` check and show a flat description ('City travel — no speed cost.'). Keep the `player_visible` gate.

**Acceptance:** gating-matrix test: city map + speed 0 + visible destination → Move enabled; regional map unchanged.

---

#### M3 — `publish_gallery_image` publishes SSE inside the open transaction

- **Severity:** Medium (player overlay can refetch before commit and briefly show stale publish state)
- **File:** [backend/world/api/gallery.py:62-74](../backend/world/api/gallery.py)

The endpoint is `@transaction.atomic` and calls `publish(...)` synchronously before the transaction commits. A fast SSE consumer invalidates `['gallery', mapId]` and refetches while the row is still uncommitted, seeing the old `is_published` — the overlay then doesn't update until the next event. Every other transactional broadcaster uses `transaction.on_commit` (see `party.py:89-91`, `tick.py:32/36`); the non-atomic endpoints (`locked`/`weather`/`highlight`) are fine synchronous.

**Fix:** `transaction.on_commit(lambda: publish(img.map_id, {"type": "gallery_update"}))`. Update the test that asserts the synchronous publish (the api conftest documents which publishes are synchronous) to use `django_capture_on_commit_callbacks`.

**Acceptance:** existing gallery pinning test rewritten to capture the on-commit callback and still assert exactly one `gallery_update` broadcast.

---

#### M4 — Deleting the currently-published gallery image leaves the player overlay up

- **Severity:** Medium (GM has no recovery except publishing something else)
- **File:** [backend/world/api/gallery.py:44-59](../backend/world/api/gallery.py) (`delete_gallery_image` — no publish)

Delete broadcasts nothing. If the deleted image was `is_published`, `PlayerPage`'s cached gallery query still contains it, so the fullscreen overlay persists until some other event invalidates the query. (The image request itself may 404, rendering a broken-image overlay — worse.)

**Fix:** after `img.delete()`, `publish(map_id, {"type": "gallery_update"})` (capture `map_id = img.map_id` before deleting). Not transactional today; if you add `@transaction.atomic`, use `on_commit` per M3.

**Acceptance:** API test — deleting a published image emits one `gallery_update` on the map channel.

---

#### M5 — GM party teleport (`PATCH /party/{id}/` with `current_hex`) skips map validation and reveal semantics

- **Severity:** Medium (two quiet inconsistencies on a GM-only path)
- **File:** [backend/world/api/party.py:138-142](../backend/world/api/party.py)

Two issues:
1. **No map check:** the hex is fetched by id alone. A GM (or a stale UI) can set `current_hex` to a hex on a *different* map, desyncing `party.map` from `party.current_hex.map`; `perform_party_action` then derives `map_id` from the hex and runs shifts on a map the party record doesn't belong to.
2. **Reveal drift:** the teleport sets `player_explored=True` on the destination but not `player_visible`, and doesn't reveal adjacents — unlike a real move (`reveal_hex_on_move` sets destination visible+explored and neighbors visible). An explored-but-invisible hex renders half-fogged on grey-fog maps.

**Fix:** (1) validate `destination.map_id == party.map_id` (400 otherwise) — or, if cross-map teleport is a wanted GM tool for the city-enter flow, also update `party.map` to follow the hex **[DECISION NEEDED — pick one]**. (2) replace the bare `update(player_explored=True)` with the same `reveal_hex_on_move(destination, all_map_hexes)` call the move path uses (import from `world.actions`).

**Acceptance:** teleporting the party reveals the destination (visible+explored) and its neighbors (visible); teleporting to another map's hex either 400s or moves `party.map` with it, per the decision.

---

#### M6 — `duplicate_map` silently resets `weather` and drops `party.is_lost`

- **Severity:** Medium (duplication is advertised as a faithful copy)
- **File:** [backend/world/api/maps.py:170-183](../backend/world/api/maps.py) (`Map(...)` — no `weather`), [maps.py:295-308](../backend/world/api/maps.py) (`Party.objects.create(...)` — no `is_lost`)

The clone copies every other gameplay field (deliberately resetting only tick/lock/sub_tick state). `weather` falls back to the model default `fair` and a lost party's duplicate arrives un-lost — both invisible until they matter mid-session.

**Fix:** add `weather=source.weather` to the `Map(...)` kwargs and `is_lost=p.is_lost` to the party create. Skim the field lists once more against the models while there (this is the third "duplicate forgot a field" fix — consider a comment listing the *intentionally* reset fields so additions default to "copy").

**Acceptance:** duplicate test asserting `new_map.weather == source.weather` and `new_party.is_lost == source_party.is_lost`.

---

#### M7 — `create_map` 500s on a missing `image_path`; `reveal_mode` and `weather` accept arbitrary strings

- **Severity:** Medium (unhandled 500 on user input; invalid enum values persist)
- **Files:** [backend/world/api/maps.py:123-129](../backend/world/api/maps.py) (`PILImage.open(abs_path)` — `FileNotFoundError` → 500), [maps.py:111](../backend/world/api/maps.py) (`reveal_mode: Form[str]` unvalidated), [maps.py:78-88](../backend/world/api/maps.py) (`set_map_weather` — unvalidated; an unknown value silently behaves as `fair` in `move_difficulty` but crashes `_shift_weather`'s `WEATHER_ORDER.index`)

The `weather` one is the sharpest edge: `PATCH /maps/{id}/weather/` with a typo'd value stores it; the next wilderness Weather event then raises `ValueError` inside `_shift_weather` → 500 → the whole party action rolls back, at the table.

**Fix:** (1) wrap the `image_path` open in `try/except (FileNotFoundError, OSError)` → 400 `'image_path not found'`. (2) validate `reveal_mode in RevealMode.values` → 400. (3) validate `body.weather in WeatherType.values` → 400 (or type the schema field as a `Literal`/enum so Ninja 422s it).

**Acceptance:** API tests — bad `image_path` → 400; `weather: "sunny"` → 400/422; existing happy paths unchanged.

---

### LOW

---

#### L1 — CLAUDE.md drift (mechanics changed since it was written)

- **Severity:** Low, but it is exactly the failure mode CLAUDE.md exists to prevent
- **File:** `CLAUDE.md`

Stale claims found while reviewing: the wilderness table is now a **d5** (Encounter/Sign/Weather/Loss/Quiet) with a d8 weather-shift sub-roll — not the documented d6 with Environment/Exhaustion; supply and rest (not just move) roll wilderness events on regional maps; every party action **auto-locks** `player_actions_locked` (the GM header has a three-state lock with "permanent unlock"); the player action UI is the inline `ActionList` (the modal is GM-only via "Actions…"); `tracks_supplies`, `reveal_mode`/`detail_image` two-layer fog, `can_enter`/`linked_map` "Enter the city", the TickControls weather stepper, and Random Hex are undocumented; frontend test count is 116 (doc says 117); the "remaining pins: H5/H6/H7/M3/M8" line refers to pins that were all rewritten. **Fix:** superseded by the CLAUDE.md rewrite delivered alongside this review (`CLAUDE.new.md`) — adopt it or fold these corrections into the existing file.

---

#### L2 — Stale docstring in `tests/api/conftest.py` references resolved findings

- **Severity:** Low
- **File:** [backend/world/tests/api/conftest.py:6-7](../backend/world/tests/api/conftest.py)

The harness docstring still explains the `CHARACTERIZATION — pins H4/H5/H6/M3/M7/M8` convention with the old review's IDs; no live pins remain. **Fix:** reword to describe the convention generically ("when a test pins known-buggy behavior documented in design_docs/code-review.md, mark it `CHARACTERIZATION — pins <id>` …") without dead IDs.

---

#### L3 — Debug `console.log` leftovers

- **Severity:** Low
- **Files:** [frontend/src/pages/GMPage/GMPage.tsx:114](../frontend/src/pages/GMPage/GMPage.tsx), [frontend/src/components/HexMap/HexMap.tsx:415](../frontend/src/components/HexMap/HexMap.tsx) (fires on every render, inside the party-crown IIFE)

**Fix:** delete both lines.

---

#### L4 — Faction `population` default drift: model 50 vs schema/UI 10

- **Severity:** Low (recurrence of old L2 — three sources of truth again disagree)
- **Files:** [backend/world/models/faction.py:37](../backend/world/models/faction.py) (`default=50`), [backend/world/api/factions.py:59](../backend/world/api/factions.py) (`population: int = 10`), [frontend/src/components/AddFactionModal/AddFactionModal.tsx:24-32](../frontend/src/components/AddFactionModal/AddFactionModal.tsx) (`DEFAULT_DRAFT.population: 10`)

`population` is flavour-only now, so this is harmless — but pick one number. **Fix:** since API and UI agree on 10, change the model default to 10 (migration, no data change) — or 50 everywhere if that's the intended flavour.

---

#### L5 — `_perform_travel` (next_action=TRAVEL path) does not clear `destination` on arrival

- **Severity:** Low (one wasted tick)
- **File:** [backend/world/actions.py:128-145](../backend/world/actions.py) vs the rule-2 path [actions.py:174-182](../backend/world/actions.py)

Rule 2 clears `destination` when `current_hex == destination`; the `next_action=TRAVEL` path checks the same condition but leaves `destination` set, so the tick after arrival re-enters rule 2 just to clear it (recording a spurious no-op). **Fix:** in `_perform_travel`, when `faction.destination and faction.current_hex == faction.destination`, clear it (matching rule 2) before falling through to wander.

---

#### L6 — Supply `amount` is accepted by the API but no UI sends it

- **Severity:** Low **[DECISION NEEDED]**
- **Files:** [backend/world/actions.py:433-435](../backend/world/actions.py), [backend/world/api/party.py:51](../backend/world/api/party.py) (schema), [frontend/src/components/ActionList/ActionList.tsx:106-110](../frontend/src/components/ActionList/ActionList.tsx) (sends bare `{ action }`), [frontend/src/types/index.ts](../frontend/src/types/index.ts) (`PartyActionRequest` omits `amount`)

The supply action's `amount` top-up is reachable only via curl. Either (a) add an amount input to the Supply action in the shared hook/UI and add `amount?: number` to `PartyActionRequest`, or (b) delete the parameter (players adjust supplies via the GM party edit anyway). The GM `PartyFooter` supplies edit covers the need today.

---

#### L7 — GMPage calls a store setter during render

- **Severity:** Low
- **File:** [frontend/src/pages/GMPage/GMPage.tsx:66](../frontend/src/pages/GMPage/GMPage.tsx)

`if (useGameStore.getState().selectedMapId !== id) setSelectedMapId(id);` runs in the component body — a render side effect (double-fires under StrictMode, and `setSelectedMapId` also clears `selectedHexId`). **Fix:** move into `useEffect(..., [id])`. PlayerPage doesn't set it at all — decide whether it should (deep-linking a player view leaves `selectedMapId` stale for anything reading it).

---

#### L8 — `TickAdmin` lists ticks from all maps with no map column or filter

- **Severity:** Low
- **File:** [backend/world/admin.py:179-182](../backend/world/admin.py)

Tick numbers repeat per map (`unique_together ('map','number')`), so the changelist is ambiguous with two maps. **Fix:** `list_display = ('map', 'number', 'created_at')`, `list_filter = ('map',)`.

---

#### L9 — PartyAdmin fieldsets omit `player_count`, `supplies`, `tracks_supplies`, `is_lost`

- **Severity:** Low
- **File:** [backend/world/admin.py:253-266](../backend/world/admin.py)

Fields added since the fieldsets were written aren't editable in admin (same mechanism as H5, lower stakes since the GM UI covers them). **Fix:** add them to the Stats fieldset (or drop the explicit fieldsets and let admin render all fields — the custom row/col form still works either way).

---

## 3. Suggested implementation order

1. **H2, H3, L3** — small, sharp player-facing fixes (H2/L3 frontend-only; H3 backend + frontend gate).
2. **H5, L8, L9** — admin fieldset batch (one commit).
3. **H1** — after the user picks semantics (a) or (b).
4. **H4** — the migration-bearing snapshot fix (Tick.weather + PartyTick fields), then the S4 full-field regression test.
5. **S2 + M1 + M2** — one refactor: extract the shared party-actions hook, fixing the weather and city-gating drift inside it.
6. **M3, M4** — gallery SSE pair.
7. **M5, M6, M7** — backend robustness batch (M5 needs the teleport decision).
8. **S1** — `perform_party_action` decomposition (pure refactor over the pinned API tests).
9. **S3** — events-pipeline decision, then delete or feed it.
10. **S5, L4, L6** — type completion + defaults + amount decision.
11. **L1, L2, L5, L7** — cleanup sweep.

Migration-touching items (generate via WSL, apply via Docker, per CLAUDE.md): H4 (Tick.weather, PartyTick fields), L4 (model default).
Decision-needed items: H1 (immobile semantics), M5 (cross-map teleport), S3 (events pipeline), L6 (supply amount), and the S6 trust-model acknowledgement.
