import type { Hex, Faction } from '../../types';
import { hexToPixel, flatTopPoints } from './hexGeometry';
import styles from './HexCell.module.css';

interface Props {
  hex: Hex;
  factions: Faction[];
  size: number;
  originX: number;
  originY: number;
  selected: boolean;
  fogOfWar: boolean;
  onClick: (hexId: number) => void;
}

export function HexCell({ hex, factions, size, originX, originY, selected, fogOfWar, onClick }: Props) {
  const [cx, cy] = hexToPixel(hex.row, hex.col, size, originX, originY);
  const points = flatTopPoints(cx, cy, size - 1);
  const hidden = fogOfWar && !hex.player_visible;
  const unexplored = fogOfWar && !hex.player_explored;

  return (
    <g className={styles.cell} onClick={() => !hidden && onClick(hex.id)}>
      <polygon
        points={points}
        fill={hidden ? '#1a1a2e' : selected ? 'rgba(255,255,255,0.5)' : 'transparent'}
        stroke={selected ? '#fff' : '#555'}
        strokeWidth={selected ? 2 : 0.5}
        opacity={unexplored && !hidden ? 0.5 : 1}
      />
      {!hidden && factions.map((f) => (
        <text
          key={f.id}
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize={size * 0.4}
          className={styles.factionLabel}
          fill={f.color ?? '#ffffff'}
        >
          {f.name.slice(0, 2).toUpperCase()}
        </text>
      ))}
    </g>
  );
}
