import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';

export function useTickStream(mapId: number) {
  const qc = useQueryClient();

  useEffect(() => {
    const url = BASE_URL.replace(/\/api$/, '') + `/api/maps/${mapId}/tick/stream/`;
    const es = new EventSource(url);

    es.onmessage = () => {
      qc.invalidateQueries({ queryKey: ['hexes', mapId] });
      qc.invalidateQueries({ queryKey: ['factions', mapId] });
      qc.invalidateQueries({ queryKey: ['currentTick', mapId] });
    };

    return () => es.close();
  }, [mapId, qc]);
}
