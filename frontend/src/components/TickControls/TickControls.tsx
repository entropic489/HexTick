import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { postTick, getTickNumbers, getTickState, resetToTick } from '../../api/tick';
import { patchMapLocked, patchMapWeather } from '../../api/maps';
import { useGameStore } from '../../store/useGameStore';
import { WeatherIcon } from '../WeatherIcon/WeatherIcon';
import type { Map, WeatherType } from '../../types';
import styles from './TickControls.module.css';

const WEATHER_TYPES: WeatherType[] = ['fair', 'overcast', 'inclement', 'extreme', 'catastrophic'];

interface Props {
  map: Map;
}

export function TickControls({ map }: Props) {
  const mapId = map.id;
  const setPendingEvents = useGameStore((s) => s.setPendingEvents);
  const viewingTickNumber = useGameStore((s) => s.viewingTickNumber);
  const setViewingTickNumber = useGameStore((s) => s.setViewingTickNumber);
  const qc = useQueryClient();
  const [stagedWeather, setStagedWeather] = useState<WeatherType | null>(null);

  const displayedWeather = stagedWeather ?? map.weather;
  const currentIdx = WEATHER_TYPES.indexOf(displayedWeather);

  const { data: currentTickData } = useQuery({
    queryKey: ['currentTick', mapId],
    queryFn: () => import('../../api/tick').then((m) => m.getCurrentTick(mapId)),
    enabled: !!mapId,
  });

  const { data: tickNumbers = [] } = useQuery({
    queryKey: ['tickNumbers', mapId],
    queryFn: () => getTickNumbers(mapId),
    enabled: !!mapId,
  });

  const currentTickNumber = currentTickData?.tick_number ?? 0;
  const isViewingHistory = viewingTickNumber !== null;
  const displayedTick = isViewingHistory ? viewingTickNumber : currentTickNumber;
  const canGoBack = tickNumbers.length > 0 && displayedTick > tickNumbers[0];
  const canGoForward = isViewingHistory && displayedTick < currentTickNumber;

  const enterHistory = (targetTick: number) => {
    setViewingTickNumber(targetTick);
    patchMapLocked(mapId, true).then(() => {
      qc.invalidateQueries({ queryKey: ['map', mapId] });
    });
  };

  const exitHistory = () => {
    setViewingTickNumber(null);
    patchMapLocked(mapId, false).then(() => {
      qc.invalidateQueries({ queryKey: ['map', mapId] });
    });
  };

  const goBack = () => {
    const sorted = [...tickNumbers].sort((a, b) => a - b);
    const idx = sorted.indexOf(displayedTick);
    if (idx > 0) enterHistory(sorted[idx - 1]);
    else if (!isViewingHistory && sorted.length > 0) enterHistory(sorted[sorted.length - 1]);
  };

  const goForward = () => {
    const sorted = [...tickNumbers].sort((a, b) => a - b);
    const idx = sorted.indexOf(displayedTick);
    if (idx >= 0 && idx < sorted.length - 1) {
      const next = sorted[idx + 1];
      if (next >= currentTickNumber) exitHistory();
      else setViewingTickNumber(next);
    } else {
      exitHistory();
    }
  };

  const { mutate: advanceTick, isPending } = useMutation({
    mutationFn: postTick,
    onSuccess: (data) => {
      setPendingEvents(data.events);
      qc.invalidateQueries({ queryKey: ['hexes', mapId] });
      qc.invalidateQueries({ queryKey: ['factions', mapId] });
      qc.invalidateQueries({ queryKey: ['tickNumbers', mapId] });
      qc.setQueryData(['currentTick', mapId], { tick_number: data.tick_number });
    },
  });

  const { mutate: doReset, isPending: isResetting } = useMutation({
    mutationFn: () => resetToTick(mapId, viewingTickNumber!),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hexes', mapId] });
      qc.invalidateQueries({ queryKey: ['factions', mapId] });
      qc.invalidateQueries({ queryKey: ['tickNumbers', mapId] });
      qc.setQueryData(['currentTick', mapId], { tick_number: data.tick_number });
      exitHistory();
    },
  });

  const { mutate: confirmWeather, isPending: isSavingWeather } = useMutation({
    mutationFn: () => patchMapWeather(mapId, stagedWeather!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['map', mapId] });
      setStagedWeather(null);
    },
  });

  // Prefetch historical state when viewing history so GMPage can read from cache
  useQuery({
    queryKey: ['tickState', mapId, viewingTickNumber],
    queryFn: () => getTickState(mapId, viewingTickNumber!),
    enabled: isViewingHistory,
    staleTime: Infinity,
  });

  const tick = (mode: 'shift' | 'day') => {
    advanceTick({ map_id: mapId, mode });
  };

  const cycleWeather = (dir: -1 | 1) => {
    const nextIdx = (currentIdx + dir + WEATHER_TYPES.length) % WEATHER_TYPES.length;
    const next = WEATHER_TYPES[nextIdx];
    setStagedWeather(next === map.weather ? null : next);
  };

  const isDirty = stagedWeather !== null && stagedWeather !== map.weather;

  return (
    <div className={styles.controls}>
      <button onClick={goBack} disabled={isPending || !canGoBack} className={styles.reverse}>
        ◀ Shift
      </button>
      {isViewingHistory && (
        <>
          <span className={styles.historyLabel}>Tick {displayedTick}</span>
          <button onClick={goForward} disabled={!canGoForward}>
            ▶
          </button>
          <button onClick={exitHistory} className={styles.liveBtn}>
            ▶ Live
          </button>
          <button
            onClick={() => doReset()}
            disabled={isResetting}
            className={styles.resetBtn}
          >
            Reset to this tick
          </button>
        </>
      )}
      {!isViewingHistory && (
        <>
          <button onClick={() => tick('shift')} disabled={isPending}>
            Shift ▶
          </button>
          <button onClick={() => tick('day')} disabled={isPending} className={styles.day}>
            Day ▶▶
          </button>
        </>
      )}

      <div className={styles.weatherControl}>
        {isDirty && (
          <button
            className={styles.weatherConfirm}
            onClick={() => confirmWeather()}
            disabled={isSavingWeather}
          >
            Set
          </button>
        )}
        <button className={styles.weatherArrow} onClick={() => cycleWeather(-1)} title="Previous weather">◀</button>
        <span className={`${styles.weatherDisplay} ${isDirty ? styles.weatherDirty : ''}`}>
          <WeatherIcon weather={displayedWeather} size={18} />
          <span className={styles.weatherName}>
            {displayedWeather.charAt(0).toUpperCase() + displayedWeather.slice(1)}
          </span>
        </span>
        <button className={styles.weatherArrow} onClick={() => cycleWeather(1)} title="Next weather">▶</button>
      </div>
    </div>
  );
}
