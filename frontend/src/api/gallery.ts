import { api } from './client';
import type { GalleryImage } from '../types';

export const getGallery = (mapId: number) =>
  api.get<GalleryImage[]>(`/maps/${mapId}/gallery/`);

export function uploadGalleryImage(mapId: number, file: File, name: string): Promise<GalleryImage> {
  const form = new FormData();
  form.append('image', file);
  form.append('name', name);
  return api.postForm<GalleryImage>(`/maps/${mapId}/gallery/`, form);
}

export const deleteGalleryImage = (imageId: number) =>
  api.delete<{ ok: boolean }>(`/gallery/${imageId}/`);

export const publishGalleryImage = (imageId: number) =>
  api.patch<GalleryImage>(`/gallery/${imageId}/publish/`, {});
