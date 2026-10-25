import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDatabaseUrl } from '../test/db.js';
import { insertUser } from '../test/factories.js';
import { linkSpotify } from '../test/http.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { getAccessToken, SpotifyNotLinkedError, SpotifyRelinkRequiredError } from './spotify-auth.js';
import { getLink } from './spotify-links.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());
const config = loadConfig({}, []);
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => vi.unstubAllGlobals());

async function expiredLink() {
  const user = await insertUser(pool);
  await linkSpotify(pool, user.id, { expiresIn: 0, now: new Date('2020-01-01') });
  return user;
}

describe('getAccessToken', () => {
  it('renvoie le token encore valide sans appeler Spotify', async () => {
    const user = await insertUser(pool);
    await linkSpotify(pool, user.id);
    expect((await getAccessToken(pool, config, user.id)).accessToken).toBe('acc');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('renouvelle un token expiré et l\'enregistre', async () => {
    const user = await expiredLink();
    fetch.mockResolvedValue(json(200, { access_token: 'neuf', refresh_token: 'ref2', expires_in: 3600 }));
    const token = await getAccessToken(pool, config, user.id);
    expect(token.accessToken).toBe('neuf');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://accounts.spotify.com/api/token');
    const body = new URLSearchParams(init.body);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('ref');
    expect(body.get('client_id')).toBe(config.spotifyClientId);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(await getLink(pool, config.tokenKey, user.id)).toMatchObject({ accessToken: 'neuf', refreshToken: 'ref2' });
  });

  it('partage un seul renouvellement entre appels simultanés', async () => {
    const user = await expiredLink();
    fetch.mockResolvedValue(json(200, { access_token: 'neuf', expires_in: 3600 }));
    const [a, b] = await Promise.all([getAccessToken(pool, config, user.id), getAccessToken(pool, config, user.id)]);
    expect(a.accessToken).toBe('neuf');
    expect(b.accessToken).toBe('neuf');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('garde l\'ancien refresh token si Spotify n\'en renvoie pas', async () => {
    const user = await expiredLink();
    fetch.mockResolvedValue(json(200, { access_token: 'neuf', expires_in: 3600 }));
    await getAccessToken(pool, config, user.id);
    expect((await getLink(pool, config.tokenKey, user.id)).refreshToken).toBe('ref');
  });

  it.each([400, 401])('supprime une liaison révoquée (%i) et demande de relier Spotify', async status => {
    const user = await expiredLink();
    fetch.mockResolvedValue(json(status, { error: 'invalid_grant' }));
    await expect(getAccessToken(pool, config, user.id)).rejects.toBeInstanceOf(SpotifyRelinkRequiredError);
    expect(await getLink(pool, config.tokenKey, user.id)).toBeNull();
  });

  it.each([
    ['erreur réseau', () => fetch.mockRejectedValue(new Error('ECONNRESET'))],
    ['erreur Spotify 503', () => fetch.mockResolvedValue(json(503, {}))],
  ])('garde la liaison en cas d\'%s', async (_, arrange) => {
    const user = await expiredLink();
    arrange();
    await expect(getAccessToken(pool, config, user.id)).rejects.toThrow();
    expect(await getLink(pool, config.tokenKey, user.id)).not.toBeNull();
  });

  it('signale l\'absence de liaison', async () => {
    const user = await insertUser(pool);
    await expect(getAccessToken(pool, config, user.id)).rejects.toBeInstanceOf(SpotifyNotLinkedError);
  });
});
