import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Party, ActionType } from '../../types';
import { patchParty, postPartyAction } from '../../api/tick';
import styles from './HexPanel.module.css';

const ACTION_TYPES: ActionType[] = ['supply', 'travel', 'rest'];

interface PartyDraft {
  player_count: number;
  supplies: number;
  tracks_supplies: boolean;
  speed: number;
  max_speed: number;
  resource_generation: number;
  current_action: string;
}

interface Props {
  party: Party;
}

export function PartyFooter({ party }: Props) {
  const queryClient = useQueryClient();
  const [partyEditing, setPartyEditing] = useState(false);
  const [partyDraft, setPartyDraft] = useState<PartyDraft | null>(null);

  const partyMutation = useMutation({
    mutationFn: (draft: PartyDraft) =>
      patchParty(party.id, {
        ...draft,
        current_action: draft.current_action || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['party'] });
      setPartyEditing(false);
      setPartyDraft(null);
    },
  });

  const clearLostMutation = useMutation({
    mutationFn: () => postPartyAction(party.id, { action: 'clear_lost' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['party'] });
    },
  });

  return (
    <div className={styles.partyFooter}>
      <div className={styles.partyFooterTitle}>
        Party
        {!partyEditing && (
          <button
            className={styles.editBtn}
            onClick={() => {
              setPartyDraft({
                player_count: party.player_count,
                supplies: party.supplies,
                tracks_supplies: party.tracks_supplies,
                speed: party.speed,
                max_speed: party.max_speed,
                resource_generation: party.resource_generation,
                current_action: party.current_action ?? '',
              });
              setPartyEditing(true);
            }}
          >
            Edit
          </button>
        )}
      </div>
      {partyEditing && partyDraft ? (
        <div className={styles.editForm}>
          <label className={styles.fieldLabel}>
            <span className={styles.fieldName}>Players</span>
            <input className={styles.input} type="number" value={partyDraft.player_count}
              onChange={(e) => setPartyDraft((d) => d && { ...d, player_count: Number(e.target.value) })} />
          </label>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={partyDraft.tracks_supplies}
              onChange={(e) => setPartyDraft((d) => d && { ...d, tracks_supplies: e.target.checked })}
            />
            Track supplies
          </label>
          {partyDraft.tracks_supplies && (
            <label className={styles.fieldLabel}>
              <span className={styles.fieldName}>Supplies</span>
              <input className={styles.input} type="number" value={partyDraft.supplies}
                onChange={(e) => setPartyDraft((d) => d && { ...d, supplies: Number(e.target.value) })} />
            </label>
          )}
          <label className={styles.fieldLabel}>
            <span className={styles.fieldName}>Speed</span>
            <input className={styles.input} type="number" value={partyDraft.speed}
              onChange={(e) => setPartyDraft((d) => d && { ...d, speed: Number(e.target.value) })} />
          </label>
          <label className={styles.fieldLabel}>
            <span className={styles.fieldName}>Max speed</span>
            <input className={styles.input} type="number" value={partyDraft.max_speed}
              onChange={(e) => setPartyDraft((d) => d && { ...d, max_speed: Number(e.target.value) })} />
          </label>
          <label className={styles.fieldLabel}>
            <span className={styles.fieldName}>Resource gen</span>
            <input className={styles.input} type="number" value={partyDraft.resource_generation}
              onChange={(e) => setPartyDraft((d) => d && { ...d, resource_generation: Number(e.target.value) })} />
          </label>
          <label className={styles.fieldLabel}>
            <span className={styles.fieldName}>Action</span>
            <select className={styles.select} value={partyDraft.current_action}
              onChange={(e) => setPartyDraft((d) => d && { ...d, current_action: e.target.value })}>
              <option value="">—</option>
              {ACTION_TYPES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <div className={styles.editActions}>
            <button
              className={styles.saveBtn}
              disabled={partyMutation.isPending}
              onClick={() => partyMutation.mutate(partyDraft)}
            >
              {partyMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button className={styles.cancelBtn} onClick={() => { setPartyEditing(false); setPartyDraft(null); }}>
              Cancel
            </button>
          </div>
          {partyMutation.isError && <p className={styles.error}>Save failed.</p>}
        </div>
      ) : (
        <>
          <dl className={styles.partyStats}>
            <dt>Players</dt><dd>{party.player_count}</dd>
            {party.tracks_supplies && <><dt>Supplies</dt><dd>{party.supplies}</dd></>}
            <dt>Hex</dt><dd>{party.current_hex ?? '—'}</dd>
            <dt>Destination</dt><dd>{party.destination ?? '—'}</dd>
            <dt>Speed</dt><dd>{party.speed} / {party.max_speed}</dd>
            <dt>Action</dt><dd>{party.current_action ?? '—'}</dd>
          </dl>
          {party.is_lost && (
            <button
              className={styles.clearLostBtn}
              disabled={clearLostMutation.isPending}
              onClick={() => clearLostMutation.mutate()}
            >
              {clearLostMutation.isPending ? 'Clearing…' : 'Clear Lost (spend terrain cost)'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
