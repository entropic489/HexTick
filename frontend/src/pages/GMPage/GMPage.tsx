import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { getMap, getHexes, getFactions, getParty } from '../../api/maps';
import { getCurrentTick } from '../../api/tick';
import { HexMap } from '../../components/HexMap/HexMap';
import { HexPanel } from '../../components/HexPanel/HexPanel';
import { TickControls } from '../../components/TickControls/TickControls';
import { EventLog } from '../../components/EventLog/EventLog';
import { TimeOfDayBadge } from '../../components/TimeOfDayBadge/TimeOfDayBadge';
import { useGameStore } from '../../store/useGameStore';
import { useTickStream } from '../../hooks/useTickStream';
import styles from './GMPage.module.css';

export function GMPage() {
  const { mapId } = useParams<{ mapId: string }>();
  const id = Number(mapId);

  const setSelectedMapId = useGameStore((s) => s.setSelectedMapId);
  const selectedHexId = useGameStore((s) => s.selectedHexId);
  const setSelectedHexId = useGameStore((s) => s.setSelectedHexId);
  const prepMode = useGameStore((s) => s.prepMode);
  const setPrepMode = useGameStore((s) => s.setPrepMode);
  const navigate = useNavigate();

  // keep store in sync if user navigates directly via URL
  if (useGameStore.getState().selectedMapId !== id) setSelectedMapId(id);

  useTickStream(id);

  const { data: map } = useQuery({ queryKey: ['map', id], queryFn: () => getMap(id) });
  const { data: hexes = [] } = useQuery({ queryKey: ['hexes', id], queryFn: () => getHexes(id) });
  const { data: factions = [] } = useQuery({ queryKey: ['factions', id], queryFn: () => getFactions(id) });
  const { data: party } = useQuery({ queryKey: ['party', id], queryFn: () => getParty(id) });
  const { data: tickData } = useQuery({ queryKey: ['currentTick', id], queryFn: () => getCurrentTick(id) });

  const selectedHex = hexes.find((h) => h.id === selectedHexId) ?? null;
  const hexFactions = factions.filter((f) => f.current_hex === selectedHexId);
  const partyHexId = party?.current_hex ?? null;
  console.log('partyHexId', partyHexId, 'party', party);

  if (!map) return <div className={styles.status}>Loading…</div>;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <span className={styles.title}>{map.name} — GM</span>
        {tickData && <TimeOfDayBadge tickNumber={tickData.tick_number} />}
        <button
          className={`${styles.modeToggle} ${prepMode ? styles.modePrep : styles.modePlay}`}
          onClick={() => setPrepMode(!prepMode)}
        >
          {prepMode ? 'Play' : 'Prep'}
        </button>
        <button
          className={styles.addFactionBtn}
          onClick={() => navigate(`/map/${id}/factions`)}
        >
          Factions
        </button>
        <button
          className={styles.addFactionBtn}
          onClick={() => navigate(`/map/${id}/knowledge`)}
        >
          Knowledge
        </button>
        <button
          className={styles.addFactionBtn}
          onClick={() => navigate(`/map/${id}/characters`)}
        >
          Characters
        </button>
        <button
          className={styles.popout}
          onClick={() => window.open(`/map/${id}/player`, '_blank', 'width=1024,height=768')}
        >
          Player View ↗
        </button>
      </header>

      <div className={styles.body}>
        <div className={styles.mapArea}>
          <HexMap
            map={map}
            hexes={hexes}
            factions={factions}
            selectedHexId={selectedHexId}
            fogOfWar={false}
            partyHexId={partyHexId}
            onHexClick={setSelectedHexId}
          />
          <TickControls />
        </div>
        <HexPanel
          hex={selectedHex}
          hexes={hexes}
          factions={hexFactions}
          gmMode={true}
          prepMode={prepMode}
          mapId={id}
          party={party}
          onClose={() => setSelectedHexId(null)}
        />
      </div>

      <EventLog />
    </div>
  );
}
