# HexTick Code Review

Conducted 2026-06-10. All findings verified against source.

---

## CRITICAL

### 1. Race condition on city-map `sub_tick` — [api.py:905](../backend/world/api.py#L905)

The `party_action` endpoint is `@transaction.atomic` but `Map.objects.get()` at line 905 acquires no row lock. Under PostgreSQL READ COMMITTED, two concurrent city-map party actions can both read the same `sub_tick` before either commits, corrupting the shift counter.

```python
# Current — no lock
map_obj = Map.objects.get(id=map_id) if map_id else None

# Fix
map_obj = Map.objects.select_for_update().get(id=map_id) if map_id else None
```

---

## HIGH

### 2. Dead `elif is_city:` branch — [api.py:915](../backend/world/api.py#L915)

The branch is unreachable — the preceding `if is_city:` captures all True cases. Current behavior (all city actions advance `sub_tick`) is intentional. The dead block should simply be deleted.

```python
# Delete this entire block:
elif is_city:
    # Movement on city maps costs speed but not a sub_tick — no shift fires
    is_shift = False
    party_sub_tick = map_obj.sub_tick
```

### 3. Missing fields in tick-reset restore — [api.py:755](../backend/world/api.py#L755)

`FactionTick` snapshots `scouting`, `theology`, `famine_streak`, and `is_mobile` ([ticks.py:42–52](../backend/world/models/ticks.py#L42)), but the reset endpoint's `.update()` call omits all four. Time-travelling backward leaves live factions with wrong scouting range, theology, famine state, and mobility.

```python
# Add to the Faction.objects.filter(...).update() call:
scouting=ft.scouting,
theology=ft.theology,
famine_streak=ft.famine_streak,
is_mobile=ft.is_mobile,
```

---

## MEDIUM

### 4. Path traversal in map creation — [api.py:119](../backend/world/api.py#L119)

`image_path` is a user-supplied form field joined directly to `MEDIA_ROOT` with no containment check. A `../` sequence escapes the media directory.

```python
# Current
abs_path = os.path.join(settings.MEDIA_ROOT, image_path)

# Fix — validate path is still inside MEDIA_ROOT
abs_path = os.path.realpath(os.path.join(settings.MEDIA_ROOT, image_path))
media_root = os.path.realpath(settings.MEDIA_ROOT) + os.sep
if not abs_path.startswith(media_root):
    return api.create_response(request, {'detail': 'Invalid image_path.'}, status=400)
```

### 5. Cross-map knowledge linking — [api.py:471](../backend/world/api.py#L471), [api.py:484](../backend/world/api.py#L484)

`related_knowledge.set()` has no `map=obj.map` constraint, so a knowledge record from a different map can be linked in.

```python
# Current
obj.related_knowledge.set(Knowledge.objects.filter(id__in=body.related_knowledge))

# Fix
obj.related_knowledge.set(Knowledge.objects.filter(id__in=body.related_knowledge, map=obj.map))
```

### 6. Inconsistent scouting filter — [api.py:534](../backend/world/api.py#L534) vs [actions.py:58](../backend/world/actions.py#L58)

`_run_shift` pre-filters nearby factions using `modifier(faction.scouting)` (correct). The secondary filter inside `_select_action` uses raw `faction.scouting`, which is 10× larger, making it a no-op. The effective scouting range is determined entirely by the pre-filter. The secondary filter is misleading dead code and would silently diverge if the pre-filter were ever changed.

```python
# actions.py line 58 — change:
if f.current_hex and hex_distance(hex, f.current_hex) <= faction.scouting
# to:
if f.current_hex and hex_distance(hex, f.current_hex) <= modifier(faction.scouting)
```

---

## Not a bug

**`client.ts:24` — `postForm` passes `headers: {}`**: This is intentional. The default `request()` header is `Content-Type: application/json`; passing `headers: {}` in options overrides it via spread, so the browser sets the correct `multipart/form-data; boundary=...` header automatically for FormData requests.
