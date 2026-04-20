import { useGameStore } from '../../store/useGameStore';
import styles from './EventLog.module.css';

export function EventLog() {
  const events = useGameStore((s) => s.pendingEvents);
  const clear = useGameStore((s) => s.clearPendingEvents);

  if (events.length === 0) return null;

  return (
    <div className={styles.backdrop} onClick={clear}>
      <div className={styles.log} onClick={(e) => e.stopPropagation()}>
        <h3>Events</h3>
        <ul>
          {events.map((e, i) => (
            <li key={i} className={styles[e.type] ?? ''}>
              {e.message}
            </li>
          ))}
        </ul>
        <button onClick={clear}>Dismiss</button>
      </div>
    </div>
  );
}
