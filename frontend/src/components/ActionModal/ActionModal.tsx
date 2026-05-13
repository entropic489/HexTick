import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postPartyAction } from '../../api/tick';
import type { Hex, Party, PartyActionType } from '../../types';
import styles from './ActionModal.module.css';

interface ActionDef {
  action: PartyActionType;
  label: string;
  description: string;
  enabled: boolean;
  disabledReason?: string;
}

interface Props {
  party: Party;
  selectedHex: Hex;
  mapId: number;
  onSuccess: () => void;
  onClose: () => void;
}

export function ActionModal({ party, selectedHex, mapId, onSuccess, onClose }: Props) {
  const qc = useQueryClient();
  const onCurrentHex = selectedHex.id === party.current_hex;
  const hasDungeon = selectedHex.pois.some((p) => p.poi_type === 'dungeon' && !p.hidden);
  const tooSlow = !onCurrentHex && (selectedHex.terrain_difficulty ?? 0) > party.speed;

  const actions: ActionDef[] = [
    {
      action: 'move',
      label: 'Move',
      description: 'Travel to this hex (costs speed equal to terrain difficulty).',
      enabled: !onCurrentHex && selectedHex.player_visible && !tooSlow,
      disabledReason: onCurrentHex
        ? 'Already here.'
        : !selectedHex.player_visible
        ? 'Hex not yet visible.'
        : tooSlow
        ? 'You must rest before traveling here.'
        : undefined,
    },
    {
      action: 'supply',
      label: 'Supply',
      description: 'Rest and resupply on the current hex.',
      enabled: onCurrentHex && party.tracks_supplies,
      disabledReason: !onCurrentHex
        ? 'Must be on this hex.'
        : !party.tracks_supplies
        ? 'Supply tracking is disabled for this party.'
        : undefined,
    },
    {
      action: 'delve',
      label: 'Delve',
      description: 'Descend into the dungeon on this hex.',
      enabled: onCurrentHex && hasDungeon,
      disabledReason: !onCurrentHex
        ? 'Must be on this hex.'
        : !hasDungeon
        ? 'No accessible dungeon here.'
        : undefined,
    },
    {
      action: 'search',
      label: 'Search',
      description: 'Search this hex for hidden points of interest.',
      enabled: onCurrentHex,
      disabledReason: !onCurrentHex ? 'Must be on this hex.' : undefined,
    },
    {
      action: 'social',
      label: 'Social',
      description: 'Engage in social activity on this hex.',
      enabled: onCurrentHex,
      disabledReason: !onCurrentHex ? 'Must be on this hex.' : undefined,
    },
    {
      action: 'rest',
      label: 'Rest',
      description: `Recover full speed (${party.max_speed}).`,
      enabled: true,
    },
  ];

  const { mutate, isPending, error } = useMutation({
    mutationFn: (action: PartyActionType) => {
      const body =
        action === 'move'
          ? { action, hex_id: selectedHex.id }
          : { action };
      return postPartyAction(party.id, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['map', mapId] });
      qc.invalidateQueries({ queryKey: ['hexes', mapId] });
      qc.invalidateQueries({ queryKey: ['factions', mapId] });
      qc.invalidateQueries({ queryKey: ['party', mapId] });
      onSuccess();
    },
  });

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Choose Action</h3>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.hexInfo}>
          Hex ({selectedHex.row}, {selectedHex.col}) — {selectedHex.terrain_type}
        </div>

        <div className={styles.actionList}>
          {actions.map((a) => (
            <button
              key={a.action}
              className={styles.actionBtn}
              disabled={!a.enabled || isPending}
              title={a.disabledReason}
              onClick={() => mutate(a.action)}
            >
              <span className={styles.actionLabel}>{a.label}</span>
              <span className={styles.actionDesc}>
                {a.enabled ? a.description : a.disabledReason}
              </span>
            </button>
          ))}
        </div>

        {error && <p className={styles.error}>{String(error)}</p>}
      </div>
    </div>
  );
}
