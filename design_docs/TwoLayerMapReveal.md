# Two-Layer Map Reveal (NPC map + true map)

## Status

**Plan only — not yet implemented.** No code has been written. A trial edit to `Map` was made and reverted; no migration was ever created. This document is the agreed design for a future implementation session.

## Context

The GM wants each map to optionally use **two raster layers**:

- **Layer 1 — the vague "NPC-drawn" map.** Always fully visible. This is the existing `Map.image`.
- **Layer 2 — the true "what's actually here" map.** A second image, revealed **per hex** as the party explores. Detailed art appears only in hexes the party has entered.

This is an **alternative to**, not a replacement for, the existing grey fog-of-war. Both reveal styles must remain available.

Decisions locked with the user:
- **Both modes retained, selectable at map-creation time.** A map is created as either:
  - **Grey fog** (current behaviour) — unexplored hexes are covered by the solid grey `#555` overlay. No detail image needed.
  - **Two-layer** — unexplored hexes show the vague NPC map (`Map.image`); explored hexes reveal the detailed art (`Map.detail_image`) through a per-hex clip. No grey overlay in this mode.
- **Reveal trigger (two-layer mode):** `Hex.player_explored`. Detail shows only in explored hexes (GM can still hand-set the flag via existing hex edit / bulk / prep tools).
- **Upload UI:** the CreateMap page gains an optional detail-image picker (only relevant when two-layer mode is chosen) **and** the Django admin exposes the field, so the detail image can be set at creation or added/swapped later.

Feasible with no engine/tick changes. Reuses the existing background-`<image>` render, the existing `player_explored` flag, and the centralized hex geometry (`hexToPixel` + `flatTopPoints`). Core technique: render Layer 2 as a second SVG `<image>` clipped to a `<clipPath>` composed of the explored hexes' polygons, shown only when the map's reveal mode is two-layer.

## Approach

### 1. Backend model — mode field + second image (migration; USER runs it)

[backend/world/models/world.py](../backend/world/models/world.py) — add a `RevealMode` choices class (alongside `MapType`) and two fields to `Map`:
```python
class RevealMode(models.TextChoices):
    GREY_FOG  = 'grey_fog',  'Grey fog'
    TWO_LAYER = 'two_layer', 'Two-layer (NPC + detailed map)'

class Map(models.Model):
    ...
    reveal_mode = models.CharField(max_length=20, choices=RevealMode.choices, default=RevealMode.GREY_FOG)
    # Optional detailed "what's actually here" map, revealed per explored hex in two-layer mode.
    detail_image = models.ImageField(upload_to='maps/', null=True, blank=True)
```
`fog_of_war` (existing) still governs whether *any* fog/reveal applies at all (GMPage passes `fogOfWar={false}` to see everything). `reveal_mode` selects *which style* of reveal the player view uses when fog is on.

Per the **Hard rules**, make the model change only, then instruct the user to run:
`cd backend && pdm run python manage.py makemigrations && pdm run python manage.py migrate`

### 2. Backend schema + create endpoint

[backend/world/api.py](../backend/world/api.py):
- `MapSchema` (line 51): add `reveal_mode: str` and `detail_image: Optional[str] = None`. **Quirk** (see CLAUDE.md Testing note): Ninja's `FieldFile` encoder returns `None` for an empty `ImageField`; `image: str` only survives because maps always have one. `detail_image` is optional, so it **must** be typed `Optional[str]` or serialization 500s on maps without one.
- `create_map` (line 112): add `reveal_mode: Form[str] = 'grey_fog'`, `detail_image: File[Optional[UploadedFile]] = None`, and `detail_image_path: Form[Optional[str]] = None` params (the image pair mirrors the existing `image` / `image_path` dual pattern at lines 119-136). Assign `m.reveal_mode` and `m.detail_image` before `m.save()`. Both optional — a grey-fog map supplies neither detail field.
- Note for later: `duplicate_map` (H5 in `code-review.md` already flags shared-file data loss) will now copy a second image field. Out of scope here, but the eventual H5 fix must clone `detail_image` too. Flag, don't fix.

### 3. Frontend types + api wrapper

- [frontend/src/types/index.ts](../frontend/src/types/index.ts): add `reveal_mode: 'grey_fog' | 'two_layer'` and `detail_image?: string | null` to the `Map` interface.
- [frontend/src/api/maps.ts](../frontend/src/api/maps.ts): extend `CreateMapParams` with `reveal_mode?: string`, `detail_image?: File`, `detail_image_path?: string`; append them to the `FormData` in `createMap` (mirror lines 143-144).

### 4. Frontend render — the two-layer reveal (core change)

[frontend/src/components/HexMap/HexMap.tsx](../frontend/src/components/HexMap/HexMap.tsx), in the `<svg>` body just **after** the base `<image>` (lines 243-252) and **before** the hex cells. Guard on the map's reveal mode so grey-fog maps are unaffected:

```tsx
{map.reveal_mode === 'two_layer' && map.detail_image && fogOfWar && (
  <>
    <defs>
      <clipPath id="explored-clip">
        {hexes.filter((h) => h.player_explored).map((h) => {
          const [cx, cy] = hexToPixel(h.row, h.col, map.hex_size, map.origin_x, map.origin_y);
          return <polygon key={h.id} points={flatTopPoints(cx, cy, map.hex_size)} />;
        })}
      </clipPath>
    </defs>
    <image
      href={map.detail_image}
      x={0} y={0}
      width={imgSize?.w ?? svgWidth}
      height={imgSize?.h ?? svgHeight}
      preserveAspectRatio="none"
      clipPath="url(#explored-clip)"
    />
  </>
)}
```
- Import `flatTopPoints` alongside the existing `hexToPixel` import (line 4).
- `fogOfWar` gate: on the **GM page** (`fogOfWar={false}`) the detail layer is not clipped away — GM sees the true map fully. On the **player page** it's revealed per explored hex. Confirm this GM behaviour during implementation; drop the `fogOfWar` gate if the GM should also see only explored detail.
- The detail image is assumed to share the base image's dimensions (same coordinate space) — a hard requirement to state in CreateMap help text.

### 5. Frontend render — make grey fog conditional on mode (do NOT delete it)

[frontend/src/components/HexMap/HexCell.tsx](../frontend/src/components/HexMap/HexCell.tsx):
- The grey `#555` fog polygon (lines 40-42) and the `fogged` computation (line 24) **stay**, but only render in grey-fog mode. Pass the map's `reveal_mode` down to `HexCell` (new prop) and gate the grey polygon on `reveal_mode === 'grey_fog'`.
- `hidden` (line 22, `!player_visible`) and the `unexplored` opacity dim (line 48): keep for grey-fog mode as-is. For two-layer mode, decide during implementation whether the `unexplored` dim stays as a subtle "not yet detailed" cue over the NPC map or is dropped; `hidden` still governs POI-star/faction-label/click gating in both modes.

### 6. CreateMap upload UI — mode selector + conditional picker

[frontend/src/pages/CreateMap/CreateMap.tsx](../frontend/src/pages/CreateMap/CreateMap.tsx): add a reveal-mode selector (radio or select: "Grey fog" / "Two-layer map"). When **two-layer** is selected, reveal a second, optional file input for the detail image (reuse the existing image-input pattern) with help text: "Detail map must match the base map's dimensions." Pass `reveal_mode` and `detail_image` into `createMap`. Admin exposure of both new fields is automatic once they exist (register nothing new unless `MapAdmin` uses an explicit `fields`/`fieldsets` list — check [backend/world/admin.py](../backend/world/admin.py) and add them there if so).

## Files touched (future implementation)

- `backend/world/models/world.py` (`RevealMode` choices + `reveal_mode`/`detail_image` fields — migration)
- `backend/world/api.py` (`MapSchema`, `create_map`)
- `backend/world/admin.py` (only if `MapAdmin` lists fields explicitly)
- `frontend/src/types/index.ts`, `frontend/src/api/maps.ts`
- `frontend/src/components/HexMap/HexMap.tsx` (mode-gated clip + detail `<image>`)
- `frontend/src/components/HexMap/HexCell.tsx` (grey fog gated on mode, not removed)
- `frontend/src/pages/CreateMap/CreateMap.tsx` (mode selector + conditional picker)

## Verification (future implementation)

Per CLAUDE.md, tests/tools run in WSL/containers (no host `pdm`/`node`):

1. **Migration**: user runs `makemigrations`/`migrate` (do not auto-run).
2. **Backend**: `wsl -d Ubuntu-22.04 -- bash -lc "cd /mnt/c/Users/jfink/OneDrive/Documents/Projects/HexTick && pdm run test"` — the api pinning suite (`tests/api/test_maps.py`) covers `MapSchema` serialization and `create_map`; update it for the new `reveal_mode`/`detail_image` fields (and the api conftest `map_factory` override if the pin asserts full schema shape).
3. **Frontend typecheck/tests**: `docker exec hextick-frontend-1 npx tsc --noEmit` and `docker exec hextick-frontend-1 npx vitest run`.
4. **End-to-end**: `docker-compose up`. (a) Create a **grey-fog** map — confirm the current fog behaviour is unchanged. (b) Create a **two-layer** map with base + detail images — confirm unexplored area shows the NPC map with no grey, marking a hex `player_explored` reveals the detailed art exactly within that hex's outline, and the detail art aligns with the base.

## Out of scope / follow-ups

- `duplicate_map` (code-review H5) will need to clone `detail_image` when that fix lands — noted, not fixed here.
- Optional future polish: soft-edged reveal (feathered clip); animated reveal on newly-explored hexes; allowing a map to switch reveal mode after creation (the field supports it — just needs an edit UI).
