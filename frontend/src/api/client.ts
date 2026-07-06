const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // Only send a JSON Content-Type when there's actually a JSON body — GET/DELETE carry
  // none, and postForm passes its own (empty) headers for multipart (L7).
  const headers = options?.body ? { 'Content-Type': 'application/json' } : undefined;
  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, form: FormData) =>
    request<T>(path, { method: 'POST', body: form, headers: {} }),
};
