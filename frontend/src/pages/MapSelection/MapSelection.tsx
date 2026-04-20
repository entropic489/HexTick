import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getMaps } from '../../api/maps';

import { useGameStore } from '../../store/useGameStore';
import styles from './MapSelection.module.css';

export function MapSelection() {
  const navigate = useNavigate();
  const setSelectedMapId = useGameStore((s) => s.setSelectedMapId);

  const { data: maps, isLoading, error } = useQuery({
    queryKey: ['maps'],
    queryFn: getMaps,
  });

  const loadMap = (id: number, mode: 'gm' | 'player') => {
    setSelectedMapId(id);
    navigate(`/map/${id}/${mode}`);
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
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
