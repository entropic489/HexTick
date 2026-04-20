import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postTick } from '../../api/tick';
import { useGameStore } from '../../store/useGameStore';
import styles from './TickControls.module.css';

export function TickControls() {
  const mapId = useGameStore((s) => s.selectedMapId);
  const setPendingEvents = useGameStore((s) => s.setPendingEvents);
  const qc = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: postTick,
    onSuccess: (data) => {
      setPendingEvents(data.events);
      qc.invalidateQueries({ queryKey: ['hexes', mapId] });
      qc.invalidateQueries({ queryKey: ['factions', mapId] });
    },
  });

  const tick = (mode: 'shift' | 'day', reverse = false) => {
    if (!mapId) return;
    mutate({ map_id: mapId, mode, reverse });
  };

  return (
    <div className={styles.controls}>
      <button onClick={() => tick('shift', true)} disabled={isPending} className={styles.reverse}>
        ◀ Shift
      </button>
      <button onClick={() => tick('shift')} disabled={isPending}>
        Shift ▶
      </button>
      <button onClick={() => tick('day')} disabled={isPending} className={styles.day}>
        Day ▶▶
      </button>
    </div>
  );
}
