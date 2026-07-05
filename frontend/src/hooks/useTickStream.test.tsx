import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTickStream } from './useTickStream';
import { useGameStore } from '../store/useGameStore';

// Minimal fake EventSource: records instances so tests can push messages and
// assert close() on unmount. Installed on globalThis for the hook to pick up.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((e: { data: string }) => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  close() {
    this.closed = true;
  }
}

const storeInitial = useGameStore.getState();

let qc: QueryClient;
let invalidateSpy: ReturnType<typeof vi.spyOn>;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  FakeEventSource.instances = [];
  (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource = FakeEventSource;
  useGameStore.setState(storeInitial, true);
  qc = new QueryClient();
  invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function invalidatedKeys(): string[] {
  return invalidateSpy.mock.calls.map((c: unknown[]) => (c[0] as { queryKey: unknown[] }).queryKey[0] as string);
}

describe('useTickStream', () => {
  it('opens an EventSource against the map stream url and closes it on unmount', () => {
    const { unmount } = renderHook(() => useTickStream(3), { wrapper });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toContain('/api/maps/3/tick/stream/');
    unmount();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it('routes gallery_update to only a gallery invalidation', () => {
    renderHook(() => useTickStream(1), { wrapper });
    FakeEventSource.instances[0].emit({ type: 'gallery_update' });
    expect(invalidatedKeys()).toEqual(['gallery']);
  });

  it('routes hex_highlight to the store, no query invalidation', () => {
    renderHook(() => useTickStream(1), { wrapper });
    FakeEventSource.instances[0].emit({ type: 'hex_highlight', hex_id: 12 });
    expect(useGameStore.getState().highlightedHexId).toBe(12);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('records a move_result into the store and bumps the sequence', () => {
    renderHook(() => useTickStream(1), { wrapper });
    const seqBefore = useGameStore.getState().moveResultSeq;
    FakeEventSource.instances[0].emit({
      type: 'move_result', action: 'move', lost: true, lost_roll: 6,
      wilderness_event: 'Encounter', event_roll: 1,
    });
    const mr = useGameStore.getState().moveResult;
    expect(mr).toMatchObject({ action: 'move', lost: true, wilderness_event: 'Encounter' });
    expect(useGameStore.getState().moveResultSeq).toBe(seqBefore + 1);
  });

  it('patches lost via navigation_update only when a prior moveResult exists', () => {
    renderHook(() => useTickStream(1), { wrapper });
    // No prior moveResult → navigation_update is ignored.
    FakeEventSource.instances[0].emit({ type: 'navigation_update', lost: true });
    expect(useGameStore.getState().moveResult).toBeNull();
    // Seed a moveResult, then a navigation_update patches only `lost`.
    FakeEventSource.instances[0].emit({
      type: 'move_result', action: 'move', lost: false, lost_roll: 2,
      wilderness_event: 'Quiet', event_roll: 4,
    });
    FakeEventSource.instances[0].emit({ type: 'navigation_update', lost: true });
    const mr = useGameStore.getState().moveResult;
    expect(mr?.lost).toBe(true);
    expect(mr?.wilderness_event).toBe('Quiet'); // other fields preserved
  });

  it('falls back to a full map/hexes/factions/tick/party invalidation for a plain tick event', () => {
    renderHook(() => useTickStream(9), { wrapper });
    FakeEventSource.instances[0].emit({}); // untyped tick event
    expect(invalidatedKeys()).toEqual(['map', 'hexes', 'factions', 'currentTick', 'party']);
  });
});
