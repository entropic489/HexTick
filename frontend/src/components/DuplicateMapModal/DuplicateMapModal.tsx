import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { duplicateMap } from '../../api/maps';
import styles from './DuplicateMapModal.module.css';

interface Props {
  mapId: number;
  sourceName: string;
  onClose: () => void;
}

export function DuplicateMapModal({ mapId, sourceName, onClose }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(`${sourceName} (copy)`);
  const [twoLayer, setTwoLayer] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [detail, setDetail] = useState<File | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      duplicateMap(mapId, name.trim(), twoLayer
        ? {
            reveal_mode: 'two_layer',
            ...(image ? { image } : {}),
            ...(detail ? { detail_image: detail } : {}),
          }
        : {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maps'] });
      onClose();
    },
  });

  const canSave = !!name.trim() && !mutation.isPending;

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Duplicate “{sourceName}”</h3>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.form}>
          <div className={styles.field}>
            <span className={styles.label}>New map name</span>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) mutation.mutate();
                if (e.key === 'Escape') onClose();
              }}
            />
          </div>

          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={twoLayer}
              onChange={(e) => setTwoLayer(e.target.checked)}
            />
            Convert to two-layer map
          </label>

          {twoLayer && (
            <div className={styles.twoLayer}>
              <div className={styles.field}>
                <span className={styles.label}>Base map (NPC layer)</span>
                <input
                  className={styles.file}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                />
                <p className={styles.hint}>Optional — keeps the original base image if left blank.</p>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Detail map (true layer)</span>
                <input
                  className={styles.file}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setDetail(e.target.files?.[0] ?? null)}
                />
                <p className={styles.hint}>Revealed per hex the party can see. Must match the base map's dimensions.</p>
              </div>
            </div>
          )}
        </div>

        {mutation.isError && <p className={styles.error}>Duplicate failed.</p>}

        <div className={styles.actions}>
          <button className={styles.saveBtn} onClick={() => mutation.mutate()} disabled={!canSave}>
            {mutation.isPending ? 'Duplicating…' : 'Duplicate'}
          </button>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
