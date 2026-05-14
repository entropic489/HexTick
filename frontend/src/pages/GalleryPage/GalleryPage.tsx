import { useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast, { Toaster } from 'react-hot-toast';
import { getMap } from '../../api/maps';
import { getGallery, uploadGalleryImage, deleteGalleryImage, publishGalleryImage } from '../../api/gallery';
import styles from './GalleryPage.module.css';

export function GalleryPage() {
  const { mapId } = useParams<{ mapId: string }>();
  const id = Number(mapId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: map } = useQuery({ queryKey: ['map', id], queryFn: () => getMap(id) });
  const { data: images = [] } = useQuery({ queryKey: ['gallery', id], queryFn: () => getGallery(id) });
  const publishedImage = images.find((img) => img.is_published) ?? null;

  const uploadMutation = useMutation({
    mutationFn: ({ file, name }: { file: File; name: string }) =>
      uploadGalleryImage(id, file, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gallery', id] }),
    onError: () => toast.error('Upload failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (imageId: number) => deleteGalleryImage(imageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gallery', id] }),
    onError: () => toast.error('Delete failed'),
  });

  const publishMutation = useMutation({
    mutationFn: (imageId: number) => publishGalleryImage(imageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gallery', id] }),
    onError: () => toast.error('Failed to update publish state'),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate({ file, name: file.name });
    e.target.value = '';
  }

  function handleDelete(imageId: number, name: string) {
    toast(
      (t: { id: string }) => (
        <span>
          Delete <strong>{name || 'this image'}</strong>?{' '}
          <button
            onClick={() => {
              deleteMutation.mutate(imageId);
              toast.dismiss(t.id);
            }}
            style={{ marginLeft: 8, cursor: 'pointer', background: '#f38ba8', border: 'none', borderRadius: 4, padding: '2px 8px', color: '#1e1e2e', fontWeight: 600 }}
          >
            Delete
          </button>{' '}
          <button
            onClick={() => toast.dismiss(t.id)}
            style={{ cursor: 'pointer', background: 'none', border: '1px solid #6c7086', borderRadius: 4, padding: '2px 8px', color: '#6c7086' }}
          >
            Cancel
          </button>
        </span>
      ),
      { duration: 8000 }
    );
  }

  if (!map) return <div className={styles.status}>Loading…</div>;

  return (
    <div className={styles.layout}>
      <Toaster position="bottom-center" toastOptions={{ style: { background: '#181825', color: '#cdd6f4', border: '1px solid #313244' } }} />
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(`/map/${id}/gm`)}>
          ← Back
        </button>
        <span className={styles.pageTitle}>{map.name} — Gallery</span>
        {publishedImage && (
          <button
            className={styles.unpublishBtn}
            onClick={() => publishMutation.mutate(publishedImage.id)}
            disabled={publishMutation.isPending}
          >
            Unpublish
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          className={styles.uploadBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? 'Uploading…' : '+ Upload'}
        </button>
      </header>

      <div className={styles.grid}>
        {images.length === 0 && (
          <p className={styles.empty}>No images yet. Upload one to get started.</p>
        )}
        {images.map((img) => (
          <div key={img.id} className={`${styles.card} ${img.is_published ? styles.cardPublished : ''}`}>
            <img className={styles.thumb} src={img.image} alt={img.name} />
            <div className={styles.cardBody}>
              <span className={styles.cardName}>{img.name || '(unnamed)'}</span>
              {img.is_published && <span className={styles.publishedBadge}>Live</span>}
              <div className={styles.cardActions}>
                <button
                  className={img.is_published ? styles.unpublishBtn : styles.publishBtn}
                  onClick={() => publishMutation.mutate(img.id)}
                  disabled={publishMutation.isPending}
                >
                  {img.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(img.id, img.name)}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
