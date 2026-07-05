import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from './client';
import { getGallery, uploadGalleryImage, deleteGalleryImage, publishGalleryImage } from './gallery';

vi.mock('./client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), postForm: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

describe('gallery api wrappers', () => {
  it('getGallery GETs the map-scoped gallery path', () => {
    getGallery(7);
    expect(api.get).toHaveBeenCalledWith('/maps/7/gallery/');
  });

  it('uploadGalleryImage posts multipart with image + name fields', () => {
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    uploadGalleryImage(7, file, 'Throne Room');
    expect(api.postForm).toHaveBeenCalledOnce();
    const [path, form] = (api.postForm as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toBe('/maps/7/gallery/');
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get('name')).toBe('Throne Room');
    expect((form as FormData).get('image')).toBe(file);
  });

  it('deleteGalleryImage DELETEs the image by id', () => {
    deleteGalleryImage(4);
    expect(api.delete).toHaveBeenCalledWith('/gallery/4/');
  });

  it('publishGalleryImage PATCHes the publish path with an empty body', () => {
    publishGalleryImage(4);
    expect(api.patch).toHaveBeenCalledWith('/gallery/4/publish/', {});
  });
});
