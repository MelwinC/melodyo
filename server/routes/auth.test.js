import crypto from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';

const config = loadConfig({}, []);
const app = () => createApp({ config, pool: null });

function jsonResponse(status, body) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function login(agent) {
  const res = await agent.get('/login');
  return new URL(res.headers.location);
}

describe('GET /login', () => {
  it('redirige vers Spotify avec PKCE et les scopes', async () => {
    const res = await request(app()).get('/login');
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    const p = url.searchParams;
    expect(p.get('client_id')).toBe(config.spotifyClientId);
    expect(p.get('redirect_uri')).toBe(config.redirectUri);
    expect(p.get('response_type')).toBe('code');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('state')).toMatch(/^[0-9a-f]{32}$/);
    expect(p.get('scope').split(' ')).toHaveLength(10);
    expect(p.get('scope')).toContain('streaming');
  });
});

describe('GET /callback', () => {
  it('relaie une erreur Spotify', async () => {
    const res = await request(app()).get('/callback?error=access_denied');
    expect(res.headers.location).toBe('/?error=access_denied');
  });

  it('refuse un state inconnu', async () => {
    const res = await request(app()).get('/callback?code=c&state=inconnu');
    expect(res.headers.location).toBe('/?error=invalid_state');
  });

  it('échange le code avec le code_verifier correspondant au challenge', async () => {
    const a = app();
    const url = await login(request(a));
    fetch.mockResolvedValue(jsonResponse(200, { access_token: 'a', refresh_token: 'r', expires_in: 3600 }));

    const res = await request(a).get(`/callback?code=c&state=${url.searchParams.get('state')}`);

    expect(res.headers.location).toBe('/?access_token=a&refresh_token=r&expires_in=3600');
    const [tokenUrl, init] = fetch.mock.calls[0];
    expect(tokenUrl).toBe('https://accounts.spotify.com/api/token');
    const body = new URLSearchParams(init.body);
    expect(body.get('code')).toBe('c');
    expect(body.get('grant_type')).toBe('authorization_code');
    const challenge = crypto.createHash('sha256').update(body.get('code_verifier')).digest('base64url');
    expect(challenge).toBe(url.searchParams.get('code_challenge'));
  });

  it('n\'accepte un state qu\'une seule fois', async () => {
    const a = app();
    const state = (await login(request(a))).searchParams.get('state');
    fetch.mockResolvedValue(jsonResponse(200, { access_token: 'a', refresh_token: 'r', expires_in: 3600 }));
    await request(a).get(`/callback?code=c&state=${state}`);
    const res = await request(a).get(`/callback?code=c&state=${state}`);
    expect(res.headers.location).toBe('/?error=invalid_state');
  });

  it('oublie un state au bout de 10 minutes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const a = app();
    const state = (await login(request(a))).searchParams.get('state');
    vi.advanceTimersByTime(10 * 60 * 1000);
    const res = await request(a).get(`/callback?code=c&state=${state}`);
    expect(res.headers.location).toBe('/?error=invalid_state');
  });

  it.each([
    ['Spotify refuse', () => fetch.mockResolvedValue(jsonResponse(400, { error: 'invalid_grant' }))],
    ['réseau en échec', () => fetch.mockRejectedValue(new Error('ECONNRESET'))],
  ])('redirige avec token_exchange_failed si %s', async (_, arrange) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = app();
    const state = (await login(request(a))).searchParams.get('state');
    arrange();
    const res = await request(a).get(`/callback?code=c&state=${state}`);
    expect(res.headers.location).toBe('/?error=token_exchange_failed');
  });
});

describe('POST /refresh', () => {
  it('exige un refresh_token', async () => {
    const res = await request(app()).post('/refresh').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'missing_token' });
  });

  it('refuse un corps non JSON', async () => {
    const res = await request(app()).post('/refresh').set('Content-Type', 'application/json').send('{oops');
    expect(res.status).toBe(400);
  });

  it('refuse un corps trop gros', async () => {
    const res = await request(app()).post('/refresh').send({ refresh_token: 'x'.repeat(11 * 1024) });
    expect(res.status).toBe(413);
  });

  it('renvoie les nouveaux tokens', async () => {
    fetch.mockResolvedValue(jsonResponse(200, { access_token: 'n', expires_in: 3600 }));
    const res = await request(app()).post('/refresh').send({ refresh_token: 'r' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ access_token: 'n', expires_in: 3600 });
    const body = new URLSearchParams(fetch.mock.calls[0][1].body);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('r');
    expect(body.get('client_id')).toBe(config.spotifyClientId);
  });

  it.each([
    ['Spotify refuse', () => fetch.mockResolvedValue(jsonResponse(400, { error: 'invalid_grant' }))],
    ['réseau en échec', () => fetch.mockRejectedValue(new Error('ECONNRESET'))],
  ])('renvoie refresh_failed si %s', async (_, arrange) => {
    arrange();
    const res = await request(app()).post('/refresh').send({ refresh_token: 'r' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'refresh_failed' });
  });
});

describe('limite des connexions en attente', () => {
  it('oublie les plus anciennes au-delà du plafond', async () => {
    const { authRouter } = await import('./auth.js');
    const express = (await import('express')).default;
    const a = express().use(authRouter(config, { maxPending: 2 }));
    const states = [];
    for (let i = 0; i < 3; i++) states.push((await login(request(a))).searchParams.get('state'));
    fetch.mockResolvedValue(jsonResponse(200, { access_token: 'a', refresh_token: 'r', expires_in: 3600 }));

    expect((await request(a).get(`/callback?code=c&state=${states[0]}`)).headers.location).toBe('/?error=invalid_state');
    expect((await request(a).get(`/callback?code=c&state=${states[2]}`)).headers.location).toMatch(/access_token=a/);
  });
});

describe('délai Spotify sur les tokens', () => {
  const hang = () => fetch.mockImplementation((url, init) => new Promise((_, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal.reason));
  }));

  it('abandonne un refresh qui ne répond pas', async () => {
    hang();
    const express = (await import('express')).default;
    const { authRouter } = await import('./auth.js');
    const a = express().use(express.json()).use(authRouter(config, { timeoutMs: 20 }));
    const res = await request(a).post('/refresh').send({ refresh_token: 'r' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'refresh_failed' });
  });
});
