import type { MoveResult } from '../../store/useGameStore';
import styles from './LastActionResultModal.module.css';

interface Props {
  result: MoveResult;
  onClose: () => void;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function LastActionResultModal({ result, onClose }: Props) {
  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Action Result</h3>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <dl className={styles.stats}>
          <dt>Action</dt><dd style={{ textTransform: 'capitalize' }}>{result.action}</dd>
          <dt>Navigation</dt>
          <dd className={result.lost ? styles.lostValue : styles.safeValue}>
            {result.lost ? 'Lost' : 'On course'}
            {!result.lost && result.lost_roll === null && result.lost !== null && (
              <span className={styles.skippedNote}> (Skipped)</span>
            )}
          </dd>
          <dt>Event</dt><dd>{result.wilderness_event}</dd>
          {result.weather_before && result.weather_after && (
            <>
              <dt>Weather</dt>
              <dd>
                {capitalize(result.weather_before)} → {capitalize(result.weather_after)}
              </dd>
            </>
          )}
        </dl>

        <div className={styles.actions}>
          <button className={styles.closeBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
