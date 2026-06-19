import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { getMap, getHexes, getFactions, getParty, patchMapLocked, postHighlightHex } from '../../api/maps';
import { getGallery, publishGalleryImage } from '../../api/gallery';
import { getCurrentTick, getTickState } from '../../api/tick';
import { HexMap } from '../../components/HexMap/HexMap';
import { HexPanel } from '../../components/HexPanel/HexPanel';
import { BulkHexPanel } from '../../components/BulkHexPanel/BulkHexPanel';
import { TickControls } from '../../components/TickControls/TickControls';
import { EventLog } from '../../components/EventLog/EventLog';
import { TimeOfDayBadge } from '../../components/TimeOfDayBadge/TimeOfDayBadge';
import { ShiftActionsIndicator } from '../../components/ShiftActionsIndicator/ShiftActionsIndicator';
import { useGameStore } from '../../store/useGameStore';
import { useTickStream } from '../../hooks/useTickStream';
import { NPCModal } from '../../components/NPCModal/NPCModal';
import { MonsterModal } from '../../components/MonsterModal/MonsterModal';
import styles from './GMPage.module.css';

export function GMPage() {
  const { mapId } = useParams<{ mapId: string }>();
  const id = Number(mapId);
  const [npcOpen, setNpcOpen] = useState(false);
  const [monsterOpen, setMonsterOpen] = useState(false);
  const [randomHexId, setRandomHexId] = useState<number | null>(null);
  const [permanentUnlock, setPermanentUnlock] = useState(false);


  const setSelectedMapId = useGameStore((s) => s.setSelectedMapId);
  const viewingTickNumber = useGameStore((s) => s.viewingTickNumber);
  const selectedHexId = useGameStore((s) => s.selectedHexId);
  const setSelectedHexId = useGameStore((s) => s.setSelectedHexId);
  const prepMode = useGameStore((s) => s.prepMode);
  const setPrepMode = useGameStore((s) => s.setPrepMode);
  const multiSelectMode = useGameStore((s) => s.multiSelectMode);
  const setMultiSelectMode = useGameStore((s) => s.setMultiSelectMode);
  const selectedHexIds = useGameStore((s) => s.selectedHexIds);
  const toggleSelectedHex = useGameStore((s) => s.toggleSelectedHex);
  const factionHexSelectMode = useGameStore((s) => s.factionHexSelectMode);
  const factionAllowedHexIds = useGameStore((s) => s.factionAllowedHexIds);
  const toggleFactionAllowedHex = useGameStore((s) => s.toggleFactionAllowedHex);
  const highlightedHexId = useGameStore((s) => s.highlightedHexId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const lockMutation = useMutation({
    mutationFn: (locked: boolean) => patchMapLocked(id, locked),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['map', id] }),
  });

  const setHighlightedHexId = useGameStore((s) => s.setHighlightedHexId);
  const clearHighlightMutation = useMutation({
    mutationFn: () => postHighlightHex(id, null),
    onSuccess: () => setHighlightedHexId(null),
  });

// keep store in sync if user navigates directly via URL
  if (useGameStore.getState().selectedMapId !== id) setSelectedMapId(id);

  useTickStream(id);

  const { data: map } = useQuery({ queryKey: ['map', id], queryFn: () => getMap(id) });

  useEffect(() => {
    if (permanentUnlock && map?.player_actions_locked) {
      lockMutation.mutate(false);
    }
  }, [map?.player_actions_locked, permanentUnlock]);

  const { data: hexes = [] } = useQuery({ queryKey: ['hexes', id], queryFn: () => getHexes(id) });
  const { data: factions = [] } = useQuery({ queryKey: ['factions', id], queryFn: () => getFactions(id) });
  const { data: party } = useQuery({ queryKey: ['party', id], queryFn: () => getParty(id) });
  const { data: tickData } = useQuery({ queryKey: ['currentTick', id], queryFn: () => getCurrentTick(id) });
  const { data: gallery = [] } = useQuery({ queryKey: ['gallery', id], queryFn: () => getGallery(id) });
  const { data: historicalState } = useQuery({
    queryKey: ['tickState', id, viewingTickNumber],
    queryFn: () => getTickState(id, viewingTickNumber!),
    enabled: viewingTickNumber !== null,
    staleTime: Infinity,
  });

  const displayedHexes = viewingTickNumber !== null && historicalState
    ? hexes.map((h) => {
        const snap = historicalState.hex_ticks.find((ht) => ht.hex_id === h.id);
        if (!snap) return h;
        return { ...h, resources: snap.resources, weather: snap.weather as typeof h.weather, encounter_likelihood: snap.encounter_likelihood, player_explored: snap.player_explored, player_visible: snap.player_visible };
      })
    : hexes;

  const displayedFactions = viewingTickNumber !== null && historicalState
    ? factions.map((f) => {
        const snap = historicalState.faction_ticks.find((ft) => ft.faction_id === f.id);
        if (!snap) return f;
        return { ...f, speed: snap.speed, population: snap.population, technology: snap.technology, technology_max: snap.technology_max, resources: snap.resources, agreeableness: snap.agreeableness, combat_skill: snap.combat_skill, current_hex: snap.current_hex, destination: snap.destination, current_action: snap.action as typeof f.current_action };
      })
    : factions;

  const publishedImage = gallery.find((img) => img.is_published) ?? null;

  const unpublishMutation = useMutation({
    mutationFn: () => publishGalleryImage(publishedImage!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gallery', id] }),
  });

  const displayedParty = viewingTickNumber !== null && historicalState?.party_tick && party
    ? { ...party, current_hex: historicalState.party_tick.current_hex, destination: historicalState.party_tick.destination, current_action: historicalState.party_tick.action, last_action: historicalState.party_tick.last_action }
    : party;

  const selectedHex = displayedHexes.find((h) => h.id === selectedHexId) ?? null;
  const hexFactions = displayedFactions.filter((f) => f.current_hex === selectedHexId);
  const partyHexId = displayedParty?.current_hex ?? null;
  console.log('partyHexId', partyHexId, 'party', party);

  if (!map) return <div className={styles.status}>Loading…</div>;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        {tickData && <TimeOfDayBadge tickNumber={tickData.tick_number} />}
        <button
          className={`${styles.lockBtn} ${map.player_actions_locked ? styles.locked : permanentUnlock ? styles.permanentUnlock : styles.unlocked}`}
          onClick={() => {
            if (map.player_actions_locked) {
              lockMutation.mutate(false);
            } else if (permanentUnlock) {
              setPermanentUnlock(false);
              lockMutation.mutate(true);
            } else {
              setPermanentUnlock(true);
            }
          }}
          title={map.player_actions_locked ? 'Unlock player actions' : permanentUnlock ? 'Disable permanent unlock (lock)' : 'Enable permanent unlock'}
        >
          {map.player_actions_locked ? (
            // closed lock — red
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="7" width="10" height="8" rx="1.5" fill="currentColor" opacity="0.9"/>
              <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <circle cx="8" cy="11" r="1.2" fill="#1e1e2e"/>
            </svg>
          ) : permanentUnlock ? (
            // open lock with small infinity mark — yellow
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="7" width="10" height="8" rx="1.5" fill="currentColor" opacity="0.6"/>
              <path d="M5 7V5a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <text x="8" y="13" textAnchor="middle" fontSize="5" fill="#1e1e2e" fontWeight="bold">∞</text>
            </svg>
          ) : (
            // open lock — green
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
{highlightedHexId != null && (
          <button
            className={styles.unpublishBtn}
            onClick={() => clearHighlightMutation.mutate()}
            disabled={clearHighlightMutation.isPending}
          >
            Clear highlight
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
          onClick={() => setNpcOpen(true)}
        >
          NPC
        </button>
        <button
          className={styles.addFactionBtn}
          onClick={() => setMonsterOpen(true)}
        >
          Monster
        </button>
        <button
          className={styles.addFactionBtn}
          onClick={() => {
            const eligible = hexes.filter((h) => h.terrain_type !== 'ocean');
            if (eligible.length === 0) return;
            const pick = eligible[Math.floor(Math.random() * eligible.length)];
            setRandomHexId(pick.id);
          }}
        >
          Random Hex
        </button>
        {randomHexId !== null && (
          <button className={styles.addFactionBtn} onClick={() => setRandomHexId(null)}>
            Clear
          </button>
        )}
        <button
          className={styles.popout}
          onClick={() => window.open(`/map/${id}/player`, '_blank', 'width=1024,height=768')}
        >
          Player View ↗
        </button>
      </header>
      {npcOpen && <NPCModal onClose={() => setNpcOpen(false)} />}
      {monsterOpen && <MonsterModal onClose={() => setMonsterOpen(false)} />}

      <div className={styles.body}>
        <div className={styles.mapArea}>
          <HexMap
            map={map}
            hexes={displayedHexes}
            factions={displayedFactions}
            selectedHexId={multiSelectMode ? null : selectedHexId}
            selectedHexIds={multiSelectMode ? selectedHexIds : undefined}
            factionAllowedHexIds={factionHexSelectMode ? factionAllowedHexIds : undefined}
            randomHexId={randomHexId}
            fogOfWar={false}
            partyHexId={partyHexId}
            highlightedHexId={highlightedHexId}
            onHexClick={
              multiSelectMode ? toggleSelectedHex
              : factionHexSelectMode ? toggleFactionAllowedHex
              : setSelectedHexId
            }
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
            hexes={displayedHexes}
            factions={hexFactions}
            gmMode={true}
            prepMode={prepMode}
            mapId={id}
            map={map}
            party={displayedParty}
            onClose={() => setSelectedHexId(null)}
          />
        )}
      </div>

      <EventLog />
    </div>
  );
}
