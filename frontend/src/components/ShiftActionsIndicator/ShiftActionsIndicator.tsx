import type { Map } from '../../types';
import styles from './ShiftActionsIndicator.module.css';

interface Props {
  map: Map;
}

export function ShiftActionsIndicator({ map }: Props) {
  if (map.map_type !== 'city') return null;

  const remaining = 3 - map.sub_tick;

  return (
    <span className={styles.badge}>
      Actions this shift: <strong>{remaining} / 3</strong>
    </span>
  );
}
