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
}

export const useGameStore = create<GameStore>((set) => ({
  selectedMapId: null,
  setSelectedMapId: (id) => set({ selectedMapId: id, selectedHexId: null }),

  selectedHexId: null,
  setSelectedHexId: (id) => set({ selectedHexId: id }),

  pendingEvents: [],
  setPendingEvents: (events) => set({ pendingEvents: events }),
  clearPendingEvents: () => set({ pendingEvents: [] }),
}));
