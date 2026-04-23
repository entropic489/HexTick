import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMap, getKnowledge, patchKnowledge, createKnowledge } from '../../api/maps';
import type { Knowledge } from '../../types';
import styles from './KnowledgePage.module.css';

const AGE_LABELS: Record<number, string> = {
  1: 'Age of Magic',
  2: 'Age of Artifice',
  3: 'Age of Despair',
  4: 'Age of Dying',
};

interface Draft {
  title: string;
  description: string;
  do_players_know: boolean;
  age: number;
  related_knowledge: number[];
}

function RelatedDropdown({
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

function CreateKnowledgeModal({
  mapId,
  allKnowledge,
  onClose,
}: {
  mapId: number;
  allKnowledge: Knowledge[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>({
    title: '',
    description: '',
    do_players_know: false,
    age: 4,
    related_knowledge: [],
  });

  const { mutate, isPending } = useMutation({
    mutationFn: () => createKnowledge(mapId, draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', mapId] });
      onClose();
    },
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Create Knowledge</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          <label className={styles.fieldLabel}>Title</label>
          <input
            className={styles.titleInput}
            value={draft.title}
            onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
            placeholder="Title…"
            autoFocus
          />

          <label className={styles.fieldLabel}>Description</label>
          <textarea
            className={styles.descInput}
            value={draft.description}
            rows={4}
            onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
            placeholder="Description…"
          />

          <div className={styles.editRow}>
            <label className={styles.fieldLabel}>Age</label>
            <select
              className={styles.select}
              value={draft.age}
              onChange={(e) => setDraft((p) => ({ ...p, age: Number(e.target.value) }))}
            >
              {Object.entries(AGE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={draft.do_players_know}
              onChange={(e) => setDraft((p) => ({ ...p, do_players_know: e.target.checked }))}
            />
            Players know
          </label>

          {allKnowledge.length > 0 && (
            <>
              <label className={styles.fieldLabel}>Related knowledge</label>
              <RelatedDropdown
                options={allKnowledge}
                selected={draft.related_knowledge}
                onChange={(ids) => setDraft((p) => ({ ...p, related_knowledge: ids }))}
              />
            </>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={styles.saveBtn}
            disabled={isPending || !draft.title.trim()}
            onClick={() => mutate()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function KnowledgeRow({
  entry,
  allKnowledge,
}: {
  entry: Knowledge;
  allKnowledge: Knowledge[];
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    title: '',
    description: '',
    do_players_know: false,
    age: 4,
    related_knowledge: [],
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (params: Draft) => patchKnowledge(entry.id, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      setEditing(false);
    },
  });

  function startEdit() {
    setDraft({
      title: entry.title,
      description: entry.description,
      do_players_know: entry.do_players_know,
      age: entry.age,
      related_knowledge: entry.related_knowledge.map((r) => r.id),
    });
    setEditing(true);
  }

  const otherKnowledge = allKnowledge.filter((k) => k.id !== entry.id);

  return (
    <div className={styles.row}>
      <div className={styles.rowHeader}>
        {editing ? (
          <input
            className={styles.titleInput}
            value={draft.title}
            onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
          />
        ) : (
          <span className={styles.title}>{entry.title}</span>
        )}

        <span className={styles.badges}>
          {entry.do_players_know && <span className={styles.badge}>Players Know</span>}
          <span className={styles.badge}>{AGE_LABELS[entry.age] ?? entry.age}</span>
        </span>

        <span className={styles.rowActions}>
          {editing ? (
            <>
              <button className={styles.saveBtn} disabled={isPending} onClick={() => mutate(draft)}>
                Save
              </button>
              <button className={styles.cancelBtn} onClick={() => setEditing(false)}>
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
          <textarea
            className={styles.descInput}
            value={draft.description}
            rows={3}
            onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
            placeholder="Description…"
          />
          <div className={styles.editRow}>
            <label className={styles.fieldLabel}>Age</label>
            <select
              className={styles.select}
              value={draft.age}
              onChange={(e) => setDraft((p) => ({ ...p, age: Number(e.target.value) }))}
            >
              {Object.entries(AGE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div className={styles.editRow}>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={draft.do_players_know}
                onChange={(e) => setDraft((p) => ({ ...p, do_players_know: e.target.checked }))}
              />
              Players know
            </label>
          </div>
          {otherKnowledge.length > 0 && (
            <div className={styles.editRow}>
              <span className={styles.fieldLabel}>Related</span>
              <RelatedDropdown
                options={otherKnowledge}
                selected={draft.related_knowledge}
                onChange={(ids) => setDraft((p) => ({ ...p, related_knowledge: ids }))}
              />
            </div>
          )}
        </div>
      ) : (
        <>
          {entry.description && <p className={styles.desc}>{entry.description}</p>}
          {entry.related_knowledge.length > 0 && (
            <div className={styles.related}>
              <span className={styles.relatedLabel}>Related:</span>
              {entry.related_knowledge.map((r) => (
                <span key={r.id} className={styles.relatedTag}>{r.title}</span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function KnowledgePage() {
  const { mapId } = useParams<{ mapId: string }>();
  const id = Number(mapId);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data: map } = useQuery({ queryKey: ['map', id], queryFn: () => getMap(id) });
  const { data: knowledge = [] } = useQuery({ queryKey: ['knowledge', id], queryFn: () => getKnowledge(id) });

  const filtered = knowledge.filter((k) =>
    k.title.toLowerCase().includes(search.toLowerCase())
  );

  if (!map) return <div className={styles.status}>Loading…</div>;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(`/map/${id}/gm`)}>
          ← GM View
        </button>
        <span className={styles.pageTitle}>{map.name} — Knowledge</span>
        <input
          className={styles.search}
          type="search"
          placeholder="Search knowledge…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className={styles.createBtn} onClick={() => setShowCreate(true)}>
          + Create Knowledge
        </button>
      </header>

      {showCreate && (
        <CreateKnowledgeModal mapId={id} allKnowledge={knowledge} onClose={() => setShowCreate(false)} />
      )}

      <div className={styles.list}>
        {filtered.length === 0 && <div className={styles.empty}>No knowledge found.</div>}
        {filtered.map((k) => (
          <KnowledgeRow key={k.id} entry={k} allKnowledge={knowledge} />
        ))}
      </div>
    </div>
  );
}
