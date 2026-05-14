import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { getMap, getHexes, getFactions, getParty, patchMapLocked } from '../../api/maps';
import { getGallery, publishGalleryImage } from '../../api/gallery';
import { getCurrentTick } from '../../api/tick';
import { HexMap } from '../../components/HexMap/HexMap';
import { HexPanel } from '../../components/HexPanel/HexPanel';
import { BulkHexPanel } from '../../components/BulkHexPanel/BulkHexPanel';
import { TickControls } from '../../components/TickControls/TickControls';
import { EventLog } from '../../components/EventLog/EventLog';
import { TimeOfDayBadge } from '../../components/TimeOfDayBadge/TimeOfDayBadge';
import { ShiftActionsIndicator } from '../../components/ShiftActionsIndicator/ShiftActionsIndicator';
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
  const multiSelectMode = useGameStore((s) => s.multiSelectMode);
  const setMultiSelectMode = useGameStore((s) => s.setMultiSelectMode);
  const selectedHexIds = useGameStore((s) => s.selectedHexIds);
  const toggleSelectedHex = useGameStore((s) => s.toggleSelectedHex);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const lockMutation = useMutation({
    mutationFn: (locked: boolean) => patchMapLocked(id, locked),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['map', id] }),
  });

  // keep store in sync if user navigates directly via URL
  if (useGameStore.getState().selectedMapId !== id) setSelectedMapId(id);

  useTickStream(id);

  const { data: map } = useQuery({ queryKey: ['map', id], queryFn: () => getMap(id) });
  const { data: hexes = [] } = useQuery({ queryKey: ['hexes', id], queryFn: () => getHexes(id) });
  const { data: factions = [] } = useQuery({ queryKey: ['factions', id], queryFn: () => getFactions(id) });
  const { data: party } = useQuery({ queryKey: ['party', id], queryFn: () => getParty(id) });
  const { data: tickData } = useQuery({ queryKey: ['currentTick', id], queryFn: () => getCurrentTick(id) });
  const { data: gallery = [] } = useQuery({ queryKey: ['gallery', id], queryFn: () => getGallery(id) });

  const publishedImage = gallery.find((img) => img.is_published) ?? null;

  const unpublishMutation = useMutation({
    mutationFn: () => publishGalleryImage(publishedImage!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gallery', id] }),
  });

  const selectedHex = hexes.find((h) => h.id === selectedHexId) ?? null;
  const hexFactions = factions.filter((f) => f.current_hex === selectedHexId);
  const partyHexId = party?.current_hex ?? null;
  console.log('partyHexId', partyHexId, 'party', party);

  if (!map) return <div className={styles.status}>Loading…</div>;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        {tickData && <TimeOfDayBadge tickNumber={tickData.tick_number} />}
        <button
          className={`${styles.lockBtn} ${map.player_actions_locked ? styles.locked : styles.unlocked}`}
          onClick={() => lockMutation.mutate(!map.player_actions_locked)}
          title={map.player_actions_locked ? 'Unlock player actions' : 'Lock player actions'}
        >
          {map.player_actions_locked ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="7" width="10" height="8" rx="1.5" fill="currentColor" opacity="0.9"/>
              <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <circle cx="8" cy="11" r="1.2" fill="#1e1e2e"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="7" width="10" height="8" rx="1.5" fill="currentColor" opacity="0.6"/>
              <path d="M5 7V5a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <circle cx="8" cy="11" r="1.2" fill="#1e1e2e"/>
            </svg>
          )}
        </button>
        <span className={styles.title}>{map.name} — GM</span>
        <ShiftActionsIndicator map={map} />
        <button
          className={`${styles.modeToggle} ${prepMode ? styles.modePrep : styles.modePlay}`}
          onClick={() => setPrepMode(!prepMode)}
        >
          {prepMode ? 'Play' : 'Prep'}
        </button>
        {prepMode && (
          <button
            className={`${styles.modeToggle} ${multiSelectMode ? styles.modePrep : ''}`}
            onClick={() => setMultiSelectMode(!multiSelectMode)}
          >
            {multiSelectMode && selectedHexIds.size > 0
              ? `Multi (${selectedHexIds.size})`
              : 'Multi'}
          </button>
        )}
        {publishedImage && (
          <button
            className={styles.unpublishBtn}
            onClick={() => unpublishMutation.mutate()}
            disabled={unpublishMutation.isPending}
          >
            Unpublish
          </button>
        )}
        <button
          className={styles.addFactionBtn}
          onClick={() => navigate(`/map/${id}/gallery`)}
        >
          Gallery
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
            selectedHexId={multiSelectMode ? null : selectedHexId}
            selectedHexIds={multiSelectMode ? selectedHexIds : undefined}
            fogOfWar={false}
            partyHexId={partyHexId}
            onHexClick={multiSelectMode ? toggleSelectedHex : setSelectedHexId}
          />
          <TickControls />
        </div>
        {multiSelectMode ? (
          <BulkHexPanel
            hexIds={[...selectedHexIds]}
            hexes={hexes}
            mapId={id}
            onDone={() => setMultiSelectMode(false)}
          />
        ) : (
          <HexPanel
            hex={selectedHex}
            hexes={hexes}
            factions={hexFactions}
            gmMode={true}
            prepMode={prepMode}
            mapId={id}
            map={map}
            party={party}
            onClose={() => setSelectedHexId(null)}
          />
        )}
      </div>

      <EventLog />
    </div>
  );
}
