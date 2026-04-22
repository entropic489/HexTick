import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMap, getFactions, patchFaction } from '../../api/maps';
import { useGameStore } from '../../store/useGameStore';
import type { Faction } from '../../types';
import styles from './FactionsPage.module.css';

type EditDraft = Partial<Omit<Faction, 'id' | 'is_famine' | 'is_dying' | 'max_speed' | 'last_action' | 'current_action'>>;

function StatField({
  label,
  value,
  editing,
  onChange,
}: {
  label: string;
  value: number;
  editing: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <span className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      {editing ? (
        <input
          className={styles.statInput}
          type="number"
          value={value}
          min={0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      ) : (
        <span className={styles.statValue}>{value}</span>
      )}
    </span>
  );
}

function FactionRow({
  faction,
  mapId,
  onShowOnMap,
}: {
  faction: Faction;
  mapId: number;
  onShowOnMap: (hexId: number) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft>({});

  const { mutate, isPending } = useMutation({
    mutationFn: (params: EditDraft) => patchFaction(faction.id, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factions', mapId] });
      setEditing(false);
      setDraft({});
    },
  });

  function startEdit() {
    setDraft({
      name: faction.name,
      color: faction.color,
      speed: faction.speed,
      population: faction.population,
      technology: faction.technology,
      resources: faction.resources,
      combat_skill: faction.combat_skill,
      is_mobile: faction.is_mobile,
      is_player_faction: faction.is_player_faction,
      is_gm_faction: faction.is_gm_faction,
    });
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft({});
  }

  const d = draft as Required<EditDraft>;

  return (
    <div className={styles.row}>
      <div className={styles.rowHeader}>
        <span
          className={styles.colorSwatch}
          style={{ background: editing ? d.color : faction.color }}
        />
        {editing ? (
          <>
            <input
              className={styles.nameInput}
              value={d.name ?? ''}
              onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
            />
            <input
              className={styles.colorInput}
              type="color"
              value={d.color ?? '#89b4fa'}
              onChange={(e) => setDraft((p) => ({ ...p, color: e.target.value }))}
            />
          </>
        ) : (
          <span className={styles.factionName}>{faction.name}</span>
        )}

        <span className={styles.badges}>
          {faction.is_player_faction && <span className={styles.badge}>Player</span>}
          {faction.is_gm_faction && <span className={styles.badge}>GM</span>}
          {faction.is_famine && <span className={`${styles.badge} ${styles.badgeDanger}`}>Famine</span>}
          {faction.is_dying && <span className={`${styles.badge} ${styles.badgeDanger}`}>Dying</span>}
        </span>

        <span className={styles.rowActions}>
          {faction.current_hex !== null && (
            <button
              className={styles.showBtn}
              onClick={() => onShowOnMap(faction.current_hex!)}
            >
              Show on map
            </button>
          )}
          {editing ? (
            <>
              <button className={styles.saveBtn} disabled={isPending} onClick={() => mutate(draft)}>
                Save
              </button>
              <button className={styles.cancelBtn} onClick={cancel}>
                Cancel
              </button>
            </>
          ) : (
            <button className={styles.editBtn} onClick={startEdit}>
              Edit
            </button>
          )}
        </span>
      </div>

      <div className={styles.stats}>
        <StatField label="Pop" value={editing ? d.population ?? 0 : faction.population} editing={editing} onChange={(v) => setDraft((p) => ({ ...p, population: v }))} />
        <StatField label="Res" value={editing ? d.resources ?? 0 : faction.resources} editing={editing} onChange={(v) => setDraft((p) => ({ ...p, resources: v }))} />
        <StatField label="Tech" value={editing ? d.technology ?? 0 : faction.technology} editing={editing} onChange={(v) => setDraft((p) => ({ ...p, technology: v }))} />
        <StatField label="Combat" value={editing ? d.combat_skill ?? 0 : faction.combat_skill} editing={editing} onChange={(v) => setDraft((p) => ({ ...p, combat_skill: v }))} />
        <StatField label="Speed" value={editing ? d.speed ?? 0 : faction.speed} editing={editing} onChange={(v) => setDraft((p) => ({ ...p, speed: v }))} />
        <span className={styles.stat}>
          <span className={styles.statLabel}>Action</span>
          <span className={styles.statValue}>{faction.current_action ?? '—'}</span>
        </span>
        {editing && (
          <span className={styles.flags}>
            <label><input type="checkbox" checked={d.is_mobile ?? true} onChange={(e) => setDraft((p) => ({ ...p, is_mobile: e.target.checked }))} /> Mobile</label>
            <label><input type="checkbox" checked={d.is_player_faction ?? false} onChange={(e) => setDraft((p) => ({ ...p, is_player_faction: e.target.checked }))} /> Player</label>
            <label><input type="checkbox" checked={d.is_gm_faction ?? false} onChange={(e) => setDraft((p) => ({ ...p, is_gm_faction: e.target.checked }))} /> GM</label>
          </span>
        )}
      </div>
    </div>
  );
}

export function FactionsPage() {
  const { mapId } = useParams<{ mapId: string }>();
  const id = Number(mapId);
  const navigate = useNavigate();
  const setSelectedHexId = useGameStore((s) => s.setSelectedHexId);

  const [search, setSearch] = useState('');

  const { data: map } = useQuery({ queryKey: ['map', id], queryFn: () => getMap(id) });
  const { data: factions = [] } = useQuery({ queryKey: ['factions', id], queryFn: () => getFactions(id) });

  const filtered = factions.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  function handleShowOnMap(hexId: number) {
    setSelectedHexId(hexId);
    navigate(`/map/${id}/gm`);
  }

  if (!map) return <div className={styles.status}>Loading…</div>;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(`/map/${id}/gm`)}>
          ← GM View
        </button>
        <span className={styles.title}>{map.name} — Factions</span>
        <input
          className={styles.search}
          type="search"
          placeholder="Search factions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </header>

      <div className={styles.list}>
        {filtered.length === 0 && (
          <div className={styles.empty}>No factions found.</div>
        )}
        {filtered.map((f) => (
          <FactionRow key={f.id} faction={f} mapId={id} onShowOnMap={handleShowOnMap} />
        ))}
      </div>
    </div>
  );
}
