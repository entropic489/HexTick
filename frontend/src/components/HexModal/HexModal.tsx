import type { ReactNode } from 'react';
import type { Hex, Faction } from '../../types';
import styles from './HexModal.module.css';

interface Props {
  hex: Hex;
  factions: Faction[];
  gmMode: boolean;
  onClose: () => void;
  children?: ReactNode;
}

export function HexModal({ hex, factions, gmMode, onClose, children }: Props) {
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose}>✕</button>

        <h2 className={styles.title}>
          {hex.terrain_type.charAt(0).toUpperCase() + hex.terrain_type.slice(1)}{' '}
          <span className={styles.coords}>({hex.row}, {hex.col})</span>
        </h2>

        <dl className={styles.stats}>
          <dt>Weather</dt><dd>{hex.weather}</dd>
          <dt>Terrain difficulty</dt><dd>{hex.terrain_difficulty}</dd>
          {gmMode && <><dt>Resources</dt><dd>{hex.resources}</dd></>}
          {gmMode && <><dt>Encounter likelihood</dt><dd>{hex.encounter_likelihood}</dd></>}
          <dt>Explored</dt><dd>{hex.player_explored ? 'Yes' : 'No'}</dd>
        </dl>

        {hex.pois.filter((p) => gmMode || p.player_visible).length > 0 && (
          <section>
            <h3>Points of Interest</h3>
            <ul className={styles.poiList}>
              {hex.pois
                .filter((p) => gmMode || p.player_visible)
                .map((poi) => (
                  <li key={poi.id}>
                    <strong>{poi.title || poi.name}</strong>
                    {' — '}{poi.poi_type}
                    {gmMode && poi.hidden && <span className={styles.hidden}> [hidden]</span>}
                    {poi.description && <p>{poi.description}</p>}
                    {gmMode && poi.notes && <p className={styles.notes}>{poi.notes}</p>}
                  </li>
                ))}
            </ul>
          </section>
        )}

        {gmMode && factions.length > 0 && (
          <section>
            <h3>Factions present</h3>
            <ul className={styles.factionList}>
              {factions.map((f) => (
                <li key={f.id}>
                  <strong>{f.name}</strong> — pop {f.population}, action: {f.current_action ?? 'none'}
                  {f.is_famine && <span className={styles.warning}> [famine]</span>}
                  {f.is_dying && <span className={styles.danger}> [dying]</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {children}
      </div>
    </div>
  );
}
