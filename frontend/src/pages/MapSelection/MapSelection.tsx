import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getMaps, duplicateMap } from '../../api/maps';

import { useGameStore } from '../../store/useGameStore';
import styles from './MapSelection.module.css';

export function MapSelection() {
  const navigate = useNavigate();
  const setSelectedMapId = useGameStore((s) => s.setSelectedMapId);
  const queryClient = useQueryClient();

  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [dupName, setDupName] = useState('');

  const { data: maps, isLoading, error } = useQuery({
    queryKey: ['maps'],
    queryFn: getMaps,
  });

  const dupMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => duplicateMap(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maps'] });
      setDuplicatingId(null);
      setDupName('');
    },
  });

  const loadMap = (id: number, mode: 'gm' | 'player') => {
    setSelectedMapId(id);
    navigate(`/map/${id}/${mode}`);
  };

  const startDuplicate = (id: number, name: string) => {
    setDuplicatingId(id);
    setDupName(`${name} (copy)`);
  };

  const cancelDuplicate = () => {
    setDuplicatingId(null);
    setDupName('');
  };

  if (isLoading) return <div className={styles.status}>Loading maps…</div>;
  if (error) return <div className={styles.status}>Failed to load maps.</div>;

  return (
    <div className={styles.page}>
      <h1>HexTick</h1>
      <p className={styles.sub}>Select a map to begin</p>
      <button className={styles.create} onClick={() => navigate('/maps/create')}>
        + Create Map
      </button>
      <ul className={styles.list}>
        {maps?.map((m) => (
          <li key={m.id} className={styles.card}>
            {duplicatingId === m.id ? (
              <div className={styles.dupRow}>
                <input
                  className={styles.dupInput}
                  value={dupName}
                  onChange={(e) => setDupName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && dupName.trim()) dupMutation.mutate({ id: m.id, name: dupName.trim() });
                    if (e.key === 'Escape') cancelDuplicate();
                  }}
                />
                <button
                  disabled={!dupName.trim() || dupMutation.isPending}
                  onClick={() => dupMutation.mutate({ id: m.id, name: dupName.trim() })}
                >
                  {dupMutation.isPending ? 'Duplicating…' : 'Confirm'}
                </button>
                <button onClick={cancelDuplicate}>Cancel</button>
              </div>
            ) : (
              <>
                <span className={styles.name}>{m.name}</span>
                <div className={styles.actions}>
                  <button onClick={() => loadMap(m.id, 'gm')}>GM View</button>
                  <button
                    className={styles.player}
                    onClick={() => {
                      setSelectedMapId(m.id);
                      window.open(`/map/${m.id}/player`, '_blank', 'width=1024,height=768');
                    }}
                  >
                    Player View ↗
                  </button>
                  <button onClick={() => startDuplicate(m.id, m.name)}>Duplicate</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
