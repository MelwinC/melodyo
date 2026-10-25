import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { spotifyProxyRouter } from './spotify-proxy.js';
import express from 'express';

const app = () => createApp({ config: loadConfig({}, []), pool: null });

function response(status, text) {
  return { status, text: async () => text };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ALL /spotify/*', () => {
  it('exige un token', async () => {
    const res = await request(app()).get('/spotify/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'missing_token' });
  });

  it('relaie un GET vers l\'API Spotify avec le token', async () => {
    fetch.mockResolvedValue(response(200, '{"id":"u1"}'));
    const res = await request(app()).get('/spotify/me?market=FR').set('x-token', 'tok');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'u1' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.spotify.com/v1/me?market=FR');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.body).toBeUndefined();
  });

  it('relaie le corps JSON d\'un PUT', async () => {
    fetch.mockResolvedValue(response(204, ''));
    const res = await request(app()).put('/spotify/me/player').set('x-token', 'tok').send({ device_ids: ['d'] });
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ device_ids: ['d'] });
  });

  it('accepte le lancement d\'une partie de 500 sons', async () => {
    fetch.mockResolvedValue(response(204, ''));
    const uris = Array.from({ length: 500 }, (_, i) => `spotify:track:${String(i).padStart(22, '0')}`);
    const res = await request(app()).put('/spotify/me/player/play?device_id=d').set('x-token', 'tok').send({ uris, offset: { position: 0 } });
    expect(res.status).toBe(204);
    expect(JSON.parse(fetch.mock.calls[0][1].body).uris).toHaveLength(500);
  });

  it('relaie les erreurs Spotify et les journalise', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockResolvedValue(response(404, '{"error":{"message":"Not found"}}'));
    const res = await request(app()).get('/spotify/playlists/x').set('x-token', 'tok');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: 'Not found' } });
    expect(error).toHaveBeenCalled();
  });

  it('relaie une réponse sans corps JSON', async () => {
    fetch.mockResolvedValue(response(202, ''));
    const res = await request(app()).put('/spotify/me/player/play').set('x-token', 'tok').send({});
    expect(res.status).toBe(202);
    expect(res.text).toBe('');
  });

  it('renvoie du JSON valide même si Spotify répond en HTML', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockResolvedValue(response(502, '<html>Bad Gateway</html>'));
    const res = await request(app()).get('/spotify/me').set('x-token', 'tok');
    expect(res.status).toBe(502);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toBe('<html>Bad Gateway</html>');
  });

  it('répond 502 si Spotify est injoignable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockRejectedValue(new Error('ENOTFOUND'));
    const res = await request(app()).get('/spotify/me').set('x-token', 'tok');
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'ENOTFOUND' });
  });
});

describe('délai Spotify', () => {
  it('répond 502 si Spotify ne répond pas à temps', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockImplementation((url, init) => new Promise((_, reject) => {
      // Sans signal d'annulation, la requête resterait bloquée indéfiniment
      init.signal?.addEventListener('abort', () => reject(init.signal.reason));
    }));
    const a = express().use(express.json()).use(spotifyProxyRouter({ timeoutMs: 20 }));
    const res = await request(a).get('/spotify/me').set('x-token', 'tok');
    expect(res.status).toBe(502);
  });
});
