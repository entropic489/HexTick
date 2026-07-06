import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from './client';
import {
  resetToTick,
  postTick,
  postPartyAction,
  patchParty,
} from './tick';

vi.mock('./client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), postForm: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

describe('tick api wrappers', () => {
  it('resetToTick POSTs the reset path with an empty body', () => {
    resetToTick(3, 12);
    expect(api.post).toHaveBeenCalledWith('/maps/3/tick/12/reset/', {});
  });

  it('postTick POSTs the tick request body to /tick/', () => {
    postTick({ map_id: 5, mode: 'shift' });
    expect(api.post).toHaveBeenCalledWith('/tick/', { map_id: 5, mode: 'shift' });
  });

  it('postPartyAction POSTs the action body to the party-scoped path', () => {
    postPartyAction(9, { action: 'move', hex_id: 12 });
    expect(api.post).toHaveBeenCalledWith('/party/9/action/', { action: 'move', hex_id: 12 });
  });

  it('patchParty PATCHes the party by id with the partial body', () => {
    patchParty(9, { supplies: 12, current_hex: 44 });
    expect(api.patch).toHaveBeenCalledWith('/party/9/', { supplies: 12, current_hex: 44 });
  });
});
