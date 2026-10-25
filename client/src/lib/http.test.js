import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request, uploadImage } from './http.js';

const response = (status, body) => ({ status, ok: status < 400, json: async () => body });

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe('request', () => {
  it('envoie du JSON et renvoie la réponse', async () => {
    fetch.mockResolvedValue(response(200, { user: 1 }));
    expect(await request('POST', '/api/auth/login', { a: 1 })).toEqual({ user: 1 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' });
  });

  it('n\'envoie pas de corps sans données', async () => {
    fetch.mockResolvedValue(response(200, {}));
    await request('GET', '/api/me');
    expect(fetch.mock.calls[0][1]).toEqual({ method: 'GET', headers: undefined, body: undefined });
  });

  it('renvoie null pour 204', async () => {
    fetch.mockResolvedValue({ status: 204, ok: true });
    expect(await request('POST', '/api/auth/logout')).toBeNull();
  });

  it('lève une ApiError avec le code du serveur', async () => {
    fetch.mockResolvedValue(response(409, { error: 'username_taken' }));
    await expect(request('POST', '/x', {})).rejects.toMatchObject({ status: 409, code: 'username_taken' });
  });

  it('lève une ApiError même sans corps JSON', async () => {
    fetch.mockResolvedValue({ status: 502, ok: false, json: async () => { throw new SyntaxError('x'); } });
    const err = await request('GET', '/x').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 502, code: 'http_502', message: 'http_502' });
  });
});

describe('uploadImage', () => {
  it('envoie le fichier avec son type', async () => {
    fetch.mockResolvedValue(response(200, { user: 1 }));
    const file = new Blob(['x'], { type: 'image/webp' });
    expect(await uploadImage('/api/me/avatar', file)).toEqual({ user: 1 });
    expect(fetch.mock.calls[0][1]).toEqual({ method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: file });
  });
});

describe('session expirée', () => {
  it('prévient le gestionnaire sur un 401 not_logged_in', async () => {
    const { onUnauthorized } = await import('./http.js');
    const handler = vi.fn();
    onUnauthorized(handler);
    fetch.mockResolvedValue(response(401, { error: 'not_logged_in' }));
    await expect(request('GET', '/api/me')).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledOnce();
    fetch.mockResolvedValue(response(401, { error: 'invalid_credentials' }));
    await expect(request('POST', '/api/auth/login', {})).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('sans gestionnaire de session', () => {
  it('un 401 ne plante pas', async () => {
    vi.resetModules();
    const fresh = await import('./http.js');
    expect(() => fresh.notifyUnauthorized()).not.toThrow();
  });
});
