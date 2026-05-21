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
  multiSelected?: boolean;
  factionAllowed?: boolean;
  fogOfWar: boolean;
  onClick: (hexId: number) => void;
}

export function HexCell({ hex, factions, size, originX, originY, selected, multiSelected, factionAllowed, fogOfWar, onClick }: Props) {
  const [cx, cy] = hexToPixel(hex.row, hex.col, size, originX, originY);
  const points = flatTopPoints(cx, cy, size - 1);
  const hidden = fogOfWar && !hex.player_visible;
  const unexplored = fogOfWar && !hex.player_explored;
  const fogged = fogOfWar && !hex.player_visible && !hex.player_explored;

  const fill = multiSelected
    ? 'rgba(250,204,21,0.45)'
    : factionAllowed
    ? 'rgba(52,211,153,0.4)'
    : selected
    ? 'rgba(255,255,255,0.5)'
    : 'transparent';
  const stroke = multiSelected ? '#facc15' : factionAllowed ? '#34d399' : selected ? '#fff' : '#555';
  const strokeWidth = multiSelected || factionAllowed || selected ? 2 : 0.5;

  return (
    <g className={styles.cell} onClick={() => !hidden && onClick(hex.id)}>
      {fogged && (
        <polygon points={flatTopPoints(cx, cy, size)} fill="#555" stroke="none" />
      )}
      <polygon
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
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
          {f.name.match(/[A-Z]/g)?.join('') || f.name.slice(0, 2).toUpperCase()}
        </text>
      ))}
    </g>
  );
}
