import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../../test/db.js';
import { insertUser } from '../../test/factories.js';
import { settings, track } from '../../test/games.js';
import { createPool } from '../db.js';
import { createGame } from '../games.js';
import {
  closeRoom, findOpenRoomByCode, findParticipant, getAnswers, getAnswersOf,
  joinAsGuest, joinAsUser, listParticipants, openRoomFor, saveAnswer,
} from './repo.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());

describe('rooms', () => {
  it('réutilise la room ouverte du créateur', async () => {
    const host = await insertUser(pool);
    const a = await openRoomFor(pool, host.id);
    expect(a).toEqual({ id: expect.any(String), code: expect.stringMatching(/^[A-Z2-9]{6}$/), hostId: host.id });
    expect(await openRoomFor(pool, host.id)).toEqual(a);
  });

  it('ouvre une nouvelle room après la fermeture', async () => {
    const host = await insertUser(pool);
    const a = await openRoomFor(pool, host.id);
    await closeRoom(pool, host.id);
    expect(await findOpenRoomByCode(pool, a.code)).toBeNull();
    expect((await openRoomFor(pool, host.id)).id).not.toBe(a.id);
  });

  it('change de code en cas de collision', async () => {
    const other = await openRoomFor(pool, (await insertUser(pool)).id);
    const host = await insertUser(pool);
    const codes = [other.code, 'ZZZ999'];
    const room = await openRoomFor(pool, host.id, { generate: () => codes.shift() ?? 'YYY888' });
    expect(room.code).toBe('ZZZ999');
  });

  it('relaie une autre erreur de base', async () => {
    await expect(openRoomFor(pool, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ code: '23503' });
  });

  it('abandonne après 5 collisions', async () => {
    const other = await openRoomFor(pool, (await insertUser(pool)).id);
    const host = await insertUser(pool);
    await expect(openRoomFor(pool, host.id, { generate: () => other.code })).rejects.toThrow();
  });

  it('retrouve une room ouverte par son code avec le pseudo du créateur', async () => {
    const host = await insertUser(pool);
    const room = await openRoomFor(pool, host.id);
    expect(await findOpenRoomByCode(pool, room.code)).toEqual({ ...room, hostName: host.username });
    expect(await findOpenRoomByCode(pool, 'ZZZZZZ')).toBeNull();
  });
});

describe('participants', () => {
  it('rejoint avec un compte une seule fois', async () => {
    const room = await openRoomFor(pool, (await insertUser(pool)).id);
    const player = await insertUser(pool);
    const p1 = await joinAsUser(pool, room.id, player.id);
    expect(p1).toEqual({ id: expect.any(String), name: player.username, avatar: { kind: 'preset', value: 'note' }, userId: player.id });
    expect(await joinAsUser(pool, room.id, player.id)).toEqual(p1);
    expect(await findParticipant(pool, room.id, { userId: player.id })).toEqual(p1);
  });

  it('rejoint en invité avec un token dont seul le hash est stocké', async () => {
    const room = await openRoomFor(pool, (await insertUser(pool)).id);
    const { participant, token } = await joinAsGuest(pool, room.id, 'Les Rouges');
    expect(participant).toEqual({ id: expect.any(String), name: 'Les Rouges', avatar: { kind: 'preset', value: 'note' }, userId: null });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { rows } = await pool.query('SELECT guest_token_hash FROM participants WHERE id = $1', [participant.id]);
    expect(rows[0].guest_token_hash).not.toBe(token);
    expect(await findParticipant(pool, room.id, { guestToken: token })).toEqual(participant);
  });

  it('refuse un mauvais token ou celui d\'une autre room', async () => {
    const room = await openRoomFor(pool, (await insertUser(pool)).id);
    const other = await openRoomFor(pool, (await insertUser(pool)).id);
    const { token } = await joinAsGuest(pool, room.id, 'A');
    expect(await findParticipant(pool, room.id, { guestToken: 'faux' })).toBeNull();
    expect(await findParticipant(pool, other.id, { guestToken: token })).toBeNull();
    expect(await findParticipant(pool, room.id, {})).toBeNull();
  });

  it('liste les participants dans l\'ordre d\'arrivée avec leur avatar', async () => {
    const room = await openRoomFor(pool, (await insertUser(pool)).id);
    const player = await insertUser(pool);
    await pool.query("UPDATE users SET avatar_kind = 'upload', avatar_value = 'a.webp' WHERE id = $1", [player.id]);
    await joinAsGuest(pool, room.id, 'Invité');
    await joinAsUser(pool, room.id, player.id);
    const list = await listParticipants(pool, room.id);
    expect(list.map(p => p.name)).toEqual(['Invité', player.username]);
    expect(list[1].avatar).toEqual({ kind: 'upload', value: 'a.webp' });
  });
});

describe('réponses', () => {
  it('enregistre la dernière version de chaque réponse', async () => {
    const host = await insertUser(pool);
    const room = await openRoomFor(pool, host.id);
    const { id: gameId } = await createGame(pool, host.id, { settings: settings(), tracks: [track(0), track(1)], roomId: room.id });
    const { participant } = await joinAsGuest(pool, room.id, 'A');
    await saveAnswer(pool, { gameId, position: 0, participantId: participant.id, title: 'Titre', artist: '' });
    await saveAnswer(pool, { gameId, position: 0, participantId: participant.id, title: 'Titre', artist: 'Artiste' });
    await saveAnswer(pool, { gameId, position: 1, participantId: participant.id, title: 'Autre', artist: '' });
    expect(await getAnswers(pool, gameId, 0)).toEqual(new Map([[participant.id, { title: 'Titre', artist: 'Artiste' }]]));
    expect(await getAnswersOf(pool, gameId, participant.id)).toEqual(new Map([
      [0, { title: 'Titre', artist: 'Artiste' }],
      [1, { title: 'Autre', artist: '' }],
    ]));
    const { rows } = await pool.query('SELECT room_id FROM games WHERE id = $1', [gameId]);
    expect(rows[0].room_id).toBe(room.id);
  });
});
