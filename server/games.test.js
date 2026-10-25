import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../test/db.js';
import { insertUser } from '../test/factories.js';
import { settings, track } from '../test/games.js';
import { createPool } from './db.js';
import { createGame, endGame, getGame, lastGameExclusions, listGames, markPlayed } from './games.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());

const newGame = (hostId, n = 3) => createGame(pool, hostId, { settings: settings(), tracks: Array.from({ length: n }, (_, i) => track(i)) });

describe('parties', () => {
  it('enregistre une partie en cours avec ses chansons', async () => {
    const host = await insertUser(pool);
    const { id } = await newGame(host.id);
    const game = await getGame(pool, host.id, id);
    expect(game).toMatchObject({ id, status: 'playing', settings: settings(), trackCount: 3, playedCount: 0, endedAt: null });
    expect(game.tracks[1]).toEqual({ ...track(1), position: 1, played: false });
  });

  it('annule tout si l\'enregistrement échoue', async () => {
    const host = await insertUser(pool);
    const first = await newGame(host.id);
    await expect(createGame(pool, host.id, { settings: settings(), tracks: [track(0, { name: null })] })).rejects.toThrow();
    expect((await getGame(pool, host.id, first.id)).status).toBe('playing');
    expect(await listGames(pool, host.id)).toHaveLength(1);
  });

  it('interrompt la partie en cours quand une autre commence', async () => {
    const host = await insertUser(pool);
    const first = await newGame(host.id);
    await newGame(host.id);
    expect((await getGame(pool, host.id, first.id)).status).toBe('interrupted');
  });

  it('marque les chansons jouées', async () => {
    const host = await insertUser(pool);
    const { id } = await newGame(host.id);
    expect(await markPlayed(pool, host.id, id, 1)).toBe(true);
    expect(await markPlayed(pool, host.id, id, 9)).toBe(false);
    expect((await getGame(pool, host.id, id)).playedCount).toBe(1);
  });

  it('termine une partie entièrement jouée, interrompt sinon', async () => {
    const host = await insertUser(pool);
    const done = await newGame(host.id, 2);
    await markPlayed(pool, host.id, done.id, 0);
    await markPlayed(pool, host.id, done.id, 1);
    expect(await endGame(pool, host.id, done.id)).toBe('finished');
    expect((await getGame(pool, host.id, done.id)).endedAt).toBeInstanceOf(Date);

    const partial = await newGame(host.id, 2);
    await markPlayed(pool, host.id, partial.id, 0);
    expect(await endGame(pool, host.id, partial.id)).toBe('interrupted');
    expect(await endGame(pool, host.id, partial.id)).toBeNull();
  });

  it('liste les parties de la plus récente à la plus ancienne', async () => {
    const host = await insertUser(pool);
    const a = await newGame(host.id, 1);
    const b = await newGame(host.id, 2);
    const games = await listGames(pool, host.id);
    expect(games.map(g => g.id)).toEqual([b.id, a.id]);
    expect(games[0]).toMatchObject({ trackCount: 2, playedCount: 0, status: 'playing' });
    expect(games[0]).not.toHaveProperty('tracks');
  });

  it('cache les parties des autres comptes', async () => {
    const host = await insertUser(pool);
    const other = await insertUser(pool);
    const { id } = await newGame(host.id);
    expect(await getGame(pool, other.id, id)).toBeNull();
    expect(await markPlayed(pool, other.id, id, 0)).toBe(false);
    expect(await endGame(pool, other.id, id)).toBeNull();
    expect(await listGames(pool, other.id)).toEqual([]);
  });

  it('exclut les chansons jouées de la dernière partie seulement', async () => {
    const host = await insertUser(pool);
    expect(await lastGameExclusions(pool, host.id)).toEqual([]);
    const old = await newGame(host.id);
    await markPlayed(pool, host.id, old.id, 0);
    const last = await newGame(host.id);
    await markPlayed(pool, host.id, last.id, 2);
    expect(await lastGameExclusions(pool, host.id)).toEqual(['spotify:track:t2']);
  });
});
