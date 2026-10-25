import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDatabaseUrl } from '../../test/db.js';
import { insertUser } from '../../test/factories.js';
import { createTestApp, linkSpotify, signUp } from '../../test/http.js';
import { loadConfig } from '../config.js';
import { createPool } from '../db.js';
import { loadSession } from '../session-middleware.js';
import { getLink } from '../spotify-links.js';
import { spotifyAuthRouter } from './spotify-auth.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());
const config = loadConfig({}, []);
const app = createTestApp(pool);
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

async function loggedIn(a = app) {
  const agent = request.agent(a);
  const user = await signUp(agent);
  return { agent, user };
}

async function connect(agent) {
  const res = await agent.get('/api/spotify/connect');
  return new URL(res.headers.location);
}

function spotifyAnswers({ token = json(200, { access_token: 'a', refresh_token: 'r', expires_in: 3600 }), me = json(200, { id: 'sp-user' }) } = {}) {
  fetch.mockImplementation(async url => (url.includes('/api/token') ? token : me));
}

describe('GET /api/spotify/connect', () => {
  it('renvoie vers la connexion Melodyo sans session', async () => {
    const res = await request(app).get('/api/spotify/connect');
    expect(res.headers.location).toBe('/?error=login_required');
  });

  it('redirige vers Spotify avec PKCE et les scopes', async () => {
    const { agent } = await loggedIn();
    const url = await connect(agent);
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    const p = url.searchParams;
    expect(p.get('client_id')).toBe(config.spotifyClientId);
    expect(p.get('redirect_uri')).toBe(config.redirectUri);
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('state')).toMatch(/^[0-9a-f]{32}$/);
    expect(p.get('scope').split(' ')).toHaveLength(10);
  });
});

describe('GET /callback', () => {
  it('relie Spotify au compte sans exposer de token', async () => {
    const { agent, user } = await loggedIn();
    const url = await connect(agent);
    spotifyAnswers();
    const res = await agent.get(`/callback?code=c&state=${url.searchParams.get('state')}`);
    expect(res.headers.location).toBe('/');
    expect(JSON.stringify(res.headers)).not.toMatch(/access_token|"a"/);
    expect((await agent.get('/api/me')).body.user.spotifyLinked).toBe(true);
    expect(await getLink(pool, config.tokenKey, user.id)).toMatchObject({ spotifyUserId: 'sp-user', accessToken: 'a', refreshToken: 'r' });

    const [tokenUrl, init] = fetch.mock.calls[0];
    expect(tokenUrl).toBe('https://accounts.spotify.com/api/token');
    const body = new URLSearchParams(init.body);
    const challenge = crypto.createHash('sha256').update(body.get('code_verifier')).digest('base64url');
    expect(challenge).toBe(url.searchParams.get('code_challenge'));
    expect(fetch.mock.calls[1][0]).toBe('https://api.spotify.com/v1/me');
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer a');
  });

  it('relaie un refus de Spotify', async () => {
    expect((await request(app).get('/callback?error=access_denied')).headers.location).toBe('/?error=access_denied');
  });

  it('refuse un state inconnu ou déjà utilisé', async () => {
    const { agent } = await loggedIn();
    expect((await agent.get('/callback?code=c&state=inconnu')).headers.location).toBe('/?error=invalid_state');
    const state = (await connect(agent)).searchParams.get('state');
    spotifyAnswers();
    await agent.get(`/callback?code=c&state=${state}`);
    expect((await agent.get(`/callback?code=c&state=${state}`)).headers.location).toBe('/?error=invalid_state');
  });

  it('n\'enregistre rien si la session a changé entre-temps', async () => {
    const { agent, user } = await loggedIn();
    const state = (await connect(agent)).searchParams.get('state');
    await agent.post('/api/auth/logout');
    const res = await agent.get(`/callback?code=c&state=${state}`);
    expect(res.headers.location).toBe('/?error=login_required');
    expect(fetch).not.toHaveBeenCalled();
    expect(await getLink(pool, config.tokenKey, user.id)).toBeNull();
  });

  it.each([
    ['l\'échange du code échoue', { token: json(400, { error: 'invalid_grant' }) }],
    ['le profil Spotify est illisible', { me: json(500, {}) }],
  ])('signale l\'échec si %s', async (_, answers) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { agent } = await loggedIn();
    const state = (await connect(agent)).searchParams.get('state');
    spotifyAnswers(answers);
    expect((await agent.get(`/callback?code=c&state=${state}`)).headers.location).toBe('/?error=token_exchange_failed');
  });

  it('oublie un state au bout de 10 minutes', async () => {
    const { agent } = await loggedIn();
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const state = (await connect(agent)).searchParams.get('state');
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect((await agent.get(`/callback?code=c&state=${state}`)).headers.location).toBe('/?error=invalid_state');
  });

  it('plafonne les connexions en attente', async () => {
    const a = express().use(loadSession(pool)).use(spotifyAuthRouter({ pool, config, maxPending: 2 }));
    const { agent } = await loggedIn(a.use(createTestApp(pool)));
    const states = [];
    for (let i = 0; i < 3; i++) states.push((await connect(agent)).searchParams.get('state'));
    spotifyAnswers();
    expect((await agent.get(`/callback?code=c&state=${states[0]}`)).headers.location).toBe('/?error=invalid_state');
    expect((await agent.get(`/callback?code=c&state=${states[2]}`)).headers.location).toBe('/');
  });
});

describe('GET /api/spotify/token', () => {
  it('donne le token d\'accès au propriétaire', async () => {
    const { agent, user } = await loggedIn();
    await linkSpotify(pool, user.id);
    const res = await agent.get('/api/spotify/token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accessToken: 'acc', expiresAt: expect.any(String) });
  });

  it('exige une session', async () => {
    expect((await request(app).get('/api/spotify/token')).status).toBe(401);
  });

  it('signale l\'absence de liaison', async () => {
    const { agent } = await loggedIn();
    const res = await agent.get('/api/spotify/token');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'spotify_not_linked' });
  });

  it('demande de relier Spotify si l\'accès a été révoqué', async () => {
    const { agent, user } = await loggedIn();
    await linkSpotify(pool, user.id, { expiresIn: 0, now: new Date('2020-01-01') });
    fetch.mockResolvedValue(json(400, { error: 'invalid_grant' }));
    const res = await agent.get('/api/spotify/token');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'spotify_relink_required' });
    expect((await agent.get('/api/me')).body.user.spotifyLinked).toBe(false);
  });

  it('répond 502 si Spotify est injoignable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { agent, user } = await loggedIn();
    await linkSpotify(pool, user.id, { expiresIn: 0, now: new Date('2020-01-01') });
    fetch.mockRejectedValue(new Error('ECONNRESET'));
    const res = await agent.get('/api/spotify/token');
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'spotify_unreachable' });
  });
});

describe('anciennes routes', () => {
  it('ne propose plus /login ni /refresh', async () => {
    await insertUser(pool);
    expect((await request(app).get('/login')).status).toBe(404);
    expect((await request(app).post('/refresh').send({ refresh_token: 'r' })).status).toBe(404);
  });
});
