import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getMap, getHexes, getFactions } from '../../api/maps';
import { postPartyAction } from '../../api/tick';
import { HexMap } from '../../components/HexMap/HexMap';
import { HexModal } from '../../components/HexModal/HexModal';
import { EventLog } from '../../components/EventLog/EventLog';
import { useGameStore } from '../../store/useGameStore';
import styles from './PlayerPage.module.css';

export function PlayerPage() {
  const { mapId } = useParams<{ mapId: string }>();
  const id = Number(mapId);
  const qc = useQueryClient();

  const selectedHexId = useGameStore((s) => s.selectedHexId);
  const setSelectedHexId = useGameStore((s) => s.setSelectedHexId);
  const setPendingEvents = useGameStore((s) => s.setPendingEvents);

  const { data: map } = useQuery({ queryKey: ['map', id], queryFn: () => getMap(id) });
  const { data: hexes = [] } = useQuery({ queryKey: ['hexes', id], queryFn: () => getHexes(id) });
  const { data: factions = [] } = useQuery({ queryKey: ['factions', id], queryFn: () => getFactions(id) });

  const playerFaction = factions.find((f) => f.is_player_faction) ?? null;

  const { mutate: move, isPending: isMoving } = useMutation({
    mutationFn: (hexId: number) => postPartyAction(playerFaction!.id, { action: 'move', hex_id: hexId }),
    onSuccess: (data) => {
      setPendingEvents(data.events);
      qc.invalidateQueries({ queryKey: ['hexes', id] });
      qc.invalidateQueries({ queryKey: ['factions', id] });
      setSelectedHexId(null);
    },
  });

  const selectedHex = hexes.find((h) => h.id === selectedHexId) ?? null;

  if (!map) return <div className={styles.status}>Loading…</div>;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <span className={styles.title}>{map.name}</span>
        {playerFaction && (
          <span className={styles.speed}>
            Speed: {playerFaction.max_speed} | Hex: {playerFaction.current_hex ?? '—'}
          </span>
        )}
      </header>

      <HexMap
        map={map}
        hexes={hexes}
        factions={factions.filter((f) => f.is_player_faction)}
        selectedHexId={selectedHexId}
        fogOfWar={true}
        onHexClick={setSelectedHexId}
      />

      {selectedHex && (
        <HexModal
          hex={selectedHex}
          factions={[]}
          gmMode={false}
          onClose={() => setSelectedHexId(null)}
        >
          {playerFaction && selectedHex.player_visible && (
            <button
              className={styles.moveBtn}
              disabled={isMoving}
              onClick={() => move(selectedHex.id)}
            >
              Move here (1 shift)
            </button>
          )}
        </HexModal>
      )}

      <EventLog />
    </div>
  );
}
