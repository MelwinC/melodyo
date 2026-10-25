import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../../test/db.js';
import { uniqueName } from '../../test/factories.js';
import { createTestApp, signUp } from '../../test/http.js';
import { createPool } from '../db.js';
import { createSession } from '../sessions.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());

const app = createTestApp(pool);
const register = (agent, body) => agent.post('/api/auth/register').send(body);
const login = (agent, body) => agent.post('/api/auth/login').send(body);
const cookieOf = res => res.headers['set-cookie'][0];

describe('inscription', () => {
  it('crée le compte et ouvre une session par cookie', async () => {
    const username = uniqueName('Mel');
    const res = await register(request(app), { username, password: 'motdepasse' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username, avatar: { kind: 'preset', value: 'note' }, spotifyLinked: false });
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/^melodyo_sid=[A-Za-z0-9_-]{43};/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie).not.toMatch(/Secure/);
  });

  it('pose un cookie Secure en production', async () => {
    const prodApp = createTestApp(pool, { prod: true });
    const res = await register(request(prodApp), { username: uniqueName(), password: 'motdepasse' });
    expect(cookieOf(res)).toMatch(/Secure/);
  });

  it.each([
    ['trop court', { username: 'ab', password: 'motdepasse' }, 'invalid_username'],
    ['trop long', { username: 'a'.repeat(21), password: 'motdepasse' }, 'invalid_username'],
    ['caractères interdits', { username: 'mel win', password: 'motdepasse' }, 'invalid_username'],
    ['sans corps', undefined, 'invalid_username'],
    ['mot de passe trop court', { username: 'melwin', password: '1234567' }, 'invalid_password'],
    ['mot de passe trop long', { username: 'melwin', password: 'x'.repeat(201) }, 'invalid_password'],
  ])('refuse un %s', async (_, body, error) => {
    const res = await register(request(app), body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
  });

  it('répond 500 si la base refuse l\'inscription pour une autre raison', async () => {
    const { vi } = await import('vitest');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { query: () => Promise.reject(new Error('disk full')) };
    const res = await register(request(createTestApp(broken)), { username: uniqueName(), password: 'motdepasse' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'server_error' });
    error.mockRestore();
  });

  it('refuse un pseudo déjà pris, quelle que soit la casse', async () => {
    const username = uniqueName('Mel');
    await register(request(app), { username, password: 'motdepasse' });
    const res = await register(request(app), { username: username.toLowerCase(), password: 'motdepasse' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'username_taken' });
  });
});

describe('connexion', () => {
  it('ouvre une session valable sur plusieurs appareils', async () => {
    const username = uniqueName();
    await signUp(request(app), username);
    const pc = request.agent(app);
    const phone = request.agent(app);
    expect((await login(pc, { username, password: 'motdepasse' })).status).toBe(200);
    const res = await login(phone, { username: username.toUpperCase(), password: 'motdepasse' });
    expect(res.body.user.username).toBe(username);
    expect((await pc.get('/api/me')).body.user.username).toBe(username);
    expect((await phone.get('/api/me')).body.user.username).toBe(username);
  });

  it.each([
    ['mauvais mot de passe', u => ({ username: u, password: 'mauvaismdp' })],
    ['pseudo inconnu', () => ({ username: uniqueName(), password: 'motdepasse' })],
    ['corps invalide', () => ({ username: 'x' })],
  ])('répond pareil pour un %s', async (_, body) => {
    const username = uniqueName();
    await signUp(request(app), username);
    const res = await login(request(app), body(username));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_credentials' });
  });
});

describe('session', () => {
  it('se ferme sur un appareil sans fermer les autres', async () => {
    const username = uniqueName();
    const pc = request.agent(app);
    const phone = request.agent(app);
    await signUp(pc, username);
    await login(phone, { username, password: 'motdepasse' });
    const res = await pc.post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(cookieOf(res)).toMatch(/melodyo_sid=;/);
    expect((await pc.get('/api/me')).status).toBe(401);
    expect((await phone.get('/api/me')).status).toBe(200);
  });

  it('accepte une déconnexion sans session', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(204);
  });

  it('refuse un cookie inconnu ou une session expirée', async () => {
    const unknown = await request(app).get('/api/me').set('Cookie', 'melodyo_sid=inconnu');
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual({ error: 'not_logged_in' });

    const { rows } = await pool.query("INSERT INTO users (username, password_hash) VALUES ($1, 'h') RETURNING id", [uniqueName()]);
    const token = await createSession(pool, rows[0].id, { now: new Date('2020-01-01') });
    expect((await request(app).get('/api/me').set('Cookie', `melodyo_sid=${token}`)).status).toBe(401);
  });

  it('répond 500 en JSON si la base tombe pendant la lecture de session', async () => {
    const error = (await import('vitest')).vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { query: () => Promise.reject(new Error('down')) };
    const res = await request(createTestApp(broken)).get('/api/me').set('Cookie', 'melodyo_sid=abc');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'server_error' });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('limites de tentatives', () => {
  const tiny = { windowMs: 60_000, limit: 2 };

  it('bloque les connexions en rafale depuis une même IP', async () => {
    const limited = createTestApp(pool, { limits: { loginPerIp: tiny, loginPerUser: { windowMs: 60_000, limit: 100 }, registerPerIp: tiny } });
    for (let i = 0; i < 2; i++) await login(request(limited), { username: uniqueName(), password: 'mauvaismdp' });
    const res = await login(request(limited), { username: uniqueName(), password: 'mauvaismdp' });
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'too_many_requests' });
  });

  it('bloque les tentatives répétées sur un même pseudo', async () => {
    const limited = createTestApp(pool, { limits: { loginPerIp: { windowMs: 60_000, limit: 100 }, loginPerUser: tiny, registerPerIp: tiny } });
    const username = uniqueName();
    for (let i = 0; i < 2; i++) await login(request(limited), { username, password: 'mauvaismdp' });
    expect((await login(request(limited), { username: username.toUpperCase(), password: 'mauvaismdp' })).status).toBe(429);
    expect((await login(request(limited), { username: uniqueName(), password: 'mauvaismdp' })).status).toBe(401);
  });

  it('ne compte pas les connexions réussies', async () => {
    const limited = createTestApp(pool, { limits: { loginPerIp: tiny, loginPerUser: tiny, registerPerIp: { windowMs: 60_000, limit: 100 } } });
    const username = uniqueName();
    await signUp(request(limited), username);
    for (let i = 0; i < 3; i++) expect((await login(request(limited), { username, password: 'motdepasse' })).status).toBe(200);
  });

  it('bloque les inscriptions en rafale', async () => {
    const limited = createTestApp(pool, { limits: { loginPerIp: tiny, loginPerUser: tiny, registerPerIp: tiny } });
    for (let i = 0; i < 2; i++) await register(request(limited), { username: uniqueName(), password: 'motdepasse' });
    expect((await register(request(limited), { username: uniqueName(), password: 'motdepasse' })).status).toBe(429);
  });
});
