import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../test/db.js';
import { insertUser } from '../test/factories.js';
import { settings, track } from '../test/games.js';
import { createPool } from './db.js';
import { createGame } from './games.js';
import { joinAsGuest, joinAsUser, markRevealed, openRoomFor, saveAnswer, setValidation } from './rooms/repo.js';
import { getStats } from './stats.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());

// Une partie terminée : answers[participant] = [[titre, artiste, titreOk, artisteOk] par chanson]
async function finishedGame(hostId, roomId, answers, { status = 'finished', themes = ['80s', '80s', 'pop', 'pop'], reveal = true } = {}) {
  const tracks = themes.map((themeId, i) => track(i, { themeId }));
  const { id: gameId } = await createGame(pool, hostId, { settings: settings(), tracks, roomId });
  for (const [participantId, rows] of answers) {
    for (const [position, [title, artist, titleOk, artistOk]] of rows.entries()) {
      if (title === undefined) continue;
      await saveAnswer(pool, { gameId, position, participantId, title, artist });
      if (titleOk !== null) await setValidation(pool, { gameId, position, participantId, field: 'title', ok: titleOk });
      if (artistOk !== null) await setValidation(pool, { gameId, position, participantId, field: 'artist', ok: artistOk });
    }
  }
  await pool.query('UPDATE games SET status = $2 WHERE id = $1', [gameId, status]);
  // Classement final atteint : toutes les chansons révélées
  if (reveal) for (let i = 0; i < themes.length; i++) await markRevealed(pool, gameId, i);
  return gameId;
}

async function world() {
  const host = await insertUser(pool);
  const room = await openRoomFor(pool, host.id);
  const player = await insertUser(pool);
  const me = await joinAsUser(pool, room.id, player.id);
  const { participant: rival } = await joinAsGuest(pool, room.id, 'Rival');
  return { host, room, player, me, rival };
}

describe('getStats', () => {
  it('donne des stats vides à un compte qui n\'a jamais joué', async () => {
    const user = await insertUser(pool);
    expect(await getStats(pool, user.id)).toEqual({
      games: 0, wins: 0, losses: 0, titleRate: null, artistRate: null, overallRate: null,
      averageRank: null, bestRank: null, themes: [],
    });
  });

  it('calcule victoires, défaites, pourcentages, classements et thèmes', async () => {
    const { host, room, player, me, rival } = await world();
    // Partie 1 : moi 3 pts (2 titres, 1 artiste, 1 chanson manquée), rival 1 pt → victoire
    await finishedGame(host.id, room.id, new Map([
      [me.id, [['a', 'b', true, true], ['c', '', true, null], ['x', 'y', false, false]]],
      [rival.id, [['r', '', true, null]]],
    ]));
    // Partie 2 : moi 0, rival 2 → défaite, rang 2
    await finishedGame(host.id, room.id, new Map([
      [me.id, [['a', '', false, null]]],
      [rival.id, [['r', 's', true, true]]],
    ]));
    expect(await getStats(pool, player.id)).toEqual({
      games: 2, wins: 1, losses: 1,
      titleRate: 25, artistRate: 13, overallRate: 19,
      averageRank: 1.5, bestRank: 1,
      themes: [
        { themeId: '80s', songs: 4, titleOk: 2, artistOk: 1 },
        { themeId: 'pop', songs: 4, titleOk: 0, artistOk: 0 },
      ],
    });
  });

  it('donne la victoire à tous les ex æquo et ignore les parties solo pour les classements', async () => {
    const { host, room, player, me, rival } = await world();
    await finishedGame(host.id, room.id, new Map([[me.id, [['a', '', true, null]]], [rival.id, [['b', '', true, null]]]]));
    await finishedGame(host.id, room.id, new Map([[me.id, [['a', 'b', true, true]]]]));
    const stats = await getStats(pool, player.id);
    expect(stats).toMatchObject({ games: 2, wins: 1, losses: 0, averageRank: 1, bestRank: 1 });
  });

  it('ignore les parties interrompues ou en cours', async () => {
    const { host, room, player, me, rival } = await world();
    for (const status of ['interrupted', 'playing']) {
      await finishedGame(host.id, room.id, new Map([[me.id, [['a', '', true, null]]], [rival.id, [['b', '', false, null]]]]), { status });
    }
    expect((await getStats(pool, player.id)).games).toBe(0);
  });

  it('retient le meilleur score quand un compte a deux participations dans une même partie', async () => {
    const host = await insertUser(pool);
    const player = await insertUser(pool);
    const roomA = await openRoomFor(pool, host.id);
    const meA = await joinAsUser(pool, roomA.id, player.id);
    const { participant: other } = await joinAsGuest(pool, roomA.id, 'Autre');
    const gameId = await finishedGame(host.id, roomA.id, new Map([
      [meA.id, [['a', '', false, null]]],
      [other.id, [['o', '', true, null]]],
    ]));
    // Seconde participation du même compte dans la même partie, via une autre room (cas limite)
    const host2 = await insertUser(pool);
    const roomB = await openRoomFor(pool, host2.id);
    const meB = await joinAsUser(pool, roomB.id, player.id);
    await saveAnswer(pool, { gameId, position: 1, participantId: meB.id, title: 'z', artist: 'w' });
    await setValidation(pool, { gameId, position: 1, participantId: meB.id, field: 'title', ok: true });
    await setValidation(pool, { gameId, position: 1, participantId: meB.id, field: 'artist', ok: true });
    const stats = await getStats(pool, player.id);
    expect(stats).toMatchObject({ games: 1, wins: 1, bestRank: 1 });
  });

  it('ignore une partie qui n\'a pas atteint le classement final (correction abandonnée)', async () => {
    const { host, room, player, me, rival } = await world();
    await finishedGame(host.id, room.id, new Map([[me.id, [['a', '', null, null]]], [rival.id, [['b', '', null, null]]]]), { reveal: false });
    expect((await getStats(pool, player.id)).games).toBe(0);
  });

  it('ne compte comme joueurs que ceux qui ont donné une réponse non vide', async () => {
    const { host, room, player, me, rival } = await world();
    await finishedGame(host.id, room.id, new Map([[me.id, [['a', '', true, null]]], [rival.id, [['', '', null, null]]]]));
    expect(await getStats(pool, player.id)).toMatchObject({ games: 1, wins: 0, losses: 0, bestRank: null });
    const loner = await insertUser(pool);
    const blank = await joinAsUser(pool, room.id, loner.id);
    await finishedGame(host.id, room.id, new Map([[blank.id, [['', '', null, null]]], [me.id, [['a', '', true, null]]]]));
    expect((await getStats(pool, loner.id)).games).toBe(0);
  });

  it('classe 1, 1, 3 avec trois joueurs', async () => {
    const { host, room, player, me, rival } = await world();
    const { participant: third } = await joinAsGuest(pool, room.id, 'Troisième');
    await finishedGame(host.id, room.id, new Map([
      [me.id, [['a', '', false, null]]], [rival.id, [['b', 'c', true, true]]], [third.id, [['d', 'e', true, true]]],
    ]));
    expect(await getStats(pool, player.id)).toMatchObject({ wins: 0, losses: 1, bestRank: 3 });
  });
});
