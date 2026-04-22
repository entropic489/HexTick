import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Hex } from '../../types';
import { createFaction } from '../../api/maps';
import styles from './AddFactionModal.module.css';

interface Props {
  mapId: number;
  hexes: Hex[];
  defaultHexId?: number | null;
  onClose: () => void;
}

interface Draft {
  name: string;
  color: string;
  speed: number;
  population: number;
  technology: number;
  resources: number;
  combat_skill: number;
  current_hex: number | null;
  is_mobile: boolean;
  is_player_faction: boolean;
  is_gm_faction: boolean;
}

const DEFAULT_DRAFT: Draft = {
  name: '',
  color: '#89b4fa',
  speed: 3,
  population: 10,
  technology: 5,
  resources: 10,
  combat_skill: 5,
  current_hex: null,
  is_mobile: true,
  is_player_faction: false,
  is_gm_faction: false,
};

function hexLabel(hex: Hex): string {
  return `(${hex.row}, ${hex.col}) — ${hex.terrain_type}`;
}

export function AddFactionModal({ mapId, hexes, defaultHexId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>({ ...DEFAULT_DRAFT, current_hex: defaultHexId ?? null });

  const mutation = useMutation({
    mutationFn: () => createFaction(mapId, draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factions', mapId] });
      onClose();
    },
  });

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const sortedHexes = [...hexes].sort((a, b) => a.row !== b.row ? b.row - a.row : a.col - b.col);

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Create Faction</h3>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.form}>
          <div className={styles.row}>
            <span className={styles.label}>Name</span>
            <input
              className={styles.input}
              type="text"
              placeholder="Faction name"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          <div className={styles.row}>
            <span className={styles.label}>Color</span>
            <div className={styles.colorRow}>
              <input
                className={styles.colorSwatch}
                type="color"
                value={draft.color}
                onChange={(e) => set('color', e.target.value)}
              />
              <input
                className={styles.input}
                type="text"
                value={draft.color}
                onChange={(e) => set('color', e.target.value)}
              />
            </div>
          </div>

          <div className={styles.row}>
            <span className={styles.label}>Location</span>
            <select
              className={styles.select}
              value={draft.current_hex ?? ''}
              onChange={(e) => set('current_hex', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— none —</option>
              {sortedHexes.map((h) => (
                <option key={h.id} value={h.id}>{hexLabel(h)}</option>
              ))}
            </select>
          </div>

          <div className={styles.divider} />

          <div className={styles.row}>
            <span className={styles.label}>Speed</span>
            <input className={styles.input} type="number" min={1} value={draft.speed}
              onChange={(e) => set('speed', Number(e.target.value))} />
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Population</span>
            <input className={styles.input} type="number" min={0} value={draft.population}
              onChange={(e) => set('population', Number(e.target.value))} />
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Technology</span>
            <input className={styles.input} type="number" min={0} value={draft.technology}
              onChange={(e) => set('technology', Number(e.target.value))} />
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Resources</span>
            <input className={styles.input} type="number" min={0} value={draft.resources}
              onChange={(e) => set('resources', Number(e.target.value))} />
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Combat skill</span>
            <input className={styles.input} type="number" min={0} value={draft.combat_skill}
              onChange={(e) => set('combat_skill', Number(e.target.value))} />
          </div>

          <div className={styles.checks}>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={draft.is_mobile}
                onChange={(e) => set('is_mobile', e.target.checked)} />
              Mobile
            </label>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={draft.is_gm_faction}
                onChange={(e) => set('is_gm_faction', e.target.checked)} />
              GM faction
            </label>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={draft.is_player_faction}
                onChange={(e) => set('is_player_faction', e.target.checked)} />
              Player faction
            </label>
          </div>
        </div>

        {mutation.isError && <p className={styles.error}>Save failed.</p>}

        <div className={styles.actions}>
          <button
            className={styles.saveBtn}
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !draft.name.trim()}
          >
            {mutation.isPending ? 'Creating…' : 'Create Faction'}
          </button>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
