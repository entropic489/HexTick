import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bulkPatchHexes } from '../../api/maps';
import type { Hex } from '../../types';
import type { TerrainType } from '../../types';
import styles from './BulkHexPanel.module.css';

const TERRAIN_OPTIONS: TerrainType[] = ['plains', 'forest', 'mountain', 'swamp', 'desert', 'coast', 'ocean', 'city'];

// tri-state: undefined = mixed/no-change, true/false = apply value
type TriBool = boolean | undefined;

function triFromHexes(hexes: Hex[], key: 'has_roads' | 'has_rivers' | 'player_visible' | 'player_explored'): TriBool {
  if (hexes.length === 0) return undefined;
  const first = hexes[0][key];
  return hexes.every((h) => h[key] === first) ? first : undefined;
}

function terrainFromHexes(hexes: Hex[]): TerrainType | '' {
  if (hexes.length === 0) return '';
  const first = hexes[0].terrain_type;
  return hexes.every((h) => h.terrain_type === first) ? first : '';
}

interface Props {
  hexIds: number[];
  hexes: Hex[];
  mapId: number;
  onDone: () => void;
}

export function BulkHexPanel({ hexIds, hexes, mapId, onDone }: Props) {
  const selectedHexes = hexes.filter((h) => hexIds.includes(h.id));

  const [terrain, setTerrain] = useState<TerrainType | ''>(() => terrainFromHexes(selectedHexes));
  const [hasRoads, setHasRoads] = useState<TriBool>(() => triFromHexes(selectedHexes, 'has_roads'));
  const [hasRivers, setHasRivers] = useState<TriBool>(() => triFromHexes(selectedHexes, 'has_rivers'));
  const [playerVisible, setPlayerVisible] = useState<TriBool>(() => triFromHexes(selectedHexes, 'player_visible'));
  const [playerExplored, setPlayerExplored] = useState<TriBool>(() => triFromHexes(selectedHexes, 'player_explored'));

  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => {
      const patch: Parameters<typeof bulkPatchHexes>[1] = {};
      if (terrain) patch.terrain_type = terrain;
      if (hasRoads !== undefined) patch.has_roads = hasRoads;
      if (hasRivers !== undefined) patch.has_rivers = hasRivers;
      if (playerVisible !== undefined) patch.player_visible = playerVisible;
      if (playerExplored !== undefined) patch.player_explored = playerExplored;
      return bulkPatchHexes(hexIds, patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hexes', mapId] });
      onDone();
    },
  });

  const nothingChanged =
    !terrain &&
    hasRoads === undefined &&
    hasRivers === undefined &&
    playerVisible === undefined &&
    playerExplored === undefined;

  function cycleTriBool(current: TriBool, setter: (v: TriBool) => void) {
    // undefined → true → false → undefined
    if (current === undefined) setter(true);
    else if (current === true) setter(false);
    else setter(undefined);
  }

  function triLabel(val: TriBool) {
    if (val === true) return '✓';
    if (val === false) return '✗';
    return '—';
  }

  if (hexIds.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.scrollContent}>
          <div className={styles.header}>
            <h2 className={styles.title}>Bulk Edit</h2>
            <button className={styles.close} onClick={onDone}>✕</button>
          </div>
          <p className={styles.empty}>Click hexes on the map to select them.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.scrollContent}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            Bulk Edit <span className={styles.count}>({hexIds.length} hex{hexIds.length !== 1 ? 'es' : ''})</span>
          </h2>
          <button className={styles.close} onClick={onDone}>✕</button>
        </div>

        <div className={styles.form}>
          <span className={styles.fieldName}>Terrain</span>
          <select
            className={styles.select}
            value={terrain}
            onChange={(e) => setTerrain(e.target.value as TerrainType | '')}
          >
            <option value="">— no change —</option>
            {TERRAIN_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={hasRoads === true}
              ref={(el) => { if (el) el.indeterminate = hasRoads === undefined; }}
              onChange={() => cycleTriBool(hasRoads, setHasRoads)}
            />
            Roads {triLabel(hasRoads)}
          </label>

          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={hasRivers === true}
              ref={(el) => { if (el) el.indeterminate = hasRivers === undefined; }}
              onChange={() => cycleTriBool(hasRivers, setHasRivers)}
            />
            Rivers {triLabel(hasRivers)}
          </label>

          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={playerVisible === true}
              ref={(el) => { if (el) el.indeterminate = playerVisible === undefined; }}
              onChange={() => cycleTriBool(playerVisible, setPlayerVisible)}
            />
            Player visible {triLabel(playerVisible)}
          </label>

          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={playerExplored === true}
              ref={(el) => { if (el) el.indeterminate = playerExplored === undefined; }}
              onChange={() => cycleTriBool(playerExplored, setPlayerExplored)}
            />
            Player explored {triLabel(playerExplored)}
          </label>

          <p className={styles.hint}>
            — = no change &nbsp;·&nbsp; ✓ = set true &nbsp;·&nbsp; ✗ = set false
          </p>

          <div className={styles.actions}>
            <button
              className={styles.saveBtn}
              disabled={nothingChanged || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Saving…' : 'Apply'}
            </button>
            <button className={styles.cancelBtn} onClick={onDone}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
