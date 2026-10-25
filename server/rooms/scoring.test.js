import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../../test/db.js';
import { insertUser } from '../../test/factories.js';
import { settings, track } from '../../test/games.js';
import { createPool } from '../db.js';
import { createGame } from '../games.js';
import { joinAsGuest, markRevealed, openRoomFor, saveAnswer, setValidation } from './repo.js';
import { getParticipantDetail, getScores, rank } from './scoring.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());

async function setup() {
  const host = await insertUser(pool);
  const room = await openRoomFor(pool, host.id);
  const { id: gameId } = await createGame(pool, host.id, { settings: settings(), tracks: [track(0), track(1)], roomId: room.id });
  const { participant: a } = await joinAsGuest(pool, room.id, 'A');
  const { participant: b } = await joinAsGuest(pool, room.id, 'B');
  return { gameId, a, b };
}

describe('scores', () => {
  it('compte un point par titre et par artiste validés, 0 sans réponse', async () => {
    const { gameId, a, b } = await setup();
    await saveAnswer(pool, { gameId, position: 0, participantId: a.id, title: 'T', artist: 'A' });
    await saveAnswer(pool, { gameId, position: 1, participantId: a.id, title: 'T', artist: '' });
    await setValidation(pool, { gameId, position: 0, participantId: a.id, field: 'title', ok: true });
    await setValidation(pool, { gameId, position: 0, participantId: a.id, field: 'artist', ok: true });
    await setValidation(pool, { gameId, position: 1, participantId: a.id, field: 'title', ok: false });
    expect((await getScores(pool, gameId, [a.id])).get(a.id)).toBe(0);
    await markRevealed(pool, gameId, 0);
    await markRevealed(pool, gameId, 1);
    expect(await getScores(pool, gameId, [a.id, b.id])).toEqual(new Map([[a.id, 2], [b.id, 0]]));
    expect(await getScores(pool, gameId, [b.id])).toEqual(new Map([[b.id, 0]]));
  });
});

describe('rank', () => {
  it('donne le même rang aux ex æquo, triés par nom', () => {
    expect(rank([
      { id: '3', name: 'Zoé', score: 5 },
      { id: '1', name: 'Bob', score: 3 },
      { id: '2', name: 'Alice', score: 5 },
    ])).toEqual([
      { id: '2', name: 'Alice', score: 5, rank: 1 },
      { id: '3', name: 'Zoé', score: 5, rank: 1 },
      { id: '1', name: 'Bob', score: 3, rank: 3 },
    ]);
    expect(rank([])).toEqual([]);
  });
});

describe('détail d\'un participant', () => {
  it('liste ses réponses, avec la chanson seulement si elle est révélée', async () => {
    const { gameId, a } = await setup();
    await saveAnswer(pool, { gameId, position: 0, participantId: a.id, title: 'Mon titre', artist: '' });
    await setValidation(pool, { gameId, position: 0, participantId: a.id, field: 'title', ok: true });
    await markRevealed(pool, gameId, 0);
    expect(await getParticipantDetail(pool, gameId, a.id)).toEqual([
      {
        position: 0,
        track: { position: 0, name: 'Titre 0', artists: ['Artiste 0'], albumImage: 'https://i.scdn.co/image/0' },
        answer: { title: 'Mon titre', artist: '' },
        titleOk: true,
        artistOk: null,
      },
      { position: 1, track: null, answer: null, titleOk: null, artistOk: null },
    ]);
  });
});
