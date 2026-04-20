import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getMap, getHexes, getFactions } from '../../api/maps';
import { HexMap } from '../../components/HexMap/HexMap';
import { HexModal } from '../../components/HexModal/HexModal';
import { TickControls } from '../../components/TickControls/TickControls';
import { EventLog } from '../../components/EventLog/EventLog';
import { useGameStore } from '../../store/useGameStore';
import styles from './GMPage.module.css';

export function GMPage() {
  const { mapId } = useParams<{ mapId: string }>();
  const id = Number(mapId);

  const setSelectedMapId = useGameStore((s) => s.setSelectedMapId);
  const selectedHexId = useGameStore((s) => s.selectedHexId);
  const setSelectedHexId = useGameStore((s) => s.setSelectedHexId);

  // keep store in sync if user navigates directly via URL
  if (useGameStore.getState().selectedMapId !== id) setSelectedMapId(id);

  const { data: map } = useQuery({ queryKey: ['map', id], queryFn: () => getMap(id) });
  const { data: hexes = [] } = useQuery({ queryKey: ['hexes', id], queryFn: () => getHexes(id) });
  const { data: factions = [] } = useQuery({ queryKey: ['factions', id], queryFn: () => getFactions(id) });

  const selectedHex = hexes.find((h) => h.id === selectedHexId) ?? null;
  const hexFactions = factions.filter((f) => f.current_hex === selectedHexId);

  if (!map) return <div className={styles.status}>Loading…</div>;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <span className={styles.title}>{map.name} — GM</span>
        <button
          className={styles.popout}
          onClick={() => window.open(`/map/${id}/player`, '_blank', 'width=1024,height=768')}
        >
          Player View ↗
        </button>
      </header>

      <HexMap
        map={map}
        hexes={hexes}
        factions={factions}
        selectedHexId={selectedHexId}
        fogOfWar={false}
        onHexClick={setSelectedHexId}
      />

      <TickControls />

      {selectedHex && (
        <HexModal
          hex={selectedHex}
          factions={hexFactions}
          gmMode={true}
          onClose={() => setSelectedHexId(null)}
        />
      )}

      <EventLog />
    </div>
  );
}
