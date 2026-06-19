import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGameStore } from '../store/useGameStore';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';

export function useTickStream(mapId: number) {
  const qc = useQueryClient();
  const setHighlightedHexId = useGameStore((s) => s.setHighlightedHexId);

  useEffect(() => {
    const url = BASE_URL.replace(/\/api$/, '') + `/api/maps/${mapId}/tick/stream/`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      let parsed: { type?: string; hex_id?: number | null } | undefined;
      try { parsed = JSON.parse(e.data); } catch { /* tick events have no type */ }
      const type = parsed?.type;

      if (type === 'gallery_update') {
        qc.invalidateQueries({ queryKey: ['gallery', mapId] });
        return;
      }

      if (type === 'hex_highlight') {
        setHighlightedHexId(parsed?.hex_id ?? null);
        return;
      }

      qc.invalidateQueries({ queryKey: ['map', mapId] });
      qc.invalidateQueries({ queryKey: ['hexes', mapId] });
      qc.invalidateQueries({ queryKey: ['factions', mapId] });
      qc.invalidateQueries({ queryKey: ['currentTick', mapId] });
      qc.invalidateQueries({ queryKey: ['party', mapId] });
    };

    return () => es.close();
  }, [mapId, qc, setHighlightedHexId]);
}
