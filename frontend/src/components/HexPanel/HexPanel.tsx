import { useState, useEffect, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Hex, Faction, TerrainType, WeatherType, ActionType } from '../../types';
import { patchHex, patchFaction } from '../../api/maps';
import { AddPOIModal } from '../AddPOIModal/AddPOIModal';
import { AddFactionModal } from '../AddFactionModal/AddFactionModal';
import styles from './HexPanel.module.css';

const TERRAIN_TYPES: TerrainType[] = ['plains', 'forest', 'mountain', 'swamp', 'desert', 'coast'];
const WEATHER_TYPES: WeatherType[] = ['fair', 'unpleasant', 'inclement', 'extreme', 'catastrophic'];
const ACTION_TYPES: ActionType[] = ['supply', 'travel', 'trade', 'merge', 'battle', 'train', 'craft', 'delve', 'search', 'explore'];

interface FactionEditState {
  notes: string;
  destRow: string;
  destCol: string;
  next_action: ActionType | null;
}

interface EditState {
  terrain_type: TerrainType;
  resources: number;
  weather: WeatherType;
  encounter_likelihood: number;
  player_explored: boolean;
  player_visible: boolean;
}

function hexToEditState(hex: Hex): EditState {
  return {
    terrain_type: hex.terrain_type,
    resources: hex.resources,
    weather: hex.weather,
    encounter_likelihood: hex.encounter_likelihood,
    player_explored: hex.player_explored,
    player_visible: hex.player_visible,
  };
}

interface Props {
  hex: Hex | null;
  hexes?: Hex[];
  factions: Faction[];
  gmMode: boolean;
  prepMode?: boolean;
  mapId?: number;
  onClose: () => void;
  children?: ReactNode;
}

export function HexPanel({ hex, hexes = [], factions, gmMode, prepMode = false, mapId, onClose, children }: Props) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditState | null>(null);
  const [addingPOI, setAddingPOI] = useState(false);
  const [addingFaction, setAddingFaction] = useState(false);
  const [selectedPOIId, setSelectedPOIId] = useState<number | null>(null);
  const [expandedFactionId, setExpandedFactionId] = useState<number | null>(null);
  const [editingFactionId, setEditingFactionId] = useState<number | null>(null);
  const [factionDraft, setFactionDraft] = useState<FactionEditState | null>(null);

  const factionMutation = useMutation({
    mutationFn: ({ id, params }: { id: number; params: FactionEditState }) => {
      const destHex = hexes.find(
        (h) => h.row === Number(params.destRow) && h.col === Number(params.destCol)
      );
      const destination = params.destRow === '' && params.destCol === ''
        ? null
        : (destHex?.id ?? null);
      return patchFaction(id, { notes: params.notes, next_action: params.next_action, destination });
    },
    onSuccess: (_, { id }) => {
      if (mapId != null) queryClient.invalidateQueries({ queryKey: ['factions', mapId] });
      setEditingFactionId(null);
      setExpandedFactionId(id);
    },
  });

  useEffect(() => {
    if (hex) {
      setDraft(hexToEditState(hex));
      setEditing(prepMode);
    } else {
      setEditing(false);
      setDraft(null);
    }
  }, [hex?.id, prepMode]);

  const mutation = useMutation({
    mutationFn: (params: EditState) => patchHex(hex!.id, params),
    onSuccess: () => {
      if (mapId != null) queryClient.invalidateQueries({ queryKey: ['hexes', mapId] });
      setEditing(prepMode);
    },
  });

  function handleEdit() {
    if (hex) setDraft(hexToEditState(hex));
    setEditing(true);
  }

  function handleCancel() {
    if (hex) setDraft(hexToEditState(hex));
    setEditing(prepMode);
  }

  function handleSave() {
    if (draft) mutation.mutate(draft);
  }

  function set<K extends keyof EditState>(key: K, value: EditState[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  return (
    <aside className={styles.panel}>
      {!hex ? (
        <p className={styles.empty}>Select a hex to view details.</p>
      ) : (
        <>
          <div className={styles.panelHeader}>
            <h2 className={styles.title}>
              {hex.terrain_type.charAt(0).toUpperCase() + hex.terrain_type.slice(1)}{' '}
              <span className={styles.coords}>({hex.row}, {hex.col})</span>
            </h2>
            <div className={styles.headerActions}>
              {gmMode && !editing && (
                <button className={styles.editBtn} onClick={handleEdit}>Edit</button>
              )}
              <button className={styles.close} onClick={onClose}>✕</button>
            </div>
          </div>

          {editing && draft ? (
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
                  <span className={styles.fieldName}>Weather</span>
                  <select
                    className={styles.select}
                    value={draft.weather}
                    onChange={(e) => set('weather', e.target.value as WeatherType)}
                  >
                    {WEATHER_TYPES.map((w) => (
                      <option key={w} value={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</option>
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

                <div className={styles.editActions}>
                  <button
                    className={styles.saveBtn}
                    onClick={handleSave}
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
          ) : (
            <>
              <dl className={styles.stats}>
                <dt>Weather</dt><dd>{hex.weather}</dd>
                <dt>Terrain difficulty</dt><dd>{hex.terrain_difficulty}</dd>
                {gmMode && <><dt>Resources</dt><dd>{hex.resources}</dd></>}
                {gmMode && <><dt>Encounter likelihood</dt><dd>{hex.encounter_likelihood}</dd></>}
                <dt>Explored</dt><dd>{hex.player_explored ? 'Yes' : 'No'}</dd>
              </dl>

              {hex.pois.filter((p) => gmMode || p.player_visible).length > 0 && (
                <section>
                  <h3>Points of Interest</h3>
                  <ul className={styles.poiList}>
                    {hex.pois
                      .filter((p) => gmMode || p.player_visible)
                      .map((poi) => {
                        const expanded = selectedPOIId === poi.id;
                        return (
                          <li key={poi.id}>
                            <button
                              className={`${styles.poiRow} ${expanded ? styles.poiRowActive : ''}`}
                              onClick={() => setSelectedPOIId(expanded ? null : poi.id)}
                            >
                              <span className={styles.poiName}>{poi.title || poi.name || poi.poi_type}</span>
                              <span className={styles.poiType}>{poi.poi_type.replace('_', ' ')}</span>
                              {gmMode && poi.hidden && <span className={styles.hidden}>[hidden]</span>}
                              <span className={styles.poiChevron}>{expanded ? '▲' : '▼'}</span>
                            </button>
                            {expanded && (
                              <div className={styles.poiDetail}>
                                {poi.difficulty > 0 && (
                                  <div className={styles.poiDetailRow}>
                                    <span>Difficulty</span><span>{poi.difficulty}</span>
                                  </div>
                                )}
                                {poi.description && <p className={styles.poiDescription}>{poi.description}</p>}
                                {gmMode && poi.notes && <p className={styles.notes}>{poi.notes}</p>}
                                <div className={styles.poiFlags}>
                                  <span className={poi.player_visible ? styles.flagOn : styles.flagOff}>visible</span>
                                  <span className={poi.player_explored ? styles.flagOn : styles.flagOff}>explored</span>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                </section>
              )}

              {gmMode && factions.length > 0 && (
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
                            {f.is_famine && <span className={styles.warning}>[famine]</span>}
                            {f.is_dying && <span className={styles.danger}>[dying]</span>}
                            <span className={styles.poiChevron}>{expanded ? '▲' : '▼'}</span>
                          </button>
                          {expanded && !isEditing && (
                            <div className={styles.poiDetail}>
                              <div className={styles.poiDetailRow}>
                                <span>Population</span><span>{f.population}</span>
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
                                  setFactionDraft({ notes: f.notes, destRow: destHex ? String(destHex.row) : '', destCol: destHex ? String(destHex.col) : '', next_action: f.next_action });
                                  setEditingFactionId(f.id);
                                }}
                              >
                                Edit
                              </button>
                            </div>
                          )}
                          {expanded && isEditing && factionDraft && (
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
                                <span>Notes</span>
                                <textarea
                                  className={styles.textarea}
                                  value={factionDraft.notes}
                                  rows={3}
                                  onChange={(e) => setFactionDraft((d) => d && { ...d, notes: e.target.value })}
                                />
                              </label>
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
                                  onClick={() => setEditingFactionId(null)}
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
              )}

              {children}
            </>
          )}
        </>
      )}
    </aside>
  );
}
