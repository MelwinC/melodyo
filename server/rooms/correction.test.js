import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../../test/db.js';
import { insertUser } from '../../test/factories.js';
import { settings, track } from '../../test/games.js';
import { createPool } from '../db.js';
import { createGame } from '../games.js';
import { createHub } from './hub.js';
import { joinAsGuest, openRoomFor } from './repo.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());

let clock, pending, hub;
const secret = i => track(i, { name: `TITRE_SECRET_${i}`, artists: [`ARTISTE_SECRET_${i}`], albumImage: `https://i.scdn.co/POCHETTE_${i}` });

const setTimer = (fn, ms) => { const id = Symbol('t'); pending.set(id, { fn, at: clock.now + ms }); return id; };
const clearTimer = id => pending.delete(id);
async function advance(ms) {
  clock.now += ms;
  for (const [id, t] of [...pending]) if (t.at <= clock.now) { pending.delete(id); await t.fn(); }
}
const conn = (role, participantId) => {
  const messages = [];
  return { role, participantId, messages, send: m => messages.push(m), last: () => messages.at(-1) };
};

beforeEach(() => {
  clock = { now: 1_000_000 };
  pending = new Map();
  hub = createHub({ pool, now: () => clock.now, setTimer, clearTimer });
});

async function setup({ correction = 'live', tracks = 2, players = ['Équipe A', 'Équipe B'] } = {}) {
  const host = await insertUser(pool);
  const room = await openRoomFor(pool, host.id);
  const { id: gameId } = await createGame(pool, host.id, {
    settings: settings({ timer: 'full', correction }), tracks: Array.from({ length: tracks }, (_, i) => secret(i)), roomId: room.id,
  });
  const ps = [];
  for (const name of players) ps.push((await joinAsGuest(pool, room.id, name)).participant);
  const h = conn('host');
  const seats = ps.map(p => conn('player', p.id));
  for (const c of [h, ...seats]) await hub.connect(room.id, c);
  await hub.hostEvent(room.id, { type: 'game:start', gameId });
  const ev = e => hub.hostEvent(room.id, e);
  const answer = (i, position, title, artist = '') => hub.answer(room.id, ps[i].id, { position, title, artist });
  return { room, gameId, ps, h, seats, ev, answer };
}

const play = async (ctx, position) => {
  await ctx.ev({ type: 'round:start', position, durationMs: 10_000 });
};
const close = () => advance(10_000);

describe('correction à la volée', () => {
  it('montre au créateur les réponses de tous une fois la manche fermée', async () => {
    const ctx = await setup();
    await play(ctx, 0);
    await ctx.answer(0, 0, 'Take On Me', 'a-ha');
    expect(ctx.h.last().answers).toBeNull();
    await close();
    expect(ctx.h.last()).toMatchObject({ phase: 'playing', correction: { position: 0 } });
    expect(ctx.h.last().answers).toEqual([
      { participantId: ctx.ps[0].id, title: 'Take On Me', artist: 'a-ha', titleOk: null, artistOk: null },
      { participantId: ctx.ps[1].id, title: '', artist: '', titleOk: null, artistOk: null },
    ]);
  });

  it('ignore une correction tant que la manche est ouverte ou sur une autre chanson', async () => {
    const ctx = await setup();
    await play(ctx, 0);
    await ctx.answer(0, 0, 'T', 'A');
    await ctx.ev({ type: 'correct', position: 0, participantId: ctx.ps[0].id, field: 'title', ok: true });
    await close();
    await ctx.ev({ type: 'correct', position: 1, participantId: ctx.ps[0].id, field: 'title', ok: true });
    expect(ctx.h.last().answers[0].titleOk).toBeNull();
  });

  it('met à jour les scores de tous et révèle la chanson avec les résultats', async () => {
    const ctx = await setup();
    await play(ctx, 0);
    await ctx.answer(0, 0, 'Take On Me', 'a-ha');
    await close();
    await ctx.ev({ type: 'correct', position: 0, participantId: ctx.ps[0].id, field: 'title', ok: true });
    await ctx.ev({ type: 'correct', position: 0, participantId: ctx.ps[0].id, field: 'artist', ok: false });
    await ctx.ev({ type: 'correct', position: 0, participantId: ctx.ps[0].id, field: 'artist', ok: true });
    expect(ctx.seats[1].last().scores).toEqual([
      { id: ctx.ps[0].id, name: 'Équipe A', score: 2, rank: 1 },
      { id: ctx.ps[1].id, name: 'Équipe B', score: 0, rank: 2 },
    ]);
    expect(ctx.seats[0].last().revealed).toEqual([]);
    expect(ctx.seats[0].last().you.results).toEqual([]);
    await ctx.ev({ type: 'reveal', position: 0 });
    expect(ctx.seats[0].last().revealed).toEqual([{ position: 0, name: 'TITRE_SECRET_0', artists: ['ARTISTE_SECRET_0'], albumImage: 'https://i.scdn.co/POCHETTE_0' }]);
    expect(ctx.seats[0].last().you.results).toEqual([{ position: 0, titleOk: true, artistOk: true }]);
    await ctx.ev({ type: 'reveal', position: 1 });
    expect(ctx.seats[0].last().revealed).toHaveLength(1);
  });

  it('remet la chanson en attente quand on y revient', async () => {
    const ctx = await setup();
    await play(ctx, 0);
    await ctx.answer(0, 0, 'T', '');
    await close();
    await ctx.ev({ type: 'correct', position: 0, participantId: ctx.ps[0].id, field: 'title', ok: true });
    await ctx.ev({ type: 'reveal', position: 0 });
    await play(ctx, 1);
    await play(ctx, 0);
    const state = ctx.seats[0].last();
    expect(state.revealed).toEqual([]);
    expect(state.scores[0].score).toBe(0);
    expect(state.you.answer).toEqual({ title: 'T', artist: '' });
  });

  it('passe au classement final et révèle tout', async () => {
    const ctx = await setup();
    await play(ctx, 0);
    await ctx.answer(1, 0, 'Bon', '');
    await close();
    await ctx.ev({ type: 'correct', position: 0, participantId: ctx.ps[1].id, field: 'title', ok: true });
    await ctx.ev({ type: 'game:final' });
    const state = ctx.seats[0].last();
    expect(state.phase).toBe('final');
    expect(state.revealed.map(r => r.position)).toEqual([0, 1]);
    expect(state.scores[0]).toMatchObject({ id: ctx.ps[1].id, score: 1, rank: 1 });
    expect(state.final.details[ctx.ps[1].id][0]).toMatchObject({ answer: { title: 'Bon', artist: '' }, titleOk: true });
    expect(state.final.details[ctx.ps[0].id][1]).toMatchObject({ answer: null, track: { name: 'TITRE_SECRET_1' } });
    const count = ctx.h.messages.length;
    await ctx.ev({ type: 'game:final' });
    await ctx.ev({ type: 'round:start', position: 1, durationMs: 1000 });
    expect(ctx.h.messages.length).toBe(count);
  });
});

describe('correction à la fin', () => {
  it('enchaîne les chansons puis corrige chanson par chanson jusqu\'au classement', async () => {
    const ctx = await setup({ correction: 'end' });
    await play(ctx, 0);
    await ctx.answer(0, 0, 'Un', '');
    await play(ctx, 1);
    await ctx.answer(1, 1, 'Deux', 'Artiste');
    expect(ctx.h.last().correction).toBeNull();
    await ctx.ev({ type: 'correction:start' });
    expect(ctx.h.last()).toMatchObject({ phase: 'correcting', correction: { position: 0 }, round: null });
    await ctx.ev({ type: 'correction:start' });
    await ctx.ev({ type: 'reveal', position: 0 });
    await ctx.ev({ type: 'correct', position: 0, participantId: ctx.ps[0].id, field: 'title', ok: true });
    await ctx.ev({ type: 'correction:next' });
    expect(ctx.h.last().correction).toEqual({ position: 1 });
    expect(ctx.h.last().answers[1]).toMatchObject({ title: 'Deux', artist: 'Artiste' });
    await ctx.ev({ type: 'correct', position: 1, participantId: ctx.ps[1].id, field: 'artist', ok: true });
    await ctx.ev({ type: 'correction:next' });
    expect(ctx.seats[0].last().phase).toBe('final');
    expect(ctx.seats[0].last().scores.map(s => s.score)).toEqual([1, 1]);
    expect(ctx.seats[0].last().scores.map(s => s.rank)).toEqual([1, 1]);
  });

  it('reprend la correction à une position donnée (redémarrage du serveur)', async () => {
    const ctx = await setup({ correction: 'end' });
    await ctx.ev({ type: 'correction:start', position: 1 });
    expect(ctx.h.last().correction).toEqual({ position: 1 });
    await ctx.ev({ type: 'correction:start', position: 7 });
    expect(ctx.h.last().correction).toEqual({ position: 1 });
  });

  it('se termine même sans aucun participant', async () => {
    const ctx = await setup({ correction: 'end', players: [] });
    await play(ctx, 0);
    await ctx.ev({ type: 'correction:start' });
    await ctx.ev({ type: 'reveal', position: 0 });
    expect(ctx.h.last().answers).toEqual([]);
    await ctx.ev({ type: 'correction:next' });
    await ctx.ev({ type: 'correction:next' });
    expect(ctx.h.last()).toMatchObject({ phase: 'final', scores: [] });
  });

  it('refuse correction:start en correction à la volée et correction:next hors correction', async () => {
    const ctx = await setup();
    await ctx.ev({ type: 'correction:start' });
    await ctx.ev({ type: 'correction:next' });
    expect(ctx.h.last().phase).toBe('playing');
  });
});

describe('reprise et confidentialité', () => {
  it('retrouve révélations et validations après un redémarrage du serveur', async () => {
    const ctx = await setup();
    await play(ctx, 0);
    await ctx.answer(0, 0, 'T', '');
    await close();
    await ctx.ev({ type: 'correct', position: 0, participantId: ctx.ps[0].id, field: 'title', ok: true });
    await ctx.ev({ type: 'reveal', position: 0 });
    const restarted = createHub({ pool, now: () => clock.now, setTimer, clearTimer });
    const seat = conn('player', ctx.ps[0].id);
    await restarted.connect(ctx.room.id, seat);
    await restarted.hostEvent(ctx.room.id, { type: 'game:start', gameId: ctx.gameId });
    expect(seat.last().revealed.map(r => r.position)).toEqual([0]);
    expect(seat.last().scores[0].score).toBe(1);
  });

  it('ne révèle aucune chanson avant sa révélation', async () => {
    const ctx = await setup();
    await play(ctx, 0);
    await ctx.answer(0, 0, 'x', '');
    await close();
    await ctx.ev({ type: 'correct', position: 0, participantId: ctx.ps[0].id, field: 'title', ok: false });
    await ctx.ev({ type: 'reveal', position: 0 });
    await play(ctx, 1);
    await close();
    const sent = JSON.stringify(ctx.seats.flatMap(s => s.messages));
    expect(sent).toContain('TITRE_SECRET_0');
    expect(sent).not.toMatch(/TITRE_SECRET_1|ARTISTE_SECRET_1|POCHETTE_1/);
  });

  it('ignore les commandes de correction sans partie', async () => {
    const ctx = await setup();
    await ctx.ev({ type: 'game:end' });
    for (const type of ['correction:start', 'correction:next', 'game:final']) await ctx.ev({ type });
    expect(ctx.h.last()).toMatchObject({ game: null, phase: null });
  });
});
