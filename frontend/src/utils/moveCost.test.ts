import { describe, it, expect } from 'vitest';
import { computeMoveCost } from './moveCost';
import type { Hex } from '../types';

// Minimal valid Hex factory: sane defaults, override only what a test cares about.
function makeHex(overrides: Partial<Hex> = {}): Hex {
  return {
    id: 1,
    map_id: 1,
    row: 0,
    col: 0,
    terrain_type: 'plains',
    terrain_difficulty: 2,
    resource_generation: 0,
    resources: 0,
    encounter_likelihood: 0,
    player_explored: false,
    player_visible: false,
    has_roads: false,
    has_rivers: false,
    can_enter: true,
    linked_map: null,
    pois: [],
    ...overrides,
  };
}

// Tick-of-day cycle: n % 3 === 0 morning, 1 afternoon, 2 night.
const MORNING = 0;
const NIGHT = 2;

describe('computeMoveCost', () => {
  it('uses destination terrain_difficulty as base off-road in fair daytime', () => {
    const result = computeMoveCost(makeHex(), makeHex({ terrain_difficulty: 3 }), MORNING);
    expect(result).toEqual({ total: 3, base: 3, modifiers: [], blocked: false });
  });

  it('uses base 1 when both origin and destination have roads', () => {
    const origin = makeHex({ has_roads: true });
    const dest = makeHex({ terrain_difficulty: 4, has_roads: true });
    const result = computeMoveCost(origin, dest, MORNING);
    expect(result.base).toBe(1);
    expect(result.total).toBe(1);
  });

  it('does not apply the road base when only the destination has roads', () => {
    const origin = makeHex({ has_roads: false });
    const dest = makeHex({ terrain_difficulty: 4, has_roads: true });
    expect(computeMoveCost(origin, dest, MORNING).base).toBe(4);
  });

  it('does not apply the road base when origin is null (e.g. no current hex)', () => {
    const dest = makeHex({ terrain_difficulty: 4, has_roads: true });
    expect(computeMoveCost(null, dest, MORNING).base).toBe(4);
  });

  it('adds a +1 Night modifier at night (tick % 3 === 2)', () => {
    const result = computeMoveCost(makeHex(), makeHex({ terrain_difficulty: 2 }), NIGHT);
    expect(result.modifiers).toContainEqual({ label: 'Night', value: 1 });
    expect(result.total).toBe(3);
  });

  it('adds +1 for inclement weather, capitalised', () => {
    const result = computeMoveCost(makeHex(), makeHex({ terrain_difficulty: 2 }), MORNING, 'inclement');
    expect(result.modifiers).toContainEqual({ label: 'Inclement', value: 1 });
    expect(result.total).toBe(3);
  });

  it('adds +2 for extreme weather', () => {
    const result = computeMoveCost(makeHex(), makeHex({ terrain_difficulty: 2 }), MORNING, 'extreme');
    expect(result.modifiers).toContainEqual({ label: 'Extreme', value: 2 });
    expect(result.total).toBe(4);
  });

  it('adds no weather modifier for fair or overcast', () => {
    expect(computeMoveCost(makeHex(), makeHex({ terrain_difficulty: 2 }), MORNING, 'fair').modifiers).toEqual([]);
    expect(computeMoveCost(makeHex(), makeHex({ terrain_difficulty: 2 }), MORNING, 'overcast').modifiers).toEqual([]);
  });

  it('stacks night and weather modifiers on top of the base', () => {
    const result = computeMoveCost(makeHex(), makeHex({ terrain_difficulty: 2 }), NIGHT, 'extreme');
    expect(result.base).toBe(2);
    expect(result.total).toBe(5); // 2 + 1 (night) + 2 (extreme)
    expect(result.modifiers).toEqual([
      { label: 'Night', value: 1 },
      { label: 'Extreme', value: 2 },
    ]);
  });

  it('treats catastrophic weather as blocked (total 999) regardless of other factors', () => {
    const result = computeMoveCost(makeHex({ has_roads: true }), makeHex({ has_roads: true }), NIGHT, 'catastrophic');
    expect(result).toEqual({ total: 999, base: 0, modifiers: [], blocked: true });
  });
});
