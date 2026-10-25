import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../../test/db.js';
import { settings, track } from '../../test/games.js';
import { createTestApp, signUp } from '../../test/http.js';
import { createPool } from '../db.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());
const app = createTestApp(pool);

async function host() {
  const agent = request.agent(app);
  await signUp(agent);
  return agent;
}

const body = (over = {}) => ({ settings: settings(), tracks: [track(0), track(1)], ...over });

describe('accès', () => {
  it.each([
    ['get', '/api/games'], ['post', '/api/games'], ['get', '/api/games/exclusions'],
    ['get', '/api/review'], ['post', '/api/review'], ['delete', '/api/review'],
  ])('%s %s exige une session', async (method, path) => {
    expect((await request(app)[method](path)).status).toBe(401);
  });
});

describe('POST /api/games', () => {
  it.each([
    ['trop de sons par thème', body({ settings: settings({ perTheme: 51 }) })],
    ['un timer inconnu', body({ settings: settings({ timer: 'x' }) })],
    ['un thème inconnu', body({ settings: settings({ themes: ['jazz'] }) })],
    ['aucun thème', body({ settings: settings({ themes: [] }) })],
    ['une URI qui n\'est pas Spotify', body({ tracks: [track(0, { uri: 'https://evil' })] })],
    ['une image non https', body({ tracks: [track(0, { albumImage: 'http://i.scdn.co/x' })] })],
    ['aucune chanson', body({ tracks: [] })],
    ['plus de 500 chansons', body({ tracks: Array.from({ length: 501 }, (_, i) => track(i)) })],
    ['un corps vide', undefined],
  ])('refuse %s', async (_, payload) => {
    const res = await (await host()).post('/api/games').send(payload);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_game' });
  });

  it('accepte une partie de 500 chansons', async () => {
    const tracks = Array.from({ length: 500 }, (_, i) => track(i, { name: `Un titre assez long numéro ${i}`, artists: ['Artiste A', 'Artiste B'] }));
    const res = await (await host()).post('/api/games').send(body({ tracks }));
    expect(res.status).toBe(201);
  });

  it('accepte une chanson sans pochette', async () => {
    const res = await (await host()).post('/api/games').send(body({ tracks: [track(0, { albumImage: null })] }));
    expect(res.status).toBe(201);
  });
});

describe('déroulé d\'une partie', () => {
  it('se crée, se joue, se termine et apparaît dans l\'historique', async () => {
    const agent = await host();
    const { id } = (await agent.post('/api/games').send(body())).body;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await agent.post(`/api/games/${id}/played`).send({ position: 0 })).status).toBe(204);
    expect((await agent.post(`/api/games/${id}/played`).send({ position: 1 })).status).toBe(204);
    expect((await agent.post(`/api/games/${id}/end`)).body).toEqual({ status: 'finished' });

    const { games } = (await agent.get('/api/games')).body;
    expect(games[0]).toMatchObject({ id, status: 'finished', trackCount: 2, playedCount: 2 });
    const { game } = (await agent.get(`/api/games/${id}`)).body;
    expect(game.tracks).toHaveLength(2);
    expect((await agent.get('/api/games/exclusions')).body).toEqual({ uris: ['spotify:track:t0', 'spotify:track:t1'] });
  });

  it.each([
    ['position invalide', { position: 'x' }],
    ['position inconnue', { position: 7 }],
  ])('répond 404 pour une %s', async (_, payload) => {
    const agent = await host();
    const { id } = (await agent.post('/api/games').send(body())).body;
    expect((await agent.post(`/api/games/${id}/played`).send(payload)).status).toBe(404);
  });

  it('ne termine pas deux fois une partie', async () => {
    const agent = await host();
    const { id } = (await agent.post('/api/games').send(body())).body;
    await agent.post(`/api/games/${id}/end`);
    expect((await agent.post(`/api/games/${id}/end`)).status).toBe(404);
  });

  it('cache la partie d\'un autre compte et les ids invalides', async () => {
    const owner = await host();
    const { id } = (await owner.post('/api/games').send(body())).body;
    const other = await host();
    for (const path of [`/api/games/${id}`, '/api/games/pas-un-uuid']) {
      const res = await other.get(path);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'not_found' });
    }
    expect((await other.post(`/api/games/${id}/end`)).status).toBe(404);
    expect((await other.post('/api/games/pas-un-uuid/end')).status).toBe(404);
    expect((await other.post('/api/games/pas-un-uuid/played').send({ position: 0 })).status).toBe(404);
  });
});

describe('liste à revoir', () => {
  it('ajoute, liste et retire une chanson', async () => {
    const agent = await host();
    const { fromReview, ...t } = track(3);
    expect((await agent.post('/api/review').send({ track: t })).status).toBe(204);
    expect((await agent.get('/api/review')).body.tracks).toEqual([{ ...t, addedAt: expect.any(String) }]);
    expect((await agent.delete('/api/review').send({ uri: t.uri })).status).toBe(204);
    expect((await agent.get('/api/review')).body.tracks).toEqual([]);
  });

  it('refuse une chanson ou une URI invalide', async () => {
    const agent = await host();
    expect((await agent.post('/api/review').send({ track: { uri: 'x' } })).status).toBe(400);
    expect((await agent.delete('/api/review').send({ uri: 'x' })).status).toBe(400);
  });
});

describe('partie dans une room', () => {
  it('rattache la partie à la room du créateur', async () => {
    const agent = await host();
    const { room } = (await agent.post('/api/rooms')).body;
    const res = await agent.post('/api/games').send({ ...body(), roomId: room.id });
    expect(res.status).toBe(201);
    const { rows } = await pool.query('SELECT room_id FROM games WHERE id = $1', [res.body.id]);
    expect(rows[0].room_id).toBe(room.id);
  });

  it.each([
    ['la room d\'un autre compte', async () => (await (await host()).post('/api/rooms')).body.room.id],
    ['un id invalide', async () => 'pas-un-uuid'],
  ])('refuse %s', async (_, roomId) => {
    const agent = await host();
    const res = await agent.post('/api/games').send({ ...body(), roomId: await roomId() });
    expect(res.status).toBe(400);
  });
});
