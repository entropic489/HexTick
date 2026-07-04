import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGameStore } from '../store/useGameStore';
import type { MoveResult } from '../store/useGameStore';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';

export function useTickStream(mapId: number) {
  const qc = useQueryClient();
  const setHighlightedHexId = useGameStore((s) => s.setHighlightedHexId);
  const setMoveResult = useGameStore((s) => s.setMoveResult);
  const moveResultRef = useRef<MoveResult | null>(useGameStore.getState().moveResult);

  useEffect(() => {
    return useGameStore.subscribe((s) => { moveResultRef.current = s.moveResult; });
  }, []);

  useEffect(() => {
    const url = BASE_URL.replace(/\/api$/, '') + `/api/maps/${mapId}/tick/stream/`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      let parsed: { type?: string; hex_id?: number | null; lost?: boolean; lost_roll?: number | null; wilderness_event?: string; event_roll?: number } | undefined;
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

      if (type === 'navigation_update' && moveResultRef.current) {
        setMoveResult({ ...moveResultRef.current, lost: parsed?.lost ?? false });
        return;
      }

      if (type === 'move_result' && parsed?.wilderness_event !== undefined) {
        setMoveResult({
          action: parsed.action ?? 'move',
          lost: parsed.lost ?? null,
          lost_roll: parsed.lost_roll ?? null,
          wilderness_event: parsed.wilderness_event,
          event_roll: parsed.event_roll ?? 0,
        });
        return;
      }

      qc.invalidateQueries({ queryKey: ['map', mapId] });
      qc.invalidateQueries({ queryKey: ['hexes', mapId] });
      qc.invalidateQueries({ queryKey: ['factions', mapId] });
      qc.invalidateQueries({ queryKey: ['currentTick', mapId] });
      qc.invalidateQueries({ queryKey: ['party', mapId] });
    };

    return () => es.close();
  }, [mapId, qc, setHighlightedHexId, setMoveResult]);
}
