import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMap, getFactions, getKnowledge, getCharacters, createCharacter, patchCharacter } from '../../api/maps';
import type { Character, Faction, Knowledge } from '../../types';
import styles from './CharactersPage.module.css';

type EditDraft = Omit<Character, 'id' | 'famine_streak'>;

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

function StatField({
  label,
  value,
  editing,
  onChange,
}: {
  label: string;
  value: number | null;
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
          value={value ?? 0}
          min={0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      ) : (
        <span className={styles.statValue}>{value ?? '—'}</span>
      )}
    </span>
  );
}

function CharacterRow({
  character,
  factions,
  allKnowledge,
  mapId,
}: {
  character: Character;
  factions: Faction[];
  allKnowledge: Knowledge[];
  mapId: number;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: (params: Partial<Character>) => patchCharacter(character.id, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters', mapId] });
      setEditing(false);
      setDraft(null);
    },
  });

  function startEdit() {
    setDraft({
      name: character.name,
      age: character.age,
      faction: character.faction,
      is_player: character.is_player,
      is_leader: character.is_leader,
      is_wanderer: character.is_wanderer,
      is_dead: character.is_dead,
      can_merge: character.can_merge,
      combat_skill: character.combat_skill,
      speed: character.speed,
      max_speed: character.max_speed,
      scouting: character.scouting,
      resource_generation: character.resource_generation,
      ration_limit: character.ration_limit,
      rations: character.rations,
      current_hex: character.current_hex,
      destination: character.destination,
      notes: character.notes,
      drive: character.drive,
      knowledge: character.knowledge,
    });
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft(null);
  }

  const d = draft!;
  const factionName = factions.find((f) => f.id === character.faction)?.name ?? null;
  const knowledgeTitles = allKnowledge.filter((k) => character.knowledge.includes(k.id));

  return (
    <div className={styles.row}>
      <div className={styles.rowHeader}>
        {editing ? (
          <input
            className={styles.nameInput}
            value={d.name}
            onChange={(e) => setDraft((p) => p && { ...p, name: e.target.value })}
          />
        ) : (
          <span className={styles.charName}>{character.name}</span>
        )}

        <span className={styles.badges}>
          {character.is_player && <span className={styles.badge}>Player</span>}
          {character.is_leader && <span className={styles.badge}>Leader</span>}
          {character.is_wanderer && <span className={styles.badge}>Wanderer</span>}
          {character.is_dead && <span className={`${styles.badge} ${styles.badgeDanger}`}>Dead</span>}
          {factionName && <span className={styles.badge}>{factionName}</span>}
        </span>

        <span className={styles.rowActions}>
          {editing ? (
            <>
              <button className={styles.saveBtn} disabled={isPending || !d.name.trim()} onClick={() => mutate(d)}>
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

      {editing ? (
        <div className={styles.editBody}>
          <div className={styles.stats}>
            <StatField label="Age" value={d.age} editing onChange={(v) => setDraft((p) => p && { ...p, age: v })} />
            <StatField label="Combat" value={d.combat_skill} editing onChange={(v) => setDraft((p) => p && { ...p, combat_skill: v })} />
            <StatField label="Speed" value={d.speed} editing onChange={(v) => setDraft((p) => p && { ...p, speed: v })} />
            <StatField label="Max Spd" value={d.max_speed} editing onChange={(v) => setDraft((p) => p && { ...p, max_speed: v })} />
            <StatField label="Scout" value={d.scouting} editing onChange={(v) => setDraft((p) => p && { ...p, scouting: v })} />
            <StatField label="Res Gen" value={d.resource_generation} editing onChange={(v) => setDraft((p) => p && { ...p, resource_generation: v })} />
            <StatField label="Rations" value={d.rations} editing onChange={(v) => setDraft((p) => p && { ...p, rations: v })} />
            <StatField label="Ration Lim" value={d.ration_limit} editing onChange={(v) => setDraft((p) => p && { ...p, ration_limit: v })} />
          </div>

          <div className={styles.editRow}>
            <span className={styles.fieldLabel}>Faction</span>
            <select
              className={styles.select}
              value={d.faction ?? ''}
              onChange={(e) => setDraft((p) => p && { ...p, faction: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">— none —</option>
              {factions.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {allKnowledge.length > 0 && (
            <div className={styles.editRow}>
              <span className={styles.fieldLabel}>Knowledge</span>
              <KnowledgeDropdown
                options={allKnowledge}
                selected={d.knowledge}
                onChange={(ids) => setDraft((p) => p && { ...p, knowledge: ids })}
              />
            </div>
          )}

          <span className={styles.flags}>
            <label><input type="checkbox" checked={d.is_player} onChange={(e) => setDraft((p) => p && { ...p, is_player: e.target.checked })} /> Player</label>
            <label><input type="checkbox" checked={d.is_leader} onChange={(e) => setDraft((p) => p && { ...p, is_leader: e.target.checked })} /> Leader</label>
            <label><input type="checkbox" checked={d.is_wanderer} onChange={(e) => setDraft((p) => p && { ...p, is_wanderer: e.target.checked })} /> Wanderer</label>
            <label><input type="checkbox" checked={d.is_dead} onChange={(e) => setDraft((p) => p && { ...p, is_dead: e.target.checked })} /> Dead</label>
            <label><input type="checkbox" checked={d.can_merge} onChange={(e) => setDraft((p) => p && { ...p, can_merge: e.target.checked })} /> Can Merge</label>
          </span>

          <div className={styles.editRow}>
            <span className={styles.fieldLabel}>Drive</span>
            <input
              className={styles.nameInput}
              style={{ flex: 1 }}
              value={d.drive}
              onChange={(e) => setDraft((p) => p && { ...p, drive: e.target.value })}
              placeholder="Drive…"
            />
          </div>

          <textarea
            className={styles.descInput}
            value={d.notes}
            rows={3}
            onChange={(e) => setDraft((p) => p && { ...p, notes: e.target.value })}
            placeholder="Notes…"
          />
        </div>
      ) : (
        <>
          <div className={styles.stats}>
            <span className={styles.stat}><span className={styles.statLabel}>Age</span><span className={styles.statValue}>{character.age ?? '—'}</span></span>
            <span className={styles.stat}><span className={styles.statLabel}>Combat</span><span className={styles.statValue}>{character.combat_skill}</span></span>
            <span className={styles.stat}><span className={styles.statLabel}>Speed</span><span className={styles.statValue}>{character.speed}/{character.max_speed}</span></span>
            <span className={styles.stat}><span className={styles.statLabel}>Scout</span><span className={styles.statValue}>{character.scouting}</span></span>
            <span className={styles.stat}><span className={styles.statLabel}>Res Gen</span><span className={styles.statValue}>{character.resource_generation}</span></span>
            <span className={styles.stat}><span className={styles.statLabel}>Rations</span><span className={styles.statValue}>{character.rations}/{character.ration_limit}</span></span>
            <span className={styles.stat}><span className={styles.statLabel}>Famine</span><span className={styles.statValue}>{character.famine_streak}</span></span>
          </div>
          {character.drive && <p className={styles.desc}><em>{character.drive}</em></p>}
          {character.notes && <p className={styles.desc}>{character.notes}</p>}
          {knowledgeTitles.length > 0 && (
            <div className={styles.knowledgeTags}>
              <span className={styles.fieldLabel}>Knowledge</span>
              {knowledgeTitles.map((k) => (
                <span key={k.id} className={styles.knowledgeTag}>{k.title}</span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CreateCharacterModal({
  mapId,
  factions,
  allKnowledge,
  onClose,
}: {
  mapId: number;
  factions: Faction[];
  allKnowledge: Knowledge[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({
    name: '',
    age: '' as string | number,
    faction: null as number | null,
    is_player: false,
    is_leader: false,
    is_wanderer: false,
    can_merge: true,
    combat_skill: 10,
    speed: 0,
    max_speed: 4,
    scouting: 0,
    resource_generation: 1,
    ration_limit: 5,
    rations: 0,
    notes: '',
    drive: '',
    knowledge: [] as number[],
  });

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      createCharacter(mapId, {
        ...draft,
        age: draft.age === '' ? null : Number(draft.age),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters', mapId] });
      onClose();
    },
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Create Character</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          <label className={styles.fieldLabel}>Name</label>
          <input
            className={styles.titleInput}
            value={draft.name}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
            placeholder="Name…"
            autoFocus
          />

          <div className={styles.editRow}>
            <label className={styles.fieldLabel}>Age</label>
            <input
              className={styles.statInput}
              type="number"
              value={draft.age}
              min={0}
              onChange={(e) => setDraft((p) => ({ ...p, age: e.target.value }))}
            />
          </div>

          <div className={styles.editRow}>
            <label className={styles.fieldLabel}>Faction</label>
            <select
              className={styles.select}
              value={draft.faction ?? ''}
              onChange={(e) => setDraft((p) => ({ ...p, faction: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">— none —</option>
              {factions.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.stats}>
            {(
              [
                ['Combat', 'combat_skill'],
                ['Speed', 'speed'],
                ['Max Spd', 'max_speed'],
                ['Scout', 'scouting'],
                ['Res Gen', 'resource_generation'],
                ['Ration Lim', 'ration_limit'],
                ['Rations', 'rations'],
              ] as [string, keyof typeof draft][]
            ).map(([label, key]) => (
              <span key={key} className={styles.stat}>
                <span className={styles.statLabel}>{label}</span>
                <input
                  className={styles.statInput}
                  type="number"
                  value={draft[key] as number}
                  min={0}
                  onChange={(e) => setDraft((p) => ({ ...p, [key]: Number(e.target.value) }))}
                />
              </span>
            ))}
          </div>

          <span className={styles.flags}>
            <label><input type="checkbox" checked={draft.is_player} onChange={(e) => setDraft((p) => ({ ...p, is_player: e.target.checked }))} /> Player</label>
            <label><input type="checkbox" checked={draft.is_leader} onChange={(e) => setDraft((p) => ({ ...p, is_leader: e.target.checked }))} /> Leader</label>
            <label><input type="checkbox" checked={draft.is_wanderer} onChange={(e) => setDraft((p) => ({ ...p, is_wanderer: e.target.checked }))} /> Wanderer</label>
            <label><input type="checkbox" checked={draft.can_merge} onChange={(e) => setDraft((p) => ({ ...p, can_merge: e.target.checked }))} /> Can Merge</label>
          </span>

          <label className={styles.fieldLabel}>Drive</label>
          <input
            className={styles.titleInput}
            value={draft.drive}
            onChange={(e) => setDraft((p) => ({ ...p, drive: e.target.value }))}
            placeholder="Drive…"
          />

          <label className={styles.fieldLabel}>Notes</label>
          <textarea
            className={styles.descInput}
            value={draft.notes}
            rows={3}
            onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Notes…"
          />

          {allKnowledge.length > 0 && (
            <>
              <label className={styles.fieldLabel}>Knowledge</label>
              <KnowledgeDropdown
                options={allKnowledge}
                selected={draft.knowledge}
                onChange={(ids) => setDraft((p) => ({ ...p, knowledge: ids }))}
              />
            </>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={styles.saveBtn}
            disabled={isPending || !draft.name.trim()}
            onClick={() => mutate()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

export function CharactersPage() {
  const { mapId } = useParams<{ mapId: string }>();
  const id = Number(mapId);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data: map } = useQuery({ queryKey: ['map', id], queryFn: () => getMap(id) });
  const { data: characters = [] } = useQuery({ queryKey: ['characters', id], queryFn: () => getCharacters(id) });
  const { data: factions = [] } = useQuery({ queryKey: ['factions', id], queryFn: () => getFactions(id) });
  const { data: allKnowledge = [] } = useQuery({ queryKey: ['knowledge', id], queryFn: () => getKnowledge(id) });

  const filtered = characters.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!map) return <div className={styles.status}>Loading…</div>;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(`/map/${id}/gm`)}>
          ← GM View
        </button>
        <span className={styles.pageTitle}>{map.name} — Characters</span>
        <input
          className={styles.search}
          type="search"
          placeholder="Search characters…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className={styles.createBtn} onClick={() => setShowCreate(true)}>
          + Create Character
        </button>
      </header>

      {showCreate && (
        <CreateCharacterModal mapId={id} factions={factions} allKnowledge={allKnowledge} onClose={() => setShowCreate(false)} />
      )}

      <div className={styles.list}>
        {filtered.length === 0 && <div className={styles.empty}>No characters found.</div>}
        {filtered.map((c) => (
          <CharacterRow key={c.id} character={c} factions={factions} allKnowledge={allKnowledge} mapId={id} />
        ))}
      </div>
    </div>
  );
}
