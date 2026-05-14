import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';

export function useTickStream(mapId: number) {
  const qc = useQueryClient();

  useEffect(() => {
    const url = BASE_URL.replace(/\/api$/, '') + `/api/maps/${mapId}/tick/stream/`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      let type: string | undefined;
      try { type = JSON.parse(e.data)?.type; } catch { /* tick events have no type */ }

      if (type === 'gallery_update') {
        qc.invalidateQueries({ queryKey: ['gallery', mapId] });
        return;
      }

      qc.invalidateQueries({ queryKey: ['map', mapId] });
      qc.invalidateQueries({ queryKey: ['hexes', mapId] });
      qc.invalidateQueries({ queryKey: ['factions', mapId] });
      qc.invalidateQueries({ queryKey: ['currentTick', mapId] });
      qc.invalidateQueries({ queryKey: ['party', mapId] });
    };

    return () => es.close();
  }, [mapId, qc]);
}
