import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api } from './client';

// Mirror the client's own base resolution so the assertion holds regardless of
// whether VITE_API_URL is set (it is '/api' in the container, unset elsewhere).
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function errResponse(status: number, statusText: string, text: string): Response {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({}),
    text: async () => text,
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('GET issues a bare request against BASE + path and returns parsed json', async () => {
    fetchMock.mockResolvedValue(okResponse({ id: 1 }));
    const result = await api.get<{ id: number }>('/maps/1/');
    expect(result).toEqual({ id: 1 });
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/maps/1/`, expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }));
  });

  it('POST sends a JSON-stringified body with the POST method', async () => {
    fetchMock.mockResolvedValue(okResponse({ ok: true }));
    await api.post('/tick/', { map_id: 2 });
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(opts.body).toBe(JSON.stringify({ map_id: 2 }));
    expect(opts.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('PATCH uses the PATCH method and serializes the body', async () => {
    fetchMock.mockResolvedValue(okResponse({}));
    await api.patch('/party/1/', { speed: 4 });
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('PATCH');
    expect(opts.body).toBe(JSON.stringify({ speed: 4 }));
  });

  it('DELETE uses the DELETE method and no body', async () => {
    fetchMock.mockResolvedValue(okResponse({}));
    await api.delete('/gallery/3/');
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('DELETE');
    expect(opts.body).toBeUndefined();
  });

  it('postForm sends the FormData as-is and clears the JSON Content-Type header', async () => {
    fetchMock.mockResolvedValue(okResponse({ id: 9 }));
    const form = new FormData();
    form.append('name', 'hero');
    await api.postForm('/gallery/', form);
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(opts.body).toBe(form);
    // Empty headers so the browser sets the multipart boundary itself.
    expect(opts.headers).toEqual({});
  });

  it('throws an Error carrying status, statusText and body text on a non-ok response', async () => {
    fetchMock.mockResolvedValue(errResponse(400, 'Bad Request', 'Party is not on a map.'));
    await expect(api.get('/party/1/action/')).rejects.toThrow(
      '400 Bad Request: Party is not on a map.',
    );
  });
});
