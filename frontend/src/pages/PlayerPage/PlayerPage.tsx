import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getMap, getHexes, getFactions, getParty } from '../../api/maps';
import { getGallery } from '../../api/gallery';
import { getCurrentTick } from '../../api/tick';
import { HexMap } from '../../components/HexMap/HexMap';
import { HexPanel } from '../../components/HexPanel/HexPanel';
import { EventLog } from '../../components/EventLog/EventLog';
import { ActionModal } from '../../components/ActionModal/ActionModal';
import { TimeOfDayBadge } from '../../components/TimeOfDayBadge/TimeOfDayBadge';
import { ShiftActionsIndicator } from '../../components/ShiftActionsIndicator/ShiftActionsIndicator';
import { useGameStore } from '../../store/useGameStore';
import { useTickStream } from '../../hooks/useTickStream';
import styles from './PlayerPage.module.css';

export function PlayerPage() {
  const { mapId } = useParams<{ mapId: string }>();
  const id = Number(mapId);

  const selectedHexId = useGameStore((s) => s.selectedHexId);
  const setSelectedHexId = useGameStore((s) => s.setSelectedHexId);

  const [actionModalOpen, setActionModalOpen] = useState(false);

  useTickStream(id);

  const { data: map } = useQuery({ queryKey: ['map', id], queryFn: () => getMap(id) });
  const { data: hexes = [] } = useQuery({ queryKey: ['hexes', id], queryFn: () => getHexes(id) });
  const { data: factions = [] } = useQuery({ queryKey: ['factions', id], queryFn: () => getFactions(id) });
  const { data: party } = useQuery({ queryKey: ['party', id], queryFn: () => getParty(id) });
  const { data: tickData } = useQuery({ queryKey: ['currentTick', id], queryFn: () => getCurrentTick(id) });
  const { data: gallery = [] } = useQuery({ queryKey: ['gallery', id], queryFn: () => getGallery(id) });

  const publishedImage = gallery.find((img) => img.is_published) ?? null;
  const playerFaction = factions.find((f) => f.is_player_faction) ?? null;
  const selectedHex = hexes.find((h) => h.id === selectedHexId) ?? null;
  const partyHexFactions = party?.current_hex != null
    ? factions.filter((f) => f.current_hex === party.current_hex && !f.is_player_faction)
    : [];

  if (!map) return <div className={styles.status}>Loading…</div>;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        {tickData && <TimeOfDayBadge tickNumber={tickData.tick_number} />}
        <span className={styles.title}>{map.name}</span>
        <ShiftActionsIndicator map={map} />
        {playerFaction && (
          <span className={styles.speed}>
            Speed: {playerFaction.max_speed} | Hex: {playerFaction.current_hex ?? '—'}
          </span>
        )}
        <span className={`${styles.lockIndicator} ${map.player_actions_locked ? styles.lockRed : styles.lockGreen}`}>
          {map.player_actions_locked ? (
            <>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="7" width="10" height="8" rx="1.5" fill="currentColor" opacity="0.9"/>
                <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                <circle cx="8" cy="11" r="1.2" fill="#1e1e2e"/>
              </svg>
              GM Locked
            </>
          ) : (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="7" width="10" height="8" rx="1.5" fill="currentColor" opacity="0.6"/>
              <path d="M5 7V5a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <circle cx="8" cy="11" r="1.2" fill="#1e1e2e"/>
            </svg>
          )}
        </span>
      </header>

      <div className={styles.body}>
        <div className={styles.mapArea}>
          <HexMap
            map={map}
            hexes={hexes}
            factions={factions
              .filter((f) => {
                if (f.current_hex == null) return false;
                const hex = hexes.find((h) => h.id === f.current_hex);
                return hex?.player_visible ?? false;
              })
              .map((f) => ({ ...f, destination: null }))}
            selectedHexId={selectedHexId}
            fogOfWar={map.fog_of_war}
            partyHexId={party?.current_hex ?? null}
            focusHex={party?.current_hex != null ? (hexes.find((h) => h.id === party.current_hex) ?? null) : null}
            onHexClick={setSelectedHexId}
          />
        </div>
        <HexPanel
          hex={selectedHex}
          factions={selectedHex ? factions.filter((f) => f.current_hex === selectedHex.id) : []}
          partyHexFactions={partyHexFactions}
          gmMode={false}
          map={map}
          party={party}
          onClose={() => setSelectedHexId(null)}
        >
          {selectedHex && party && (
            <button
              className={styles.moveBtn}
              onClick={() => setActionModalOpen(true)}
              disabled={map.player_actions_locked}
              title={map.player_actions_locked ? 'The GM has locked player actions' : undefined}
            >
              {map.player_actions_locked ? 'Locked' : 'Actions…'}
            </button>
          )}
        </HexPanel>
      </div>

      <EventLog />

      {actionModalOpen && selectedHex && party && (
        <ActionModal
          party={party}
          selectedHex={selectedHex}
          mapId={id}
          onSuccess={() => {
            setActionModalOpen(false);
            setSelectedHexId(null);
          }}
          onClose={() => setActionModalOpen(false)}
        />
      )}

      {publishedImage && (
        <div className={styles.imageOverlay}>
          <img className={styles.overlayImage} src={publishedImage.image} alt={publishedImage.name} />
        </div>
      )}
    </div>
  );
}
