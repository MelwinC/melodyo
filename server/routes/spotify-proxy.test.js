import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDatabaseUrl } from '../../test/db.js';
import { createTestApp, linkSpotify, signUp } from '../../test/http.js';
import { createPool } from '../db.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());
const app = createTestApp(pool);

function response(status, text) {
  return { status, text: async () => text };
}

async function linked(a = app) {
  const agent = request.agent(a);
  const user = await signUp(agent);
  await linkSpotify(pool, user.id, { accessToken: 'tok' });
  return agent;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ALL /spotify/*', () => {
  it('exige une session', async () => {
    const res = await request(app).get('/spotify/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'not_logged_in' });
  });

  it('exige un Spotify relié', async () => {
    const agent = request.agent(app);
    await signUp(agent);
    const res = await agent.get('/spotify/me');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'spotify_not_linked' });
  });

  it('relaie un GET avec le token du compte', async () => {
    fetch.mockResolvedValue(response(200, '{"id":"u1"}'));
    const res = await (await linked()).get('/spotify/me?market=FR');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'u1' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.spotify.com/v1/me?market=FR');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.body).toBeUndefined();
  });

  it('relaie le corps JSON d\'un PUT et une réponse vide', async () => {
    fetch.mockResolvedValue(response(204, ''));
    const res = await (await linked()).put('/spotify/me/player').send({ device_ids: ['d'] });
    expect(res.status).toBe(204);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ device_ids: ['d'] });
  });

  it('accepte le lancement d\'une partie de 500 sons', async () => {
    fetch.mockResolvedValue(response(204, ''));
    const uris = Array.from({ length: 500 }, (_, i) => `spotify:track:${String(i).padStart(22, '0')}`);
    const res = await (await linked()).put('/spotify/me/player/play?device_id=d').send({ uris, offset: { position: 0 } });
    expect(res.status).toBe(204);
  });

  it('relaie les erreurs Spotify et les journalise', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockResolvedValue(response(404, '{"error":{"message":"Not found"}}'));
    const res = await (await linked()).get('/spotify/playlists/x');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: 'Not found' } });
    expect(error).toHaveBeenCalled();
  });

  it('renvoie du JSON valide même si Spotify répond en HTML', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockResolvedValue(response(502, '<html>Bad Gateway</html>'));
    const res = await (await linked()).get('/spotify/me');
    expect(res.status).toBe(502);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toBe('<html>Bad Gateway</html>');
  });

  it('répond 502 si Spotify est injoignable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockRejectedValue(new Error('ENOTFOUND'));
    const res = await (await linked()).get('/spotify/me');
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'ENOTFOUND' });
  });

  it('répond 502 si Spotify ne répond pas à temps', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockImplementation((url, init) => new Promise((_, reject) => {
      // Sans signal d'annulation, la requête resterait bloquée indéfiniment
      init.signal?.addEventListener('abort', () => reject(init.signal.reason));
    }));
    const res = await (await linked(createTestApp(pool, { spotifyTimeoutMs: 20 }))).get('/spotify/me');
    expect(res.status).toBe(502);
  });
});

describe('token refusé par Spotify avant son expiration', () => {
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

  it('renouvelle le token et rejoue l\'appel une fois', async () => {
    fetch
      .mockResolvedValueOnce(json(401, { error: { status: 401, message: 'Invalid access token' } }))
      .mockResolvedValueOnce(json(200, { access_token: 'neuf', expires_in: 3600 }))
      .mockResolvedValueOnce(json(200, { id: 'u1' }));
    const res = await (await linked()).get('/spotify/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'u1' });
    expect(fetch.mock.calls[1][0]).toBe('https://accounts.spotify.com/api/token');
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer neuf');
  });

  it('demande de relier Spotify si l\'accès a été révoqué', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch
      .mockResolvedValueOnce(json(401, { error: { status: 401, message: 'Invalid access token' } }))
      .mockResolvedValueOnce(json(400, { error: 'invalid_grant' }));
    const agent = await linked();
    const res = await agent.get('/spotify/me');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'spotify_relink_required' });
    expect((await agent.get('/api/me')).body.user.spotifyLinked).toBe(false);
  });
});
