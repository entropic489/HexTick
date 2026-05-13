import { create } from 'zustand';
import type { TickEvent } from '../types';

interface GameStore {
  selectedMapId: number | null;
  setSelectedMapId: (id: number | null) => void;

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
}

export const useGameStore = create<GameStore>((set) => ({
  selectedMapId: null,
  setSelectedMapId: (id) => set({ selectedMapId: id, selectedHexId: null }),

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
}));
