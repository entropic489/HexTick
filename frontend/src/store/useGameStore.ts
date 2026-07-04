import { create } from 'zustand';
import type { TickEvent } from '../types';

export interface MoveResult {
  action: string;
  lost: boolean | null;
  lost_roll: number | null;
  wilderness_event: string;
  event_roll: number;
}

interface GameStore {
  selectedMapId: number | null;
  setSelectedMapId: (id: number | null) => void;

  viewingTickNumber: number | null;
  setViewingTickNumber: (n: number | null) => void;

  selectedHexId: number | null;
  setSelectedHexId: (id: number | null) => void;

  pendingEvents: TickEvent[];
  setPendingEvents: (events: TickEvent[]) => void;
  clearPendingEvents: () => void;

  prepMode: boolean;
  setPrepMode: (v: boolean) => void;

  multiSelectMode: boolean;
  setMultiSelectMode: (v: boolean) => void;

  selectedHexIds: Set<number>;
  toggleSelectedHex: (id: number) => void;
  clearSelectedHexes: () => void;

  factionHexSelectMode: boolean;
  factionAllowedHexIds: Set<number>;
  setFactionHexSelectMode: (active: boolean, initialIds?: Set<number>) => void;
  toggleFactionAllowedHex: (id: number) => void;
  clearFactionHexSelect: () => void;

  highlightedHexId: number | null;
  setHighlightedHexId: (id: number | null) => void;

  moveResult: MoveResult | null;
  setMoveResult: (result: MoveResult) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  selectedMapId: null,
  setSelectedMapId: (id) => set({ selectedMapId: id, selectedHexId: null }),

  viewingTickNumber: null,
  setViewingTickNumber: (n) => set({ viewingTickNumber: n }),

  selectedHexId: null,
  setSelectedHexId: (id) => set({ selectedHexId: id }),

  pendingEvents: [],
  setPendingEvents: (events) => set({ pendingEvents: events }),
  clearPendingEvents: () => set({ pendingEvents: [] }),

  prepMode: false,
  setPrepMode: (v) => set({ prepMode: v, multiSelectMode: false, selectedHexIds: new Set() }),

  multiSelectMode: false,
  setMultiSelectMode: (v) => set({ multiSelectMode: v, selectedHexIds: new Set() }),

  selectedHexIds: new Set(),
  toggleSelectedHex: (id) =>
    set((s) => {
      const next = new Set(s.selectedHexIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { selectedHexIds: next };
    }),
  clearSelectedHexes: () => set({ selectedHexIds: new Set() }),

  factionHexSelectMode: false,
  factionAllowedHexIds: new Set(),
  setFactionHexSelectMode: (active, initialIds) => set({
    factionHexSelectMode: active,
    factionAllowedHexIds: initialIds ? new Set(initialIds) : new Set(),
  }),
  toggleFactionAllowedHex: (id) =>
    set((s) => {
      const next = new Set(s.factionAllowedHexIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { factionAllowedHexIds: next };
    }),
  clearFactionHexSelect: () => set({ factionHexSelectMode: false, factionAllowedHexIds: new Set() }),

  highlightedHexId: null,
  setHighlightedHexId: (id) => set({ highlightedHexId: id }),

  moveResult: null,
  setMoveResult: (result) => set({ moveResult: result }),
}));
