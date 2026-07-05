import { useState } from 'react';
import type { PointOfInterest } from '../../types';
import styles from './HexPanel.module.css';

interface Props {
  pois: PointOfInterest[];
  gmMode: boolean;
}

export function PoiList({ pois, gmMode }: Props) {
  const [selectedPOIId, setSelectedPOIId] = useState<number | null>(null);
  const visible = pois.filter((p) => gmMode || !p.hidden);

  if (visible.length === 0) return null;

  return (
    <section>
      <h3>Points of Interest</h3>
      <ul className={styles.poiList}>
        {visible.map((poi) => {
          const expanded = selectedPOIId === poi.id;
          return (
            <li key={poi.id}>
              <button
                className={`${styles.poiRow} ${expanded ? styles.poiRowActive : ''}`}
                onClick={() => setSelectedPOIId(expanded ? null : poi.id)}
              >
                <span className={styles.poiName}>{poi.title || poi.name || poi.poi_type}</span>
                <span className={styles.poiType}>{poi.poi_type.replace('_', ' ')}</span>
                {gmMode && poi.hidden && <span className={styles.hidden}>[hidden]</span>}
                <span className={styles.poiChevron}>{expanded ? '▲' : '▼'}</span>
              </button>
              {expanded && (
                <div className={styles.poiDetail}>
                  {poi.difficulty > 0 && (
                    <div className={styles.poiDetailRow}>
                      <span>Difficulty</span><span>{poi.difficulty}</span>
                    </div>
                  )}
                  {poi.description && <p className={styles.poiDescription}>{poi.description}</p>}
                  {gmMode && poi.notes && <p className={styles.notes}>{poi.notes}</p>}
                  <div className={styles.poiFlags}>
                    <span className={poi.player_visible ? styles.flagOn : styles.flagOff}>visible</span>
                    <span className={poi.player_explored ? styles.flagOn : styles.flagOff}>explored</span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
