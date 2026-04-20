import type { Hex, Faction } from '../../types';
import { hexToPixel, flatTopPoints } from './hexGeometry';
import styles from './HexCell.module.css';

const TERRAIN_COLORS: Record<string, string> = {
  plains: '#c8d96f',
  forest: '#4a7c59',
  mountain: '#9e9e9e',
  swamp: '#6b7c4a',
  desert: '#e8c87a',
  coast: '#7ab8d4',
};

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
  const fill = TERRAIN_COLORS[hex.terrain_type] ?? '#ccc';
  const hidden = fogOfWar && !hex.player_visible;
  const unexplored = fogOfWar && !hex.player_explored;

  return (
    <g className={styles.cell} onClick={() => !hidden && onClick(hex.id)}>
      <polygon
        points={points}
        fill={hidden ? '#1a1a2e' : fill}
        stroke={selected ? '#fff' : '#333'}
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
        >
          {f.name.slice(0, 2).toUpperCase()}
        </text>
      ))}
    </g>
  );
}
