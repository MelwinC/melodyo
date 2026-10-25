import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { testDatabaseUrl } from '../../test/db.js';
import { createTestApp, signUp, TEST_LIMITS } from '../../test/http.js';
import { createPool } from '../db.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());
const hub = { participantsChanged: vi.fn() };
const app = createTestApp(pool, { hub });

async function hostWithRoom() {
  const agent = request.agent(app);
  const user = await signUp(agent);
  const { room } = (await agent.post('/api/rooms')).body;
  return { agent, user, room };
}

describe('room du créateur', () => {
  it('exige une session', async () => {
    expect((await request(app).post('/api/rooms')).status).toBe(401);
    expect((await request(app).post('/api/rooms/close')).status).toBe(401);
  });

  it('ouvre une room, la réutilise, puis la ferme', async () => {
    const { agent, room } = await hostWithRoom();
    expect(room).toEqual({ id: expect.any(String), code: expect.stringMatching(/^[A-Z2-9]{6}$/) });
    expect((await agent.post('/api/rooms')).body.room).toEqual(room);
    expect((await agent.post('/api/rooms/close')).status).toBe(204);
    expect((await request(app).get(`/api/rooms/${room.code}`)).status).toBe(404);
    expect((await agent.post('/api/rooms')).body.room.id).not.toBe(room.id);
  });
});

describe('GET /api/rooms/:code', () => {
  it('retrouve la room avec un code saisi en minuscules et espaces', async () => {
    const { user, room } = await hostWithRoom();
    const typed = ` ${room.code.slice(0, 3).toLowerCase()} ${room.code.slice(3)} `;
    const res = await request(app).get(`/api/rooms/${encodeURIComponent(typed)}`);
    expect(res.body).toEqual({ room: { code: room.code, hostName: user.username } });
  });

  it.each(['ZZZZZZ', 'pas-un-code'])('répond room_not_found pour %s', async code => {
    const res = await request(app).get(`/api/rooms/${code}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'room_not_found' });
  });
});

describe('POST /api/rooms/:code/join', () => {
  it('fait rejoindre un compte connecté, une seule fois', async () => {
    const { room } = await hostWithRoom();
    const player = request.agent(app);
    const user = await signUp(player);
    hub.participantsChanged.mockClear();
    const first = await player.post(`/api/rooms/${room.code}/join`).send({});
    expect(first.body.participant).toMatchObject({ name: user.username, userId: user.id });
    expect((await player.post(`/api/rooms/${room.code}/join`).send({})).body.participant.id).toBe(first.body.participant.id);
    expect(hub.participantsChanged).toHaveBeenCalledWith(room.id);
  });

  it('fait rejoindre un invité avec un cookie propre à la room', async () => {
    const { room } = await hostWithRoom();
    const res = await request(app).post(`/api/rooms/${room.code.toLowerCase()}/join`).send({ guestName: '  Les Rouges  ' });
    expect(res.body.participant).toMatchObject({ name: 'Les Rouges', userId: null });
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(new RegExp(`^melodyo_guest_${room.code}=[A-Za-z0-9_-]{43};`));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Max-Age=604800/);
  });

  it('fait jouer un compte connecté en invité s\'il donne un nom', async () => {
    const { room } = await hostWithRoom();
    const player = request.agent(app);
    await signUp(player);
    const res = await player.post(`/api/rooms/${room.code}/join`).send({ guestName: 'Équipe B' });
    expect(res.body.participant).toMatchObject({ name: 'Équipe B', userId: null });
  });

  it.each([['', 'vide'], ['x'.repeat(21), 'trop long'], [42, 'pas une chaîne']])('refuse un nom %j (%s)', async guestName => {
    const { room } = await hostWithRoom();
    const res = await request(app).post(`/api/rooms/${room.code}/join`).send({ guestName });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_name' });
  });

  it('refuse un invité sans nom', async () => {
    const { room } = await hostWithRoom();
    expect((await request(app).post(`/api/rooms/${room.code}/join`).send({})).body).toEqual({ error: 'invalid_name' });
  });

  it('fonctionne sans diffusion temps réel branchée', async () => {
    const { room } = await hostWithRoom();
    const res = await request(createTestApp(pool)).post(`/api/rooms/${room.code}/join`).send({ guestName: 'Seul' });
    expect(res.status).toBe(200);
  });

  it('refuse une room inconnue', async () => {
    const res = await request(app).post('/api/rooms/ZZZZZZ/join').send({ guestName: 'A' });
    expect(res.status).toBe(404);
  });

  it('limite les tentatives', async () => {
    const limited = createTestApp(pool, { limits: { ...TEST_LIMITS, joinPerIp: { windowMs: 60_000, limit: 2 } } });
    for (let i = 0; i < 2; i++) await request(limited).post('/api/rooms/ZZZZZZ/join').send({ guestName: 'A' });
    expect((await request(limited).post('/api/rooms/ZZZZZZ/join').send({ guestName: 'A' })).status).toBe(429);
  });
});

describe('GET /api/rooms/:code/me', () => {
  it('retrouve l\'invité grâce à son cookie', async () => {
    const { room } = await hostWithRoom();
    const guest = request.agent(app);
    const { participant } = (await guest.post(`/api/rooms/${room.code}/join`).send({ guestName: 'Retour' })).body;
    expect((await guest.get(`/api/rooms/${room.code.toLowerCase()}/me`)).body).toEqual({ participant });
  });

  it('retrouve un compte qui a rejoint, ou qui a rejoint en invité', async () => {
    const { room } = await hostWithRoom();
    const player = request.agent(app);
    await signUp(player);
    expect((await player.get(`/api/rooms/${room.code}/me`)).status).toBe(404);
    const { participant } = (await player.post(`/api/rooms/${room.code}/join`).send({ guestName: 'Équipe' })).body;
    expect((await player.get(`/api/rooms/${room.code}/me`)).body.participant.id).toBe(participant.id);
    const joined = (await player.post(`/api/rooms/${room.code}/join`).send({})).body.participant;
    expect((await player.get(`/api/rooms/${room.code}/me`)).body.participant.id).toBe(joined.id);
  });

  it('répond not_joined sans participation et room_not_found pour une room inconnue', async () => {
    const { room } = await hostWithRoom();
    const res = await request(app).get(`/api/rooms/${room.code}/me`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_joined' });
    expect((await request(app).get('/api/rooms/ZZZZZZ/me')).body).toEqual({ error: 'room_not_found' });
  });
});
