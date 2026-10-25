import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./session.js', () => ({ markSpotifyUnlinked: vi.fn() }));

let spotify, session;
const response = (status, body) => ({ status, ok: status < 400, json: async () => body });

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn());
  spotify = await import('./spotify.js');
  session = await import('./session.js');
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); });

describe('ensureToken', () => {
  it('récupère le token du SDK auprès du serveur', async () => {
    fetch.mockResolvedValue(response(200, { accessToken: 'tok', expiresAt: new Date(Date.now() + 60_000).toISOString() }));
    await spotify.ensureToken();
    expect(fetch.mock.calls[0][0]).toBe('/api/spotify/token');
    expect(spotify.getToken()).toBe('tok');
  });

  it('réutilise le token tant qu\'il est valide et partage les appels simultanés', async () => {
    fetch.mockResolvedValue(response(200, { accessToken: 'tok', expiresAt: new Date(Date.now() + 60_000).toISOString() }));
    await Promise.all([spotify.ensureToken(), spotify.ensureToken()]);
    await spotify.ensureToken();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('redemande un token expiré', async () => {
    fetch.mockResolvedValue(response(200, { accessToken: 'tok', expiresAt: new Date(Date.now() - 1000).toISOString() }));
    await spotify.ensureToken();
    await spotify.ensureToken();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['spotify_not_linked', 'spotify_relink_required'])('demande de relier Spotify (%s)', async code => {
    fetch.mockResolvedValue(response(409, { error: code }));
    await expect(spotify.ensureToken()).rejects.toThrow('Reconnecte ton compte Spotify');
    expect(session.markSpotifyUnlinked).toHaveBeenCalled();
  });

  it('signale un serveur Spotify injoignable', async () => {
    fetch.mockResolvedValue(response(502, { error: 'spotify_unreachable' }));
    await expect(spotify.ensureToken()).rejects.toThrow('Spotify injoignable, réessaie');
    expect(session.markSpotifyUnlinked).not.toHaveBeenCalled();
  });
});

describe('api', () => {
  it('appelle le proxy sans token côté client', async () => {
    fetch.mockResolvedValue(response(200, { id: 'u' }));
    expect(await spotify.api('PUT', '/me/player', { a: 1 })).toEqual({ id: 'u' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/spotify/me/player');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ a: 1 });
  });

  it('n\'envoie pas de corps pour un GET', async () => {
    fetch.mockResolvedValue(response(200, {}));
    await spotify.api('GET', '/me');
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });

  it('renvoie null pour 204', async () => {
    fetch.mockResolvedValue({ status: 204 });
    expect(await spotify.api('PUT', '/me/player/pause')).toBeNull();
  });

  it('demande de relier Spotify sur un 409', async () => {
    fetch.mockResolvedValue(response(409, { error: 'spotify_relink_required' }));
    await expect(spotify.api('GET', '/me')).rejects.toThrow('Reconnecte ton compte Spotify');
    expect(session.markSpotifyUnlinked).toHaveBeenCalled();
  });

  it('remonte le message d\'erreur Spotify ou le statut', async () => {
    fetch.mockResolvedValue(response(404, { error: { message: 'Not found' } }));
    await expect(spotify.api('GET', '/x')).rejects.toThrow('Not found');
    fetch.mockResolvedValue(response(502, { error: 'ENOTFOUND' }));
    await expect(spotify.api('GET', '/x')).rejects.toThrow('Erreur Spotify 502');
  });
});
