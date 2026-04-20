import { useMemo } from 'react';
import type { Hex, Faction, Map } from '../../types';
import { HexCell } from './HexCell';
import { mapBounds } from './hexGeometry';
import styles from './HexMap.module.css';

interface Props {
  map: Map;
  hexes: Hex[];
  factions: Faction[];
  selectedHexId: number | null;
  fogOfWar: boolean;
  onHexClick: (hexId: number) => void;
}

export function HexMap({ map, hexes, factions, selectedHexId, fogOfWar, onHexClick }: Props) {
  const factionsByHex = useMemo(() => {
    const m = new Map<number, Faction[]>();
    for (const f of factions) {
      if (f.current_hex == null) continue;
      if (!m.has(f.current_hex)) m.set(f.current_hex, []);
      m.get(f.current_hex)!.push(f);
    }
    return m;
  }, [factions]);

  const rows = hexes.reduce((max, h) => Math.max(max, h.row), 0) + 1;
  const cols = hexes.reduce((max, h) => Math.max(max, h.col), 0) + 1;
  const { width, height } = mapBounds(rows, cols, map.hex_size, map.origin_x, map.origin_y);

  return (
    <div className={styles.container}>
      <svg width={width} height={height} className={styles.svg}>
        {hexes.map((hex) => (
          <HexCell
            key={hex.id}
            hex={hex}
            factions={factionsByHex.get(hex.id) ?? []}
            size={map.hex_size}
            originX={map.origin_x}
            originY={map.origin_y}
            selected={hex.id === selectedHexId}
            fogOfWar={fogOfWar}
            onClick={onHexClick}
          />
        ))}
      </svg>
    </div>
  );
}
