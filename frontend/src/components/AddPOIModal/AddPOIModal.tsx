import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { POIType } from '../../types';
import { createPOI } from '../../api/maps';
import styles from './AddPOIModal.module.css';

const POI_TYPES: { value: POIType; label: string }[] = [
  { value: 'dungeon',      label: 'Dungeon' },
  { value: 'village',      label: 'Village' },
  { value: 'ruin',         label: 'Ruin' },
  { value: 'stash',        label: 'Stash' },
  { value: 'monster_base', label: 'Monster Base' },
];

interface Props {
  hexId: number;
  mapId: number;
  onClose: () => void;
}

interface Draft {
  poi_type: POIType;
  name: string;
  difficulty: number;
  title: string;
  description: string;
  notes: string;
  technology_max_modifier: number;
  monster_type: string;
  age: number;
  player_visible: boolean;
  player_explored: boolean;
  hidden: boolean;
}

const DEFAULT_DRAFT: Draft = {
  poi_type: 'dungeon',
  name: '',
  difficulty: 0,
  title: '',
  description: '',
  notes: '',
  technology_max_modifier: 1,
  monster_type: '',
  age: 4,
  player_visible: false,
  player_explored: false,
  hidden: false,
};

export function AddPOIModal({ hexId, mapId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>({ ...DEFAULT_DRAFT });

  const mutation = useMutation({
    mutationFn: () => createPOI(hexId, draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hexes', mapId] });
      onClose();
    },
  });

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const t = draft.poi_type;
  const hasDifficulty = t === 'dungeon' || t === 'ruin';
  const hasDungeonFields = t === 'dungeon';
  const hasMonsterType = t === 'monster_base';

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Add Point of Interest</h3>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.form}>
          <div className={styles.row}>
            <span className={styles.label}>Type</span>
            <select
              className={styles.select}
              value={draft.poi_type}
              onChange={(e) => set('poi_type', e.target.value as POIType)}
            >
              {POI_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className={styles.row}>
            <span className={styles.label}>Name</span>
            <input
              className={styles.input}
              type="text"
              placeholder="Optional display name"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          {hasDungeonFields && (
            <div className={styles.row}>
              <span className={styles.label}>Title</span>
              <input
                className={styles.input}
                type="text"
                placeholder="Proper name / title"
                value={draft.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </div>
          )}

          {hasDifficulty && (
            <div className={styles.row}>
              <span className={styles.label}>Difficulty</span>
              <input
                className={styles.input}
                type="number"
                min={0}
                value={draft.difficulty}
                onChange={(e) => set('difficulty', Number(e.target.value))}
              />
            </div>
          )}

          {hasDungeonFields && (
            <div className={styles.row}>
              <span className={styles.label}>Tech mod</span>
              <input
                className={styles.input}
                type="number"
                value={draft.technology_max_modifier}
                onChange={(e) => set('technology_max_modifier', Number(e.target.value))}
              />
            </div>
          )}

          {hasMonsterType && (
            <div className={styles.row}>
              <span className={styles.label}>Monster type</span>
              <input
                className={styles.input}
                type="text"
                value={draft.monster_type}
                onChange={(e) => set('monster_type', e.target.value)}
              />
            </div>
          )}

          <div className={styles.row}>
            <span className={styles.label}>Age</span>
            <input
              className={styles.input}
              type="number"
              min={0}
              value={draft.age}
              onChange={(e) => set('age', Number(e.target.value))}
            />
          </div>

          {hasDungeonFields && (
            <div className={styles.rowFull}>
              <span className={styles.label}>Description</span>
              <textarea
                className={styles.textarea}
                rows={3}
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </div>
          )}

          {hasDungeonFields && (
            <div className={styles.rowFull}>
              <span className={styles.label}>Notes</span>
              <textarea
                className={styles.textarea}
                rows={2}
                value={draft.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </div>
          )}

          <div className={styles.checks}>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={draft.hidden}
                onChange={(e) => set('hidden', e.target.checked)}
              />
              Hidden
            </label>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={draft.player_visible}
                onChange={(e) => set('player_visible', e.target.checked)}
              />
              Player visible
            </label>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={draft.player_explored}
                onChange={(e) => set('player_explored', e.target.checked)}
              />
              Player explored
            </label>
          </div>
        </div>

        {mutation.isError && <p className={styles.error}>Save failed.</p>}

        <div className={styles.actions}>
          <button
            className={styles.saveBtn}
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Adding…' : 'Add POI'}
          </button>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
