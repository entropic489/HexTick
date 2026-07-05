import { useState, useEffect, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Hex, Faction, Party, TerrainType, ActionType } from '../../types';
import { patchHex, patchFaction, postHighlightHex } from '../../api/maps';
import { useGameStore } from '../../store/useGameStore';
import { patchParty, postPartyAction } from '../../api/tick';
import { getGallery, publishGalleryImage } from '../../api/gallery';
import { AddPOIModal } from '../AddPOIModal/AddPOIModal';
import { AddFactionModal } from '../AddFactionModal/AddFactionModal';
import { ActionModal } from '../ActionModal/ActionModal';
import styles from './HexPanel.module.css';

const TERRAIN_TYPES: TerrainType[] = ['plains', 'forest', 'mountain', 'swamp', 'desert', 'coast', 'ocean', 'city'];
const ACTION_TYPES: ActionType[] = ['supply', 'travel', 'rest'];


interface InteractModalProps {
  faction: Faction;
  onClose: () => void;
}

function InteractModal({ faction, onClose }: InteractModalProps) {
  return (
    <div className={styles.interactBackdrop} onClick={onClose}>
      <div className={styles.interactModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.interactHeader}>
          <span
            className={styles.interactDot}
            style={{ background: faction.color }}
          />
          <span className={styles.interactName}>{faction.name}</span>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>
        <div className={styles.interactBody}>
          <p className={styles.interactFlavour}>
            You make contact with {faction.name}. How the encounter unfolds is up to the GM.
          </p>
        </div>
      </div>
    </div>
  );
}

interface FactionEditState {
  notes: string;
  destRow: string;
  destCol: string;
  next_action: ActionType | null;
  image: number | null;
  movement_restricted: boolean;
  allowed_hexes: number[];
}

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
  hex: Hex | null;
  hexes?: Hex[];
  factions: Faction[];
  partyHexFactions?: Faction[];
  gmMode: boolean;
  prepMode?: boolean;
  mapId?: number;
  map?: { map_type: 'regional' | 'city'; id: number } | null;
  party?: Party | null;
  tickNumber?: number;
  onClose: () => void;
  children?: ReactNode;
}

export function HexPanel({ hex, hexes = [], factions, partyHexFactions = [], gmMode, prepMode = false, mapId, map, party, tickNumber = 0, onClose, children }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const factionHexSelectMode = useGameStore((s) => s.factionHexSelectMode);
  const factionAllowedHexIds = useGameStore((s) => s.factionAllowedHexIds);
  const setFactionHexSelectMode = useGameStore((s) => s.setFactionHexSelectMode);
  const clearFactionHexSelect = useGameStore((s) => s.clearFactionHexSelect);
  const highlightedHexId = useGameStore((s) => s.highlightedHexId);
  const setHighlightedHexId = useGameStore((s) => s.setHighlightedHexId);
  const moveResult = useGameStore((s) => s.moveResult);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditState | null>(null);
  const [addingPOI, setAddingPOI] = useState(false);
  const [addingFaction, setAddingFaction] = useState(false);
  const [selectedPOIId, setSelectedPOIId] = useState<number | null>(null);
  const [expandedFactionId, setExpandedFactionId] = useState<number | null>(null);
  const [editingFactionId, setEditingFactionId] = useState<number | null>(null);
  const [factionDraft, setFactionDraft] = useState<FactionEditState | null>(null);
  const [interactFaction, setInteractFaction] = useState<Faction | null>(null);
  const [gmActionModalOpen, setGmActionModalOpen] = useState(false);
  const [partyEditing, setPartyEditing] = useState(false);
  const [partyDraft, setPartyDraft] = useState<{
    player_count: number;
    supplies: number;
    tracks_supplies: boolean;
    speed: number;
    max_speed: number;
    resource_generation: number;
    current_action: string;
  } | null>(null);

  const movePartyMutation = useMutation({
    mutationFn: () => patchParty(party!.id, { current_hex: hex!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['party'] });
    },
  });

  const highlightMutation = useMutation({
    mutationFn: (hexId: number | null) => postHighlightHex(map!.id, hexId),
    onSuccess: (_, hexId) => setHighlightedHexId(hexId),
  });

  const partyMutation = useMutation({
    mutationFn: (draft: NonNullable<typeof partyDraft>) =>
      patchParty(party!.id, {
        ...draft,
        current_action: draft.current_action || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['party'] });
      setPartyEditing(false);
      setPartyDraft(null);
    },
  });

  const clearLostMutation = useMutation({
    mutationFn: () => postPartyAction(party!.id, { action: 'clear_lost' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['party'] });
    },
  });

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

  const publishFactionImageMutation = useMutation({
    mutationFn: (imageId: number) => publishGalleryImage(imageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gallery', map?.id] }),
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
      <div className={styles.scrollContent}>
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
                <dt>Terrain difficulty</dt><dd>{hex.terrain_difficulty}</dd>
                {gmMode && <><dt>Resources</dt><dd>{hex.resources}</dd></>}
                {gmMode && <><dt>Encounter likelihood</dt><dd>{hex.encounter_likelihood}</dd></>}
                <dt>Explored</dt><dd>{hex.player_explored ? 'Yes' : 'No'}</dd>
                {gmMode && <><dt>Roads</dt><dd>{hex.has_roads ? 'Yes' : 'No'}</dd></>}
                {gmMode && <><dt>Rivers</dt><dd>{hex.has_rivers ? 'Yes' : 'No'}</dd></>}
              </dl>

              {hex.pois.filter((p) => gmMode || !p.hidden).length > 0 && (
                <section>
                  <h3>Points of Interest</h3>
                  <ul className={styles.poiList}>
                    {hex.pois
                      .filter((p) => gmMode || !p.hidden)
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

              {factions.length > 0 && (
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
              )}

              {!gmMode && (hex.player_visible || hex.player_explored) && (
                <div className={styles.hexLabels}>
                  {(hex.player_visible || hex.player_explored) && (
                    <span className={styles.hexLabel}>
                      {hex.terrain_type.charAt(0).toUpperCase() + hex.terrain_type.slice(1)}
                    </span>
                  )}
                  {hex.has_roads && (
                    <span className={styles.hexLabel}>Roads</span>
                  )}
                  {hex.has_rivers && (
                    <span className={styles.hexLabel}>Rivers</span>
                  )}
                </div>
              )}

              {map?.map_type === 'regional' && hex.terrain_type === 'city' && hex.can_enter && hex.linked_map && (
                <button
                  className={styles.movePartyBtn}
                  onClick={() => navigate(`/map/${hex.linked_map}/${gmMode ? 'gm' : 'player'}`)}
                >
                  Enter the city
                </button>
              )}

              {children}
            </>
          )}
        </>
      )}
      </div>
      {gmMode && hex && map && (
        <div className={styles.movePartyRow}>
          {movePartyMutation.isError && (
            <span className={styles.error}>
              {(movePartyMutation.error as { detail?: string })?.detail ?? 'Move failed.'}
            </span>
          )}
          <button
            className={styles.highlightBtn}
            disabled={highlightMutation.isPending}
            onClick={() => highlightMutation.mutate(highlightedHexId === hex.id ? null : hex.id)}
          >
            {highlightedHexId === hex.id ? 'Clear highlight' : 'Highlight for players'}
          </button>
          {party && mapId != null && (
            <button
              className={styles.movePartyBtn}
              onClick={() => setGmActionModalOpen(true)}
            >
              Actions…
            </button>
          )}
          {party && hex.id !== party.current_hex && (
            <button
              className={styles.movePartyBtn}
              disabled={movePartyMutation.isPending}
              onClick={() => movePartyMutation.mutate()}
            >
              {movePartyMutation.isPending ? 'Moving…' : 'Move party here'}
            </button>
          )}
        </div>
      )}
      {!gmMode && party && partyHexFactions.length > 0 && (
        <div className={styles.factionPresence}>
          <div className={styles.factionPresenceTitle}>Factions Present</div>
          {partyHexFactions.map((f) => (
            <div key={f.id} className={styles.factionPresenceRow}>
              <span className={styles.factionPresenceDot} style={{ background: f.color }} />
              <span className={styles.factionPresenceName}>{f.name}</span>
              <button
                className={styles.interactBtn}
                onClick={() => f.image != null ? publishFactionImageMutation.mutate(f.image) : setInteractFaction(f)}
              >
                Interact
              </button>
            </div>
          ))}
        </div>
      )}

      {interactFaction && (
        <InteractModal faction={interactFaction} onClose={() => setInteractFaction(null)} />
      )}

      {gmActionModalOpen && party && hex && mapId != null && (
        <ActionModal
          party={party}
          selectedHex={hex}
          originHex={hexes.find((h) => h.id === party.current_hex) ?? null}
          mapId={mapId}
          tickNumber={tickNumber}
          onSuccess={() => setGmActionModalOpen(false)}
          onClose={() => setGmActionModalOpen(false)}
        />
      )}

      <div className={styles.lastMoveSection}>
        <div className={styles.lastMoveSectionTitle}>Last Action Result</div>
        {moveResult ? (
          <dl className={styles.lastMoveStats}>
            <dt>Action</dt><dd style={{textTransform: 'capitalize'}}>{moveResult.action}</dd>
            <dt>Navigation</dt>
            <dd className={moveResult.lost ? styles.lostValue : styles.safeValue}>
              {moveResult.lost ? 'Lost' : 'On course'}
              {!moveResult.lost && moveResult.lost_roll === null && moveResult.lost !== null && (
                <span className={styles.skippedNote}> (Skipped)</span>
              )}
            </dd>
            <dt>Event</dt><dd>{moveResult.wilderness_event}</dd>
          </dl>
        ) : (
          <p className={styles.lastMoveEmpty}>No action yet.</p>
        )}
      </div>

      {party && gmMode && (
        <div className={styles.partyFooter}>
          <div className={styles.partyFooterTitle}>
            Party
            {gmMode && !partyEditing && (
              <button
                className={styles.editBtn}
                onClick={() => {
                  setPartyDraft({
                    player_count: party.player_count,
                    supplies: party.supplies,
                    tracks_supplies: party.tracks_supplies,
                    speed: party.speed,
                    max_speed: party.max_speed,
                    resource_generation: party.resource_generation,
                    current_action: party.current_action ?? '',
                  });
                  setPartyEditing(true);
                }}
              >
                Edit
              </button>
            )}
          </div>
          {partyEditing && partyDraft ? (
            <div className={styles.editForm}>
              <label className={styles.fieldLabel}>
                <span className={styles.fieldName}>Players</span>
                <input className={styles.input} type="number" value={partyDraft.player_count}
                  onChange={(e) => setPartyDraft((d) => d && { ...d, player_count: Number(e.target.value) })} />
              </label>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={partyDraft.tracks_supplies}
                  onChange={(e) => setPartyDraft((d) => d && { ...d, tracks_supplies: e.target.checked })}
                />
                Track supplies
              </label>
              {partyDraft.tracks_supplies && (
                <label className={styles.fieldLabel}>
                  <span className={styles.fieldName}>Supplies</span>
                  <input className={styles.input} type="number" value={partyDraft.supplies}
                    onChange={(e) => setPartyDraft((d) => d && { ...d, supplies: Number(e.target.value) })} />
                </label>
              )}
              <label className={styles.fieldLabel}>
                <span className={styles.fieldName}>Speed</span>
                <input className={styles.input} type="number" value={partyDraft.speed}
                  onChange={(e) => setPartyDraft((d) => d && { ...d, speed: Number(e.target.value) })} />
              </label>
              <label className={styles.fieldLabel}>
                <span className={styles.fieldName}>Max speed</span>
                <input className={styles.input} type="number" value={partyDraft.max_speed}
                  onChange={(e) => setPartyDraft((d) => d && { ...d, max_speed: Number(e.target.value) })} />
              </label>
              <label className={styles.fieldLabel}>
                <span className={styles.fieldName}>Resource gen</span>
                <input className={styles.input} type="number" value={partyDraft.resource_generation}
                  onChange={(e) => setPartyDraft((d) => d && { ...d, resource_generation: Number(e.target.value) })} />
              </label>
              <label className={styles.fieldLabel}>
                <span className={styles.fieldName}>Action</span>
                <select className={styles.select} value={partyDraft.current_action}
                  onChange={(e) => setPartyDraft((d) => d && { ...d, current_action: e.target.value })}>
                  <option value="">—</option>
                  {ACTION_TYPES.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </label>
              <div className={styles.editActions}>
                <button
                  className={styles.saveBtn}
                  disabled={partyMutation.isPending}
                  onClick={() => partyMutation.mutate(partyDraft)}
                >
                  {partyMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                <button className={styles.cancelBtn} onClick={() => { setPartyEditing(false); setPartyDraft(null); }}>
                  Cancel
                </button>
              </div>
              {partyMutation.isError && <p className={styles.error}>Save failed.</p>}
            </div>
          ) : (
            <>
              <dl className={styles.partyStats}>
                <dt>Players</dt><dd>{party.player_count}</dd>
                {party.tracks_supplies && <><dt>Supplies</dt><dd>{party.supplies}</dd></>}
                <dt>Hex</dt><dd>{party.current_hex ?? '—'}</dd>
                <dt>Destination</dt><dd>{party.destination ?? '—'}</dd>
                <dt>Speed</dt><dd>{party.speed} / {party.max_speed}</dd>
                <dt>Action</dt><dd>{party.current_action ?? '—'}</dd>
              </dl>
              {party.is_lost && (
                <button
                  className={styles.clearLostBtn}
                  disabled={clearLostMutation.isPending}
                  onClick={() => clearLostMutation.mutate()}
                >
                  {clearLostMutation.isPending ? 'Clearing…' : 'Clear Lost (spend terrain cost)'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
