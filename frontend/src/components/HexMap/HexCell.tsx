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
  randomHighlight?: boolean;
  fogOfWar: boolean;
  revealMode?: 'grey_fog' | 'two_layer';
  onClick: (hexId: number) => void;
}

export function HexCell({ hex, factions, size, originX, originY, selected, multiSelected, factionAllowed, randomHighlight, fogOfWar, revealMode = 'grey_fog', onClick }: Props) {
  const [cx, cy] = hexToPixel(hex.row, hex.col, size, originX, originY);
  const points = flatTopPoints(cx, cy, size - 1);
  const hidden = fogOfWar && !hex.player_visible;
  const unexplored = fogOfWar && !hex.player_explored;
  // Grey fog overlay is only for grey-fog maps. In two-layer mode the vague NPC map
  // (base image) shows through unexplored hexes instead of a solid grey cover.
  const fogged = revealMode === 'grey_fog' && fogOfWar && !hex.player_visible && !hex.player_explored;

  const fill = multiSelected
    ? 'rgba(250,204,21,0.45)'
    : factionAllowed
    ? 'rgba(52,211,153,0.4)'
    : randomHighlight
    ? 'rgba(192,132,252,0.45)'
    : selected
    ? 'rgba(255,255,255,0.5)'
    : 'transparent';
  const stroke = multiSelected ? '#facc15' : factionAllowed ? '#34d399' : randomHighlight ? '#c084fc' : selected ? '#fff' : '#555';
  const strokeWidth = multiSelected || factionAllowed || randomHighlight || selected ? 2 : 0.5;

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
      {!hidden && hex.pois.some((p) => p.player_visible) && (() => {
        const r = size * 0.18;
        const sx = cx + size * 0.42;
        const sy = cy + size * 0.38;
        const pts = Array.from({ length: 5 }, (_, i) => {
          const outer = (Math.PI / 2 + (i * 2 * Math.PI) / 5) * -1 + Math.PI / 2;
          const inner = outer + Math.PI / 5;
          return [
            `${sx + r * Math.cos(outer)},${sy - r * Math.sin(outer)}`,
            `${sx + r * 0.4 * Math.cos(inner)},${sy - r * 0.4 * Math.sin(inner)}`,
          ];
        }).flat().join(' ');
        return (
          <polygon
            key="poi-star"
            points={pts}
            fill="#facc15"
            stroke="#92400e"
            strokeWidth={r * 0.18}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        );
      })()}
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
