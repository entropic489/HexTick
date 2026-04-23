import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMap, getFactions, getKnowledge, getCharacters, patchFaction } from '../../api/maps';
import { useGameStore } from '../../store/useGameStore';
import type { Faction, Knowledge, Character } from '../../types';
import styles from './FactionsPage.module.css';

type EditDraft = Partial<Omit<Faction, 'id' | 'is_famine' | 'is_dying' | 'max_speed' | 'last_action' | 'current_action'>>;

function KnowledgeDropdown({
  options,
  selected,
  onChange,
}: {
  options: Knowledge[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedItems = options.filter((o) => selected.includes(o.id));
  const filtered = options.filter(
    (o) => !selected.includes(o.id) && o.title.toLowerCase().includes(query.toLowerCase())
  );

  function add(id: number) {
    onChange([...selected, id]);
    setQuery('');
  }

  function remove(id: number) {
    onChange(selected.filter((x) => x !== id));
  }

  return (
    <div className={styles.dropdownWrap} ref={containerRef}>
      <div className={styles.dropdownControl} onClick={() => setOpen(true)}>
        {selectedItems.map((item) => (
          <span key={item.id} className={styles.selectedTag}>
            {item.title}
            <button
              className={styles.tagRemove}
              onClick={(e) => { e.stopPropagation(); remove(item.id); }}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          className={styles.dropdownInput}
          value={query}
          placeholder={selectedItems.length === 0 ? 'Search…' : ''}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className={styles.dropdownMenu}>
          {filtered.map((item) => (
            <div
              key={item.id}
              className={styles.dropdownOption}
              onMouseDown={(e) => { e.preventDefault(); add(item.id); }}
            >
              {item.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeaderDropdown({
  options,
  selected,
  onChange,
}: {
  options: Character[];
  selected: number | null;
  onChange: (id: number | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedChar = options.find((o) => o.id === selected) ?? null;
  const filtered = options.filter(
    (o) => o.name.toLowerCase().includes(query.toLowerCase())
  );

  function select(id: number) {
    onChange(id);
    setQuery('');
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setQuery('');
  }

  return (
    <div className={styles.dropdownWrap} ref={containerRef}>
      <div className={styles.dropdownControl} onClick={() => setOpen(true)}>
        {selectedChar ? (
          <span className={styles.selectedTag}>
            {selectedChar.name}
            <button
              className={styles.tagRemove}
              onClick={(e) => { e.stopPropagation(); clear(); }}
            >
              ✕
            </button>
          </span>
        ) : null}
        {!selectedChar && (
          <input
            className={styles.dropdownInput}
            value={query}
            placeholder="Search…"
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className={styles.dropdownMenu}>
          {filtered.map((item) => (
            <div
              key={item.id}
              className={styles.dropdownOption}
              onMouseDown={(e) => { e.preventDefault(); select(item.id); }}
            >
              {item.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
  allKnowledge,
  allCharacters,
  onShowOnMap,
}: {
  faction: Faction;
  mapId: number;
  allKnowledge: Knowledge[];
  allCharacters: Character[];
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
      agreeableness: faction.agreeableness,
      theology: faction.theology,
      is_mobile: faction.is_mobile,
      is_player_faction: faction.is_player_faction,
      is_gm_faction: faction.is_gm_faction,
      knowledge: faction.knowledge,
      leader: faction.leader,
    });
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft({});
  }

  const d = draft as Required<EditDraft>;
  const knowledgeTitles = allKnowledge.filter((k) => faction.knowledge.includes(k.id));

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
        <StatField label="Agree" value={editing ? d.agreeableness ?? 0 : faction.agreeableness} editing={editing} onChange={(v) => setDraft((p) => ({ ...p, agreeableness: v }))} />
        <StatField label="Theology" value={editing ? d.theology ?? 90 : faction.theology} editing={editing} onChange={(v) => setDraft((p) => ({ ...p, theology: v }))} />
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

      {editing && (
        <div className={styles.knowledgeRow}>
          <span className={styles.statLabel}>Leader</span>
          <LeaderDropdown
            options={allCharacters}
            selected={d.leader ?? null}
            onChange={(id) => setDraft((p) => ({ ...p, leader: id }))}
          />
        </div>
      )}

      {!editing && faction.leader !== null && (
        <div className={styles.knowledgeTags}>
          <span className={styles.statLabel}>Leader</span>
          <span className={styles.knowledgeTag}>
            {allCharacters.find((c) => c.id === faction.leader)?.name ?? `#${faction.leader}`}
          </span>
        </div>
      )}

      {editing && allKnowledge.length > 0 && (
        <div className={styles.knowledgeRow}>
          <span className={styles.statLabel}>Knowledge</span>
          <KnowledgeDropdown
            options={allKnowledge}
            selected={d.knowledge ?? []}
            onChange={(ids) => setDraft((p) => ({ ...p, knowledge: ids }))}
          />
        </div>
      )}

      {!editing && knowledgeTitles.length > 0 && (
        <div className={styles.knowledgeTags}>
          <span className={styles.statLabel}>Knowledge</span>
          {knowledgeTitles.map((k) => (
            <span key={k.id} className={styles.knowledgeTag}>{k.title}</span>
          ))}
        </div>
      )}
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
  const { data: allKnowledge = [] } = useQuery({ queryKey: ['knowledge', id], queryFn: () => getKnowledge(id) });
  const { data: allCharacters = [] } = useQuery({ queryKey: ['characters', id], queryFn: () => getCharacters(id) });

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
          <FactionRow key={f.id} faction={f} mapId={id} allKnowledge={allKnowledge} allCharacters={allCharacters} onShowOnMap={handleShowOnMap} />
        ))}
      </div>
    </div>
  );
}
