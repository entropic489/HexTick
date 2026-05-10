import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getMap, getHexes, getFactions, getParty } from '../../api/maps';
import { getCurrentTick } from '../../api/tick';
import { HexMap } from '../../components/HexMap/HexMap';
import { HexPanel } from '../../components/HexPanel/HexPanel';
import { EventLog } from '../../components/EventLog/EventLog';
import { ActionModal } from '../../components/ActionModal/ActionModal';
import { TimeOfDayBadge } from '../../components/TimeOfDayBadge/TimeOfDayBadge';
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

  const playerFaction = factions.find((f) => f.is_player_faction) ?? null;
  const selectedHex = hexes.find((h) => h.id === selectedHexId) ?? null;

  if (!map) return <div className={styles.status}>Loading…</div>;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <span className={styles.title}>{map.name}</span>
        {tickData && <TimeOfDayBadge tickNumber={tickData.tick_number} />}
        {playerFaction && (
          <span className={styles.speed}>
            Speed: {playerFaction.max_speed} | Hex: {playerFaction.current_hex ?? '—'}
          </span>
        )}
      </header>

      <div className={styles.body}>
        <div className={styles.mapArea}>
          <HexMap
            map={map}
            hexes={hexes}
            factions={factions.filter((f) => f.is_player_faction)}
            selectedHexId={selectedHexId}
            fogOfWar={map.fog_of_war}
            partyHexId={party?.current_hex ?? null}
            onHexClick={setSelectedHexId}
          />
        </div>
        <HexPanel
          hex={selectedHex}
          factions={selectedHex ? factions.filter((f) => f.current_hex === selectedHex.id) : []}
          gmMode={false}
          party={party}
          onClose={() => setSelectedHexId(null)}
        >
          {selectedHex && party && (
            <button
              className={styles.moveBtn}
              onClick={() => setActionModalOpen(true)}
            >
              Actions…
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
    </div>
  );
}
