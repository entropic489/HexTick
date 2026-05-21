import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { postTick, getTickNumbers, getTickState, resetToTick } from '../../api/tick';
import { patchMapLocked } from '../../api/maps';
import { useGameStore } from '../../store/useGameStore';
import styles from './TickControls.module.css';

export function TickControls() {
  const mapId = useGameStore((s) => s.selectedMapId);
  const setPendingEvents = useGameStore((s) => s.setPendingEvents);
  const viewingTickNumber = useGameStore((s) => s.viewingTickNumber);
  const setViewingTickNumber = useGameStore((s) => s.setViewingTickNumber);
  const qc = useQueryClient();

  const { data: currentTickData } = useQuery({
    queryKey: ['currentTick', mapId],
    queryFn: () => import('../../api/tick').then((m) => m.getCurrentTick(mapId!)),
    enabled: !!mapId,
  });

  const { data: tickNumbers = [] } = useQuery({
    queryKey: ['tickNumbers', mapId],
    queryFn: () => getTickNumbers(mapId!),
    enabled: !!mapId,
  });

  const currentTickNumber = currentTickData?.tick_number ?? 0;
  const isViewingHistory = viewingTickNumber !== null;
  const displayedTick = isViewingHistory ? viewingTickNumber : currentTickNumber;
  const canGoBack = tickNumbers.length > 0 && displayedTick > tickNumbers[0];
  const canGoForward = isViewingHistory && displayedTick < currentTickNumber;

  const enterHistory = (targetTick: number) => {
    if (!mapId) return;
    setViewingTickNumber(targetTick);
    patchMapLocked(mapId, true).then(() => {
      qc.invalidateQueries({ queryKey: ['map', mapId] });
    });
  };

  const exitHistory = () => {
    if (!mapId) return;
    setViewingTickNumber(null);
    patchMapLocked(mapId, false).then(() => {
      qc.invalidateQueries({ queryKey: ['map', mapId] });
    });
  };

  const goBack = () => {
    const sorted = [...tickNumbers].sort((a, b) => a - b);
    const idx = sorted.indexOf(displayedTick);
    if (idx > 0) enterHistory(sorted[idx - 1]);
    else if (!isViewingHistory && sorted.length > 0) enterHistory(sorted[sorted.length - 1]);
  };

  const goForward = () => {
    const sorted = [...tickNumbers].sort((a, b) => a - b);
    const idx = sorted.indexOf(displayedTick);
    if (idx >= 0 && idx < sorted.length - 1) {
      const next = sorted[idx + 1];
      if (next >= currentTickNumber) exitHistory();
      else setViewingTickNumber(next);
    } else {
      exitHistory();
    }
  };

  const { mutate: advanceTick, isPending } = useMutation({
    mutationFn: postTick,
    onSuccess: (data) => {
      setPendingEvents(data.events);
      qc.invalidateQueries({ queryKey: ['hexes', mapId] });
      qc.invalidateQueries({ queryKey: ['factions', mapId] });
      qc.invalidateQueries({ queryKey: ['tickNumbers', mapId] });
      qc.setQueryData(['currentTick', mapId], { tick_number: data.tick_number });
    },
  });

  const { mutate: doReset, isPending: isResetting } = useMutation({
    mutationFn: () => resetToTick(mapId!, viewingTickNumber!),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hexes', mapId] });
      qc.invalidateQueries({ queryKey: ['factions', mapId] });
      qc.invalidateQueries({ queryKey: ['tickNumbers', mapId] });
      qc.setQueryData(['currentTick', mapId], { tick_number: data.tick_number });
      exitHistory();
    },
  });

  // Prefetch historical state when viewing history so GMPage can read from cache
  useQuery({
    queryKey: ['tickState', mapId, viewingTickNumber],
    queryFn: () => getTickState(mapId!, viewingTickNumber!),
    enabled: !!mapId && isViewingHistory,
    staleTime: Infinity,
  });

  const tick = (mode: 'shift' | 'day') => {
    if (!mapId) return;
    advanceTick({ map_id: mapId, mode });
  };

  return (
    <div className={styles.controls}>
      <button onClick={goBack} disabled={isPending || !canGoBack} className={styles.reverse}>
        ◀ Shift
      </button>
      {isViewingHistory && (
        <>
          <span className={styles.historyLabel}>Tick {displayedTick}</span>
          <button onClick={goForward} disabled={!canGoForward}>
            ▶
          </button>
          <button onClick={exitHistory} className={styles.liveBtn}>
            ▶ Live
          </button>
          <button
            onClick={() => doReset()}
            disabled={isResetting}
            className={styles.resetBtn}
          >
            Reset to this tick
          </button>
        </>
      )}
      {!isViewingHistory && (
        <>
          <button onClick={() => tick('shift')} disabled={isPending}>
            Shift ▶
          </button>
          <button onClick={() => tick('day')} disabled={isPending} className={styles.day}>
            Day ▶▶
          </button>
        </>
      )}
    </div>
  );
}
