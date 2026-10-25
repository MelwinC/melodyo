import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDatabaseUrl } from '../../test/db.js';
import { insertUser } from '../../test/factories.js';
import { settings, track } from '../../test/games.js';
import { createPool } from '../db.js';
import { createGame } from '../games.js';
import { createHub } from './hub.js';
import { joinAsGuest, openRoomFor } from './repo.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());

let clock, timers, hub;
const secret = i => track(i, { name: `TITRE_SECRET_${i}`, artists: [`ARTISTE_SECRET_${i}`], albumImage: `https://i.scdn.co/POCHETTE_${i}` });

function fakeTimers() {
  const pending = new Map();
  let next = 1;
  return {
    setTimer: (fn, ms) => { const id = next++; pending.set(id, { fn, at: clock.now + ms }); return id; },
    clearTimer: id => pending.delete(id),
    async advance(ms) {
      clock.now += ms;
      for (const [id, t] of [...pending]) {
        if (t.at <= clock.now) { pending.delete(id); await t.fn(); }
      }
    },
    count: () => pending.size,
  };
}

const conn = (role, participantId) => {
  const messages = [];
  return { role, participantId, messages, send: m => messages.push(m), last: () => messages.at(-1) };
};

async function setup({ timer = '30s', tracks = 3 } = {}) {
  const host = await insertUser(pool);
  const room = await openRoomFor(pool, host.id);
  const { id: gameId } = await createGame(pool, host.id, {
    settings: settings({ timer }), tracks: Array.from({ length: tracks }, (_, i) => secret(i)), roomId: room.id,
  });
  const { participant: a } = await joinAsGuest(pool, room.id, 'Équipe A');
  const { participant: b } = await joinAsGuest(pool, room.id, 'Équipe B');
  const h = conn('host');
  const pa = conn('player', a.id);
  const pb = conn('player', b.id);
  await hub.connect(room.id, h);
  await hub.connect(room.id, pa);
  await hub.connect(room.id, pb);
  return { room, gameId, a, b, h, pa, pb };
}

beforeEach(() => {
  clock = { now: 1_000_000 };
  timers = fakeTimers();
  hub = createHub({ pool, now: () => clock.now, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
});

describe('connexion', () => {
  it('envoie l\'état de la room à chaque connexion', async () => {
    const { pa, h, a, b } = await setup();
    expect(pa.last()).toEqual({
      type: 'state',
      participants: [
        { id: a.id, name: 'Équipe A', avatar: { kind: 'preset', value: 'note' }, connected: true },
        { id: b.id, name: 'Équipe B', avatar: { kind: 'preset', value: 'note' }, connected: true },
      ],
      game: null,
      round: null,
      phase: null,
      correction: null,
      revealed: [],
      scores: [],
      final: null,
      you: { id: a.id, answer: null, results: [] },
    });
    expect(h.last()).toMatchObject({ type: 'state', game: null, round: null, answered: [] });
    expect(h.last()).not.toHaveProperty('you');
  });
});

describe('manches', () => {
  it('ouvre une manche de 90 s en mode 30 s', async () => {
    const { room, gameId, pa, h } = await setup({ timer: '30s' });
    await hub.hostEvent(room.id, { type: 'game:start', gameId });
    expect(pa.last().game).toEqual({ id: gameId, total: 3, timer: '30s', correction: 'live' });
    await hub.hostEvent(room.id, { type: 'round:start', position: 0, durationMs: 200000 });
    expect(pa.last().round).toEqual({ position: 0, status: 'open', remainingMs: 90000, paused: false });
    expect(h.last().round.status).toBe('open');
  });

  it('utilise la durée de lecture en mode chanson entière et ferme à l\'échéance', async () => {
    const { room, gameId, pa } = await setup({ timer: 'full' });
    await hub.hostEvent(room.id, { type: 'game:start', gameId });
    await hub.hostEvent(room.id, { type: 'round:start', position: 1, durationMs: 180000 });
    expect(pa.last().round.remainingMs).toBe(180000);
    await timers.advance(179999);
    expect(pa.last().round.status).toBe('open');
    await timers.advance(1);
    expect(pa.last().round).toMatchObject({ status: 'closed', remainingMs: 0 });
  });

  it('fige le délai pendant la pause', async () => {
    const { room, gameId, pa } = await setup();
    await hub.hostEvent(room.id, { type: 'game:start', gameId });
    await hub.hostEvent(room.id, { type: 'round:start', position: 0, durationMs: 1 });
    await timers.advance(30000);
    await hub.hostEvent(room.id, { type: 'playback', paused: true });
    expect(pa.last().round).toMatchObject({ remainingMs: 60000, paused: true });
    expect(timers.count()).toBe(0);
    await timers.advance(600000);
    await hub.hostEvent(room.id, { type: 'playback', paused: false });
    expect(pa.last().round).toMatchObject({ remainingMs: 60000, paused: false });
    await timers.advance(60000);
    expect(pa.last().round.status).toBe('closed');
  });

  it('ignore les événements sans partie ou hors de la partie', async () => {
    const { room, gameId, pa } = await setup();
    const before = pa.messages.length;
    await hub.hostEvent(room.id, { type: 'round:start', position: 0, durationMs: 1000 });
    await hub.hostEvent(room.id, { type: 'playback', paused: true });
    await hub.hostEvent(room.id, { type: 'game:start', gameId: '00000000-0000-0000-0000-000000000000' });
    expect(pa.messages.length).toBe(before);
    await hub.hostEvent(room.id, { type: 'game:start', gameId });
    await hub.hostEvent(room.id, { type: 'round:start', position: 9, durationMs: 1000 });
    expect(pa.last().round).toBeNull();
  });

  it('ignore une pause quand la manche est fermée ou pas encore ouverte', async () => {
    const { room, gameId, pa } = await setup();
    await hub.hostEvent(room.id, { type: 'game:start', gameId });
    const before = pa.messages.length;
    await hub.hostEvent(room.id, { type: 'playback', paused: true });
    await hub.hostEvent(room.id, { type: 'round:start', position: 0, durationMs: 1 });
    await timers.advance(90000);
    const afterClose = pa.messages.length;
    await hub.hostEvent(room.id, { type: 'playback', paused: false });
    expect(pa.messages.length).toBe(afterClose);
    expect(afterClose).toBeGreaterThan(before);
  });

  it('ignore une reprise qui répète la partie et la chanson en cours (reconnexion du créateur)', async () => {
    const { room, gameId, a, pa } = await setup();
    await hub.hostEvent(room.id, { type: 'game:start', gameId });
    await hub.hostEvent(room.id, { type: 'round:start', position: 0, durationMs: 1 });
    await hub.answer(room.id, a.id, { position: 0, title: 'Gardée', artist: '' });
    await timers.advance(30000);
    await hub.hostEvent(room.id, { type: 'game:start', gameId });
    await hub.hostEvent(room.id, { type: 'round:start', position: 0, durationMs: 1 });
    await hub.participantsChanged(room.id);
    expect(pa.last().round).toMatchObject({ position: 0, status: 'open', remainingMs: 60000 });
    expect(pa.last().you.answer).toEqual({ title: 'Gardée', artist: '' });
  });

  it('recrée la manche après un redémarrage du serveur', async () => {
    const { room, gameId, pa } = await setup();
    const restarted = createHub({ pool, now: () => clock.now, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
    await restarted.connect(room.id, pa);
    await restarted.hostEvent(room.id, { type: 'game:start', gameId });
    await restarted.hostEvent(room.id, { type: 'round:start', position: 1, durationMs: 1 });
    expect(pa.last().round).toMatchObject({ position: 1, status: 'open' });
  });

  it('termine la partie', async () => {
    const { room, gameId, pa } = await setup();
    await hub.hostEvent(room.id, { type: 'game:start', gameId });
    await hub.hostEvent(room.id, { type: 'round:start', position: 0, durationMs: 1000 });
    await hub.hostEvent(room.id, { type: 'game:end' });
    expect(pa.last()).toMatchObject({ game: null, round: null });
    expect(timers.count()).toBe(0);
  });
});

describe('réponses', () => {
  async function playing() {
    const ctx = await setup();
    await hub.hostEvent(ctx.room.id, { type: 'game:start', gameId: ctx.gameId });
    await hub.hostEvent(ctx.room.id, { type: 'round:start', position: 0, durationMs: 1000 });
    return ctx;
  }

  it('enregistre une réponse pendant la manche et prévient le créateur', async () => {
    const { room, a, pa, h } = await playing();
    expect(await hub.answer(room.id, a.id, { position: 0, title: 'Take On Me', artist: '' })).toBe('saved');
    expect(h.last().answered).toEqual([a.id]);
    expect(pa.last().you).toEqual({ id: a.id, answer: { title: 'Take On Me', artist: '' }, results: [] });
    expect(JSON.stringify(h.last())).not.toContain('Take On Me');
  });

  it('ne compte pas une réponse vide comme donnée', async () => {
    const { room, a, h } = await playing();
    await hub.answer(room.id, a.id, { position: 0, title: '', artist: '' });
    expect(h.last().answered).toEqual([]);
  });

  it('refuse une réponse après la fermeture ou sur une autre manche', async () => {
    const { room, a, pa } = await playing();
    await hub.answer(room.id, a.id, { position: 0, title: 'Avant', artist: '' });
    expect(await hub.answer(room.id, a.id, { position: 1, title: 'X', artist: '' })).toBe('closed');
    await timers.advance(90000);
    expect(await hub.answer(room.id, a.id, { position: 0, title: 'Après', artist: '' })).toBe('closed');
    expect(pa.last().you.answer).toEqual({ title: 'Avant', artist: '' });
    expect(await hub.answer('00000000-0000-0000-0000-000000000000', a.id, { position: 0, title: 'X', artist: '' })).toBe('closed');
  });

  it('rouvre une manche précédente avec un délai complet et la réponse déjà saisie', async () => {
    const { room, a, pa } = await playing();
    await hub.answer(room.id, a.id, { position: 0, title: 'Première', artist: 'A' });
    await timers.advance(50000);
    await hub.hostEvent(room.id, { type: 'round:start', position: 1, durationMs: 1000 });
    expect(pa.last().you.answer).toBeNull();
    await hub.hostEvent(room.id, { type: 'round:start', position: 0, durationMs: 1000 });
    expect(pa.last().round).toMatchObject({ position: 0, status: 'open', remainingMs: 90000 });
    expect(pa.last().you.answer).toEqual({ title: 'Première', artist: 'A' });
  });

  it('rend sa réponse et le temps restant à un participant qui se reconnecte', async () => {
    const { room, a, pa } = await playing();
    await hub.answer(room.id, a.id, { position: 0, title: 'Moi', artist: '' });
    await hub.disconnect(room.id, pa);
    await timers.advance(40000);
    const back = conn('player', a.id);
    await hub.connect(room.id, back);
    expect(back.last().round.remainingMs).toBe(50000);
    expect(back.last().you.answer).toEqual({ title: 'Moi', artist: '' });
  });

  it('ne révèle jamais les chansons aux participants', async () => {
    const { room, a, b, pa, pb } = await playing();
    await hub.answer(room.id, a.id, { position: 0, title: 'x', artist: 'y' });
    await hub.hostEvent(room.id, { type: 'round:start', position: 1, durationMs: 1000 });
    await timers.advance(90000);
    await hub.answer(room.id, b.id, { position: 1, title: 'z', artist: '' });
    await hub.hostEvent(room.id, { type: 'game:end' });
    const sent = JSON.stringify([...pa.messages, ...pb.messages]);
    expect(sent).not.toMatch(/TITRE_SECRET|ARTISTE_SECRET|POCHETTE_|spotify:track/);
  });
});

describe('participants', () => {
  it('rediffuse la liste quand quelqu\'un rejoint', async () => {
    const { room, h } = await setup();
    await joinAsGuest(pool, room.id, 'Nouveaux');
    await hub.participantsChanged(room.id);
    expect(h.last().participants.map(p => p.name)).toContain('Nouveaux');
    await hub.participantsChanged('00000000-0000-0000-0000-000000000000');
  });

  it('montre un participant déconnecté', async () => {
    const { room, h, pb, b } = await setup();
    await hub.disconnect(room.id, pb);
    expect(h.last().participants.find(p => p.id === b.id).connected).toBe(false);
  });
});

describe('mémoire', () => {
  it('oublie une room restée 2 h sans aucune connexion', async () => {
    const { room, gameId, a, h, pa, pb } = await setup({ timer: 'full' });
    await hub.hostEvent(room.id, { type: 'game:start', gameId });
    await hub.hostEvent(room.id, { type: 'round:start', position: 0, durationMs: 3 * 3600 * 1000 });
    for (const c of [h, pa, pb]) await hub.disconnect(room.id, c);
    await timers.advance(2 * 3600 * 1000);
    expect(await hub.answer(room.id, a.id, { position: 0, title: 'x', artist: '' })).toBe('closed');
    expect(timers.count()).toBe(0);
  });

  it('garde la room si quelqu\'un revient avant', async () => {
    const { room, gameId, a, h, pa, pb } = await setup({ timer: 'full' });
    await hub.hostEvent(room.id, { type: 'game:start', gameId });
    await hub.hostEvent(room.id, { type: 'round:start', position: 0, durationMs: 3 * 3600 * 1000 });
    for (const c of [h, pa, pb]) await hub.disconnect(room.id, c);
    await timers.advance(3600 * 1000);
    await hub.connect(room.id, conn('player', a.id));
    await timers.advance(3600 * 1000);
    expect(await hub.answer(room.id, a.id, { position: 0, title: 'x', artist: '' })).toBe('saved');
  });
});

describe('pannes de base', () => {
  it('journalise sans planter si la diffusion échoue à la fermeture d\'une manche', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const toggle = { fail: false };
    const flaky = { query: (...args) => (toggle.fail ? Promise.reject(new Error('down')) : pool.query(...args)) };
    const fragile = createHub({ pool: flaky, now: () => clock.now, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
    const { room, gameId } = await setup();
    await fragile.connect(room.id, conn('host'));
    await fragile.hostEvent(room.id, { type: 'game:start', gameId });
    await fragile.hostEvent(room.id, { type: 'round:start', position: 0, durationMs: 1 });
    toggle.fail = true;
    await timers.advance(90000);
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith('[hub]', 'down'));
    error.mockRestore();
  });
});
