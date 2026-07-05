import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from './client';
import { bulkPatchHexes, postHighlightHex, duplicateMap, createMap } from './maps';

vi.mock('./client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), postForm: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

describe('maps api wrappers', () => {
  it('bulkPatchHexes folds ids and params into a single POST body', () => {
    bulkPatchHexes([1, 2, 3], { has_roads: true, player_visible: false });
    expect(api.post).toHaveBeenCalledWith('/hexes/bulk-patch/', {
      ids: [1, 2, 3],
      has_roads: true,
      player_visible: false,
    });
  });

  it('postHighlightHex POSTs the hex id (including null to clear)', () => {
    postHighlightHex(4, 88);
    expect(api.post).toHaveBeenCalledWith('/maps/4/highlight/', { hex_id: 88 });
    postHighlightHex(4, null);
    expect(api.post).toHaveBeenLastCalledWith('/maps/4/highlight/', { hex_id: null });
  });

  it('duplicateMap POSTs the new name to the duplicate path', () => {
    duplicateMap(2, 'Ashenvale (copy)');
    expect(api.post).toHaveBeenCalledWith('/maps/2/duplicate/', { name: 'Ashenvale (copy)' });
  });

  it('createMap builds multipart form data, stringifying numbers and omitting absent image', () => {
    createMap({ name: 'Ashenvale', hex_size: 40, origin_x: 12, origin_y: 34, image_path: 'maps/a.png' });
    const [path, form] = (api.postForm as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toBe('/maps/');
    const fd = form as FormData;
    expect(fd.get('name')).toBe('Ashenvale');
    expect(fd.get('hex_size')).toBe('40');
    expect(fd.get('origin_x')).toBe('12');
    expect(fd.get('origin_y')).toBe('34');
    expect(fd.get('image_path')).toBe('maps/a.png');
    expect(fd.get('image')).toBeNull(); // no File provided
  });

  it('createMap appends the image File when supplied', () => {
    const image = new File(['x'], 'a.png', { type: 'image/png' });
    createMap({ name: 'A', hex_size: 40, origin_x: 0, origin_y: 0, image });
    const [, form] = (api.postForm as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((form as FormData).get('image')).toBe(image);
  });
});
