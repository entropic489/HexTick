import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Hex, TerrainType } from '../../types';
import { patchHex } from '../../api/maps';
import { AddPOIModal } from '../AddPOIModal/AddPOIModal';
import { AddFactionModal } from '../AddFactionModal/AddFactionModal';
import styles from './HexPanel.module.css';

const TERRAIN_TYPES: TerrainType[] = ['plains', 'forest', 'mountain', 'swamp', 'desert', 'coast', 'ocean', 'city'];

interface EditState {
  terrain_type: TerrainType;
  resources: number;
  encounter_likelihood: number;
  player_explored: boolean;
  player_visible: boolean;
  has_roads: boolean;
  has_rivers: boolean;
  can_enter: boolean;
  linked_map_id: number | null;
}

function hexToEditState(hex: Hex): EditState {
  return {
    terrain_type: hex.terrain_type,
    resources: hex.resources,
    encounter_likelihood: hex.encounter_likelihood,
    player_explored: hex.player_explored,
    player_visible: hex.player_visible,
    has_roads: hex.has_roads,
    has_rivers: hex.has_rivers,
    can_enter: hex.can_enter,
    linked_map_id: hex.linked_map,
  };
}

interface Props {
  hex: Hex;
  hexes: Hex[];
  mapId?: number;
  map?: { map_type: 'regional' | 'city'; id: number } | null;
  onCancel: () => void;
  onSaved: () => void;
}

export function HexEditForm({ hex, hexes, mapId, map, onCancel, onSaved }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EditState>(() => hexToEditState(hex));
  const [addingPOI, setAddingPOI] = useState(false);
  const [addingFaction, setAddingFaction] = useState(false);

  useEffect(() => {
    setDraft(hexToEditState(hex));
  }, [hex.id]);

  const mutation = useMutation({
    mutationFn: (params: EditState) => patchHex(hex.id, params),
    onSuccess: () => {
      if (mapId != null) queryClient.invalidateQueries({ queryKey: ['hexes', mapId] });
      onSaved();
    },
  });

  function set<K extends keyof EditState>(key: K, value: EditState[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function handleCancel() {
    setDraft(hexToEditState(hex));
    onCancel();
  }

  return (
    <>
      <div className={styles.editForm}>
        <label className={styles.fieldLabel}>
          <span className={styles.fieldName}>Terrain</span>
          <select
            className={styles.select}
            value={draft.terrain_type}
            onChange={(e) => set('terrain_type', e.target.value as TerrainType)}
          >
            {TERRAIN_TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </label>

        <label className={styles.fieldLabel}>
          <span className={styles.fieldName}>Resources</span>
          <input
            className={styles.input}
            type="number"
            value={draft.resources}
            onChange={(e) => set('resources', Number(e.target.value))}
          />
        </label>

        <label className={styles.fieldLabel}>
          <span className={styles.fieldName}>Encounter likelihood</span>
          <input
            className={styles.input}
            type="number"
            min={0}
            max={100}
            value={draft.encounter_likelihood}
            onChange={(e) => set('encounter_likelihood', Number(e.target.value))}
          />
        </label>

        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={draft.player_explored}
            onChange={(e) => set('player_explored', e.target.checked)}
          />
          Player explored
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
            checked={draft.has_roads}
            onChange={(e) => set('has_roads', e.target.checked)}
          />
          Has roads
        </label>

        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={draft.has_rivers}
            onChange={(e) => set('has_rivers', e.target.checked)}
          />
          Has rivers
        </label>

        {map?.map_type === 'regional' && draft.terrain_type === 'city' && (
          <>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={draft.can_enter}
                onChange={(e) => set('can_enter', e.target.checked)}
              />
              Can enter
            </label>
            {draft.can_enter && (
              <label className={styles.fieldLabel}>
                <span className={styles.fieldName}>Linked map ID</span>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  value={draft.linked_map_id ?? ''}
                  onChange={(e) => set('linked_map_id', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
            )}
          </>
        )}

        <div className={styles.editActions}>
          <button
            className={styles.saveBtn}
            onClick={() => mutation.mutate(draft)}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
          <button className={styles.cancelBtn} onClick={handleCancel}>Cancel</button>
          <button className={styles.addPoiBtn} onClick={() => setAddingPOI(true)}>
            + Add POI
          </button>
          <button className={styles.addPoiBtn} onClick={() => setAddingFaction(true)}>
            + Add Faction
          </button>
        </div>
        {mutation.isError && <p className={styles.error}>Save failed.</p>}
      </div>

      {addingPOI && mapId != null && (
        <AddPOIModal
          hexId={hex.id}
          mapId={mapId}
          onClose={() => setAddingPOI(false)}
        />
      )}
      {addingFaction && mapId != null && (
        <AddFactionModal
          mapId={mapId}
          hexes={hexes}
          defaultHexId={hex.id}
          onClose={() => setAddingFaction(false)}
        />
      )}
    </>
  );
}
