import { useState, useEffect, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Hex, Faction, Party } from '../../types';
import { postHighlightHex } from '../../api/maps';
import { useGameStore } from '../../store/useGameStore';
import { patchParty } from '../../api/tick';
import { publishGalleryImage } from '../../api/gallery';
import { ActionModal } from '../ActionModal/ActionModal';
import { PoiList } from './PoiList';
import { HexEditForm } from './HexEditForm';
import { PartyFooter } from './PartyFooter';
import { FactionDetail } from './FactionDetail';
import styles from './HexPanel.module.css';


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
  const highlightedHexId = useGameStore((s) => s.highlightedHexId);
  const setHighlightedHexId = useGameStore((s) => s.setHighlightedHexId);
  const moveResult = useGameStore((s) => s.moveResult);
  const [editing, setEditing] = useState(false);
  const [interactFaction, setInteractFaction] = useState<Faction | null>(null);
  const [gmActionModalOpen, setGmActionModalOpen] = useState(false);

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

  const publishFactionImageMutation = useMutation({
    mutationFn: (imageId: number) => publishGalleryImage(imageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gallery', map?.id] }),
  });

  useEffect(() => {
    setEditing(hex ? prepMode : false);
  }, [hex?.id, prepMode]);

  function handleEdit() {
    setEditing(true);
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

          {editing ? (
            <HexEditForm
              hex={hex}
              hexes={hexes}
              mapId={mapId}
              map={map}
              onCancel={() => setEditing(prepMode)}
              onSaved={() => setEditing(prepMode)}
            />
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

              <PoiList pois={hex.pois} gmMode={gmMode} />

              <FactionDetail
                factions={factions}
                hexes={hexes}
                gmMode={gmMode}
                party={party}
                mapId={mapId}
                map={map}
              />

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

      {party && gmMode && <PartyFooter party={party} />}
    </aside>
  );
}
