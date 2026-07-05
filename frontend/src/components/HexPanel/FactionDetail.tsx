import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Hex, Faction, Party, ActionType } from '../../types';
import { patchFaction } from '../../api/maps';
import { getGallery } from '../../api/gallery';
import { useGameStore } from '../../store/useGameStore';
import styles from './HexPanel.module.css';

const ACTION_TYPES: ActionType[] = ['supply', 'travel', 'rest'];

interface FactionEditState {
  notes: string;
  destRow: string;
  destCol: string;
  next_action: ActionType | null;
  image: number | null;
  movement_restricted: boolean;
  allowed_hexes: number[];
}

interface Props {
  factions: Faction[];
  hexes: Hex[];
  gmMode: boolean;
  party?: Party | null;
  mapId?: number;
  map?: { map_type: 'regional' | 'city'; id: number } | null;
}

export function FactionDetail({ factions, hexes, gmMode, party, mapId, map }: Props) {
  const queryClient = useQueryClient();
  const factionHexSelectMode = useGameStore((s) => s.factionHexSelectMode);
  const factionAllowedHexIds = useGameStore((s) => s.factionAllowedHexIds);
  const setFactionHexSelectMode = useGameStore((s) => s.setFactionHexSelectMode);
  const clearFactionHexSelect = useGameStore((s) => s.clearFactionHexSelect);
  const [expandedFactionId, setExpandedFactionId] = useState<number | null>(null);
  const [editingFactionId, setEditingFactionId] = useState<number | null>(null);
  const [factionDraft, setFactionDraft] = useState<FactionEditState | null>(null);

  const { data: galleryImages = [] } = useQuery({
    queryKey: ['gallery', map?.id],
    queryFn: () => getGallery(map!.id),
    enabled: gmMode && map != null,
  });

  const factionMutation = useMutation({
    mutationFn: ({ id, params }: { id: number; params: FactionEditState }) => {
      const destHex = hexes.find(
        (h) => h.row === Number(params.destRow) && h.col === Number(params.destCol)
      );
      const destination = params.destRow === '' && params.destCol === ''
        ? null
        : (destHex?.id ?? null);
      const allowed_hexes = factionHexSelectMode ? [...factionAllowedHexIds] : params.allowed_hexes;
      return patchFaction(id, { notes: params.notes, next_action: params.next_action, destination, image: params.image, movement_restricted: params.movement_restricted, allowed_hexes });
    },
    onSuccess: (_, { id }) => {
      if (mapId != null) queryClient.invalidateQueries({ queryKey: ['factions', mapId] });
      clearFactionHexSelect();
      setEditingFactionId(null);
      setExpandedFactionId(id);
    },
  });

  if (factions.length === 0) return null;

  return (
    <section>
      <h3>Factions present</h3>
      <ul className={styles.factionList}>
        {factions.map((f) => {
          const expanded = expandedFactionId === f.id;
          const isEditing = editingFactionId === f.id;
          return (
            <li key={f.id}>
              <button
                className={`${styles.poiRow} ${expanded ? styles.poiRowActive : ''}`}
                onClick={() => {
                  setExpandedFactionId(expanded ? null : f.id);
                  if (isEditing) setEditingFactionId(null);
                }}
              >
                <span
                  className={styles.factionDot}
                  style={{ background: f.color }}
                />
                <span className={styles.poiName}>{f.name}</span>
                {f.is_dead && <span className={styles.danger}>[dead]</span>}
                <span className={styles.poiChevron}>{expanded ? '▲' : '▼'}</span>
              </button>
              {expanded && !isEditing && gmMode && (
                <div className={styles.poiDetail}>
                  <div className={styles.poiDetailRow}>
                    <span>Population</span><span>{f.population}</span>
                  </div>
                  <div className={styles.poiDetailRow}>
                    <span>Speed</span><span>{f.speed} / {f.max_speed}</span>
                  </div>
                  <div className={styles.poiDetailRow}>
                    <span>Current action</span><span>{f.current_action ?? '—'}</span>
                  </div>
                  <div className={styles.poiDetailRow}>
                    <span>Next action</span><span>{f.next_action ?? '—'}</span>
                  </div>
                  <div className={styles.poiDetailRow}>
                    <span>Destination</span>
                    <span>
                      {f.destination
                        ? hexes.find((h) => h.id === f.destination)
                          ? `(${hexes.find((h) => h.id === f.destination)!.row}, ${hexes.find((h) => h.id === f.destination)!.col})`
                          : `hex ${f.destination}`
                        : '—'}
                    </span>
                  </div>
                  {f.notes && <p className={styles.notes}>{f.notes}</p>}
                  <button
                    className={styles.editBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      const destHex = hexes.find((h) => h.id === f.destination);
                      setFactionDraft({ notes: f.notes, destRow: destHex ? String(destHex.row) : '', destCol: destHex ? String(destHex.col) : '', next_action: f.next_action, image: f.image, movement_restricted: f.movement_restricted, allowed_hexes: f.allowed_hexes });
                      setEditingFactionId(f.id);
                    }}
                  >
                    Edit
                  </button>
                  {party?.current_hex != null && f.destination !== party.current_hex && (
                    <button
                      className={styles.editBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        patchFaction(f.id, { destination: party.current_hex }).then(() => {
                          if (mapId != null) queryClient.invalidateQueries({ queryKey: ['factions', mapId] });
                        });
                      }}
                    >
                      Path toward party
                    </button>
                  )}
                </div>
              )}
              {expanded && isEditing && factionDraft && gmMode && (
                <div className={styles.poiDetail}>
                  <label className={styles.factionEditLabel}>
                    <span>Next action</span>
                    <select
                      className={styles.select}
                      value={factionDraft.next_action ?? ''}
                      onChange={(e) => setFactionDraft((d) => d && { ...d, next_action: (e.target.value as ActionType) || null })}
                    >
                      <option value="">—</option>
                      {ACTION_TYPES.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.factionEditLabel}>
                    <span>Destination (row, col)</span>
                    <div className={styles.destInputs}>
                      <input
                        className={styles.input}
                        type="number"
                        placeholder="row"
                        value={factionDraft.destRow}
                        onChange={(e) => setFactionDraft((d) => d && { ...d, destRow: e.target.value })}
                      />
                      <input
                        className={styles.input}
                        type="number"
                        placeholder="col"
                        value={factionDraft.destCol}
                        onChange={(e) => setFactionDraft((d) => d && { ...d, destCol: e.target.value })}
                      />
                    </div>
                    {(factionDraft.destRow !== '' || factionDraft.destCol !== '') &&
                      !hexes.find((h) => h.row === Number(factionDraft.destRow) && h.col === Number(factionDraft.destCol)) && (
                      <span className={styles.destError}>No hex at these coordinates</span>
                    )}
                  </div>
                  <label className={styles.factionEditLabel}>
                    <span>Image</span>
                    <select
                      className={styles.select}
                      value={factionDraft.image ?? ''}
                      onChange={(e) => setFactionDraft((d) => d && { ...d, image: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">— none —</option>
                      {galleryImages.map((img) => (
                        <option key={img.id} value={img.id}>{img.name || `Image ${img.id}`}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.factionEditLabel}>
                    <span>Notes</span>
                    <textarea
                      className={styles.textarea}
                      value={factionDraft.notes}
                      rows={3}
                      onChange={(e) => setFactionDraft((d) => d && { ...d, notes: e.target.value })}
                    />
                  </label>
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={factionDraft.movement_restricted}
                      onChange={(e) => setFactionDraft((d) => d && { ...d, movement_restricted: e.target.checked })}
                    />
                    Movement restricted
                  </label>
                  {factionDraft.movement_restricted && (
                    <div className={styles.factionEditLabel}>
                      <span>
                        Allowed hexes
                        {factionHexSelectMode
                          ? ` (${factionAllowedHexIds.size} selected — click hexes on map)`
                          : ` (${factionDraft.allowed_hexes.length} saved)`}
                      </span>
                      {factionHexSelectMode ? (
                        <button
                          className={styles.cancelBtn}
                          onClick={() => {
                            setFactionDraft((d) => d && { ...d, allowed_hexes: [...factionAllowedHexIds] });
                            setFactionHexSelectMode(false);
                          }}
                        >
                          Done selecting
                        </button>
                      ) : (
                        <button
                          className={styles.editBtn}
                          onClick={() => setFactionHexSelectMode(true, new Set(factionDraft.allowed_hexes))}
                        >
                          Select hexes
                        </button>
                      )}
                    </div>
                  )}
                  <div className={styles.factionEditActions}>
                    <button
                      className={styles.saveBtn}
                      disabled={factionMutation.isPending}
                      onClick={() => factionMutation.mutate({ id: f.id, params: factionDraft })}
                    >
                      {factionMutation.isPending ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      className={styles.cancelBtn}
                      onClick={() => { clearFactionHexSelect(); setEditingFactionId(null); }}
                    >
                      Cancel
                    </button>
                  </div>
                  {factionMutation.isError && <p className={styles.error}>Save failed.</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
