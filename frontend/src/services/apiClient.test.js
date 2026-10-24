import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('../config/supabaseClient.js', () => ({ supabase: { auth: { getSession } } }));
vi.mock('../config/env.js', () => ({ API_URL: '/api' }));

const { apiFetch, ApiError } = await import('./apiClient.js');

function mockFetch(status, body) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('apiFetch', () => {
  beforeEach(() => getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } }));
  afterEach(() => vi.unstubAllGlobals());

  it('ajoute le token Bearer et la query string (valeurs vides ignorées)', async () => {
    const fetchMock = mockFetch(200, { ok: true });
    await apiFetch('/admin/users', { query: { page: 2, search: '', role: 'trader', isActive: false } });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/users?page=2&role=trader&isActive=false');
    expect(options.headers.Authorization).toBe('Bearer tok');
  });

  it('envoie le corps en JSON', async () => {
    const fetchMock = mockFetch(200, {});
    await apiFetch('/users/me', { method: 'PATCH', body: { fullName: 'Ab' } });
    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe('PATCH');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.body).toBe('{"fullName":"Ab"}');
  });

  it('pas de header Authorization sans session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const fetchMock = mockFetch(200, {});
    await apiFetch('/health');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('convertit les erreurs HTTP en ApiError (messages de validation joints)', async () => {
    mockFetch(400, { message: ['Pseudo invalide.', 'Pays invalide.'] });
    await expect(apiFetch('/users/me')).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'Pseudo invalide. Pays invalide.',
    });
  });

  it('signale un serveur injoignable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')));
    const error = await apiFetch('/users/me').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
  });
});
