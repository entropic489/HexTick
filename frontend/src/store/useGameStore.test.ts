import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './useGameStore';
import type { MoveResult } from './useGameStore';

// Snapshot the initial state once so each test starts from a clean store.
const initialState = useGameStore.getState();
beforeEach(() => {
  useGameStore.setState(initialState, true);
});

const get = useGameStore.getState;

function makeMoveResult(overrides: Partial<MoveResult> = {}): MoveResult {
  return {
    action: 'move',
    lost: false,
    lost_roll: 3,
    wilderness_event: 'Quiet',
    event_roll: 6,
    ...overrides,
  };
}

describe('useGameStore', () => {
  it('setSelectedMapId also clears the selected hex', () => {
    get().setSelectedHexId(42);
    get().setSelectedMapId(7);
    expect(get().selectedMapId).toBe(7);
    expect(get().selectedHexId).toBeNull();
  });

  it('setPrepMode(false) resets multi-select mode and selected hexes', () => {
    get().setMultiSelectMode(true);
    get().toggleSelectedHex(1);
    get().setPrepMode(false);
    expect(get().prepMode).toBe(false);
    expect(get().multiSelectMode).toBe(false);
    expect(get().selectedHexIds.size).toBe(0);
  });

  it('toggleSelectedHex adds then removes an id', () => {
    get().toggleSelectedHex(5);
    expect(get().selectedHexIds.has(5)).toBe(true);
    get().toggleSelectedHex(5);
    expect(get().selectedHexIds.has(5)).toBe(false);
  });

  it('setFactionHexSelectMode copies the provided initial ids into a new set', () => {
    const seed = new Set([1, 2, 3]);
    get().setFactionHexSelectMode(true, seed);
    expect(get().factionHexSelectMode).toBe(true);
    expect(get().factionAllowedHexIds).toEqual(new Set([1, 2, 3]));
    // Mutating the caller's set must not leak into the store.
    seed.add(99);
    expect(get().factionAllowedHexIds.has(99)).toBe(false);
  });

  it('clearFactionHexSelect turns the mode off and empties the set', () => {
    get().setFactionHexSelectMode(true, new Set([1]));
    get().clearFactionHexSelect();
    expect(get().factionHexSelectMode).toBe(false);
    expect(get().factionAllowedHexIds.size).toBe(0);
  });

  it('setMoveResult updates moveResult without bumping moveResultSeq', () => {
    const before = get().moveResultSeq;
    get().setMoveResult(makeMoveResult({ action: 'navigation_update' }));
    expect(get().moveResult?.action).toBe('navigation_update');
    expect(get().moveResultSeq).toBe(before);
  });

  it('recordMoveResult updates moveResult and increments moveResultSeq', () => {
    const before = get().moveResultSeq;
    get().recordMoveResult(makeMoveResult());
    expect(get().moveResult?.action).toBe('move');
    expect(get().moveResultSeq).toBe(before + 1);
  });
});
