import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let spotify;

function response(status, body) {
  return { status, ok: status < 400, json: async () => body };
}

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
  spotify = await import('./spotify.js');
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('tokens', () => {
  it('loadTokens indique s\'il existe une session', () => {
    expect(spotify.loadTokens()).toBe(false);
    localStorage.setItem('bt_token', 't');
    expect(spotify.loadTokens()).toBe(true);
    expect(spotify.getToken()).toBe('t');
  });

  it('saveTokens enregistre les tokens et expire 60 s avant Spotify', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    spotify.saveTokens('a', 'r', 3600);
    expect(localStorage.getItem('bt_token')).toBe('a');
    expect(localStorage.getItem('bt_refresh')).toBe('r');
    expect(Number(localStorage.getItem('bt_expiry'))).toBe(1_000_000 + 3540 * 1000);
  });
});

describe('ensureToken', () => {
  it('ne renouvelle pas un token encore valide', async () => {
    spotify.saveTokens('a', 'r', 3600);
    await spotify.ensureToken();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ne lance qu\'un seul renouvellement pour des appels simultanés', async () => {
    spotify.saveTokens('a', 'r', 0);
    fetch.mockResolvedValue(response(200, { access_token: 'b', refresh_token: 'r2', expires_in: 3600 }));
    await Promise.all([spotify.ensureToken(), spotify.ensureToken()]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ refresh_token: 'r' });
    expect(spotify.getToken()).toBe('b');
    expect(localStorage.getItem('bt_refresh')).toBe('r2');
  });

  it('garde l\'ancien refresh token si Spotify n\'en renvoie pas', async () => {
    spotify.saveTokens('a', 'r', 0);
    fetch.mockResolvedValue(response(200, { access_token: 'b', expires_in: 3600 }));
    await spotify.ensureToken();
    expect(localStorage.getItem('bt_refresh')).toBe('r');
  });

  it('reprend le refresh token stocké si la session n\'est pas chargée', async () => {
    localStorage.setItem('bt_refresh', 'stocké');
    fetch.mockResolvedValue(response(200, { access_token: 'b', expires_in: 3600 }));
    await spotify.ensureToken();
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ refresh_token: 'stocké' });
  });

  it('échoue sans refresh token', async () => {
    await expect(spotify.ensureToken()).rejects.toThrow('not_logged_in');
  });

  it('signale une session expirée si le renouvellement échoue', async () => {
    spotify.saveTokens('a', 'r', 0);
    fetch.mockResolvedValue(response(400, { error: 'refresh_failed' }));
    await expect(spotify.ensureToken()).rejects.toThrow(/Session expirée/);
  });
});

describe('api', () => {
  beforeEach(() => spotify.saveTokens('tok', 'r', 3600));

  it('envoie le token et le corps JSON', async () => {
    fetch.mockResolvedValue(response(200, { id: 'u' }));
    expect(await spotify.api('PUT', '/me/player', { a: 1 })).toEqual({ id: 'u' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/spotify/me/player');
    expect(init.headers['x-token']).toBe('tok');
    expect(JSON.parse(init.body)).toEqual({ a: 1 });
  });

  it('n\'envoie pas de corps pour un GET', async () => {
    fetch.mockResolvedValue(response(200, {}));
    await spotify.api('GET', '/me');
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });

  it('renvoie null pour une réponse 204', async () => {
    fetch.mockResolvedValue({ status: 204 });
    expect(await spotify.api('PUT', '/me/player/pause')).toBeNull();
  });

  it('remonte le message d\'erreur Spotify', async () => {
    fetch.mockResolvedValue(response(404, { error: { message: 'Not found' } }));
    await expect(spotify.api('GET', '/x')).rejects.toThrow('Not found');
  });

  it('remonte le statut si Spotify ne donne pas de message', async () => {
    fetch.mockResolvedValue(response(500, {}));
    await expect(spotify.api('GET', '/x')).rejects.toThrow('Erreur Spotify 500');
  });
});
