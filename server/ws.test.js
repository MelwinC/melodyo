import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { testDatabaseUrl } from '../test/db.js';
import { uniqueName } from '../test/factories.js';
import { TEST_LIMITS } from '../test/http.js';
import { settings, track } from '../test/games.js';
import http from 'node:http';
import { createPool } from './db.js';
import { start } from './index.js';
import { attachWebSocket } from './ws.js';

vi.mock('./frontend.js', () => ({ attachFrontend: vi.fn() }));

let server, base, wsUrl;

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  server = await start({ env: { PORT: '0', DATABASE_URL: testDatabaseUrl() }, argv: [], pingMs: 50, limits: TEST_LIMITS });
  const { port } = server.server.address();
  base = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}/ws`;
});
afterAll(() => server.close());

async function call(method, path, { cookie, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  return { status: res.status, json: res.status === 204 ? null : await res.json(), cookie: setCookie };
}

async function account() {
  const { cookie, json } = await call('POST', '/api/auth/register', { body: { username: uniqueName(), password: 'motdepasse' } });
  return { cookie, user: json.user };
}

function connect({ cookie, origin = base, ...options } = {}) {
  const ws = new WebSocket(wsUrl, { headers: { ...(cookie && { Cookie: cookie }), ...(origin && { Origin: origin }) }, ...options });
  const inbox = [];
  const waiters = [];
  ws.on('message', data => {
    const msg = JSON.parse(data);
    const i = waiters.findIndex(w => w.match(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  const next = (match = () => true) => {
    const i = inbox.findIndex(match);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise(resolve => waiters.push({ match, resolve }));
  };
  const opened = new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const closed = new Promise(resolve => ws.once('close', code => resolve(code)));
  return { ws, next, opened, closed, send: m => ws.send(typeof m === 'string' ? m : JSON.stringify(m)) };
}

async function roomWithGame() {
  const host = await account();
  const { room } = (await call('POST', '/api/rooms', { cookie: host.cookie })).json;
  const { id: gameId } = (await call('POST', '/api/games', {
    cookie: host.cookie, body: { settings: settings({ timer: '30s' }), tracks: [track(0), track(1)], roomId: room.id },
  })).json;
  return { host, room, gameId };
}

const state = m => m.type === 'state';

describe('connexion WebSocket', () => {
  it('refuse une origine étrangère', async () => {
    const c = connect({ origin: 'https://evil.example' });
    await expect(c.opened).rejects.toThrow(/403/);
  });

  it.each([
    ['une origine « null » (iframe isolée)', { Origin: 'null' }, '/ws'],
    ['une origine malformée', { Origin: 'http://a:b:c' }, '/ws'],
  ])('refuse sans planter %s', async (_, headers, path) => {
    const ws = new WebSocket(`ws://127.0.0.1:${new URL(base).port}${path}`, { headers });
    await new Promise(resolve => ws.once('error', resolve));
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });

  it('survit à une cible de requête malformée', async () => {
    const net = await import('node:net');
    const socket = net.connect(new URL(base).port, '127.0.0.1');
    await new Promise(resolve => socket.once('connect', resolve));
    socket.write('GET http://a:b:c/ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
    await new Promise(resolve => { socket.once('close', resolve); socket.once('error', resolve); });
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });

  it('ignore les connexions qui ne visent pas /ws', async () => {
    const ws = new WebSocket(wsUrl.replace('/ws', '/autre'));
    const closed = await new Promise(resolve => { ws.once('error', () => resolve(true)); ws.once('open', () => resolve(false)); });
    expect(closed).toBe(true);
  });

  it('exige hello en premier et ferme sinon', async () => {
    const c = connect();
    await c.opened;
    c.send({ type: 'answer', position: 0, title: '', artist: '' });
    expect(await c.next()).toEqual({ type: 'error', error: 'forbidden' });
    expect(await c.closed).toBe(4403);
  });

  it('refuse un créateur qui n\'est pas celui de la room, ou une room inconnue', async () => {
    const { room } = await roomWithGame();
    const intruder = await account();
    for (const hello of [{ code: room.code, role: 'host' }, { code: 'ZZZZZZ', role: 'host' }, { code: 'xx', role: 'player' }]) {
      const c = connect({ cookie: intruder.cookie });
      await c.opened;
      c.send({ type: 'hello', ...hello });
      expect(await c.next()).toEqual({ type: 'error', error: 'forbidden' });
    }
  });

  it('refuse un participant inconnu de la room', async () => {
    const { room } = await roomWithGame();
    const c = connect();
    await c.opened;
    c.send({ type: 'hello', code: room.code, role: 'player' });
    expect(await c.next()).toEqual({ type: 'error', error: 'forbidden' });
  });

  it('accepte une connexion sans en-tête Origin (client hors navigateur)', async () => {
    const { host, room } = await roomWithGame();
    const c = connect({ cookie: host.cookie, origin: null });
    await c.opened;
    c.send({ type: 'hello', code: room.code, role: 'host' });
    expect((await c.next(state)).answered).toEqual([]);
  });
});

describe('partie en direct', () => {
  it('relie créateur et participants de bout en bout', async () => {
    const { host, room, gameId } = await roomWithGame();
    const h = connect({ cookie: host.cookie });
    await h.opened;
    h.send({ type: 'hello', code: room.code.toLowerCase(), role: 'host' });
    await h.next(state);

    const guest = await call('POST', `/api/rooms/${room.code}/join`, { body: { guestName: 'Les Bleus' } });
    const g = connect({ cookie: guest.cookie });
    await g.opened;
    g.send({ type: 'hello', code: room.code, role: 'player' });
    expect((await g.next(state)).you.id).toBe(guest.json.participant.id);

    const player = await account();
    await call('POST', `/api/rooms/${room.code}/join`, { cookie: player.cookie, body: {} });
    const p = connect({ cookie: player.cookie });
    await p.opened;
    p.send({ type: 'hello', code: room.code, role: 'player' });
    await p.next(state);

    h.send({ type: 'game:start', gameId });
    h.send({ type: 'round:start', position: 0, durationMs: 200000 });
    await g.next(m => state(m) && m.round?.status === 'open');
    g.send({ type: 'answer', position: 0, title: '  Take On Me ', artist: 'a-ha' });
    expect(await g.next(m => m.type === 'answer:ack')).toEqual({ type: 'answer:ack', position: 0, status: 'saved' });
    expect((await h.next(m => state(m) && m.answered.length === 1)).answered).toEqual([guest.json.participant.id]);
    expect((await g.next(m => state(m) && m.you.answer)).you.answer).toEqual({ title: 'Take On Me', artist: 'a-ha' });

    p.send({ type: 'answer', position: 1, title: 'x', artist: '' });
    expect((await p.next(m => m.type === 'answer:ack')).status).toBe('closed');

    h.send({ type: 'playback', paused: true });
    await h.next(m => state(m) && m.round?.paused);
    h.send({ type: 'game:final' });
    expect((await g.next(m => state(m) && m.phase === 'final')).revealed).toHaveLength(2);
    h.send({ type: 'game:end' });
    await g.next(m => state(m) && m.game === null);
    for (const c of [h, g, p]) c.ws.close();
  });

  it('donne au même compte la vue créateur sur le PC et la vue joueur sur le téléphone', async () => {
    const { host, room } = await roomWithGame();
    await call('POST', `/api/rooms/${room.code}/join`, { cookie: host.cookie, body: {} });
    const pc = connect({ cookie: host.cookie });
    const phone = connect({ cookie: host.cookie });
    await Promise.all([pc.opened, phone.opened]);
    pc.send({ type: 'hello', code: room.code, role: 'host' });
    phone.send({ type: 'hello', code: room.code, role: 'player' });
    expect(await pc.next(state)).toHaveProperty('answered');
    expect(await phone.next(state)).toHaveProperty('you');
    for (const type of ['game:end', 'reveal', 'game:final']) {
      phone.send({ type, position: 0 });
      expect(await phone.next(m => m.type === 'error')).toEqual({ type: 'error', error: 'invalid_message' });
    }
    pc.ws.close();
    phone.ws.close();
  });

  it('retrouve un compte qui a rejoint en invité grâce à son cookie d\'invité', async () => {
    const { room } = await roomWithGame();
    const player = await account();
    const joined = await call('POST', `/api/rooms/${room.code}/join`, { cookie: player.cookie, body: { guestName: 'Équipe' } });
    const c = connect({ cookie: `${player.cookie}; ${joined.cookie}` });
    await c.opened;
    c.send({ type: 'hello', code: room.code, role: 'player' });
    expect((await c.next(state)).you.id).toBe(joined.json.participant.id);
    c.ws.close();
  });

  it('signale un message invalide sans fermer la connexion', async () => {
    const { host, room } = await roomWithGame();
    const h = connect({ cookie: host.cookie });
    await h.opened;
    h.send({ type: 'hello', code: room.code, role: 'host' });
    await h.next(state);
    h.send('pas du json');
    expect(await h.next()).toEqual({ type: 'error', error: 'invalid_message' });
    h.send({ type: 'round:start', position: -1, durationMs: 1 });
    expect(await h.next()).toEqual({ type: 'error', error: 'invalid_message' });
    h.ws.close();
  });

  it('ferme une connexion qui envoie un message trop gros', async () => {
    const c = connect();
    await c.opened;
    c.send('x'.repeat(5000));
    expect(await c.closed).toBe(1009);
  });

  it('ferme une connexion qui ne répond plus aux pings', async () => {
    const c = connect({ autoPong: false });
    await c.opened;
    expect(await c.closed).toBe(1006);
  });
});

describe('erreurs internes et fermetures prématurées', () => {
  async function serverWith(hub) {
    const pool = createPool(testDatabaseUrl());
    const other = http.createServer();
    const realtime = attachWebSocket(other, { pool, hub });
    await new Promise(resolve => other.listen(0, '127.0.0.1', resolve));
    return {
      url: `ws://127.0.0.1:${other.address().port}/ws`,
      async close() {
        realtime.close();
        await new Promise(resolve => other.close(resolve));
        await pool.end();
      },
    };
  }

  it('ferme avec un code réessayable si la base échoue pendant la connexion', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { host, room } = await roomWithGame();
    const srv = await serverWith({ connect: () => Promise.reject(new Error('boom')), disconnect: async () => {} });
    const ws = new WebSocket(srv.url, { headers: { Cookie: host.cookie } });
    await new Promise(resolve => ws.once('open', resolve));
    const closed = new Promise(resolve => ws.once('close', resolve));
    ws.send(JSON.stringify({ type: 'hello', code: room.code, role: 'host' }));
    expect(await closed).toBe(1011);
    await srv.close();
  });

  it('répond server_error si le hub échoue une fois connecté', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { host, room } = await roomWithGame();
    const srv = await serverWith({ connect: async () => {}, disconnect: async () => {}, hostEvent: () => Promise.reject(new Error('boom')) });
    const ws = new WebSocket(srv.url, { headers: { Cookie: host.cookie } });
    await new Promise(resolve => ws.once('open', resolve));
    const reply = new Promise(resolve => ws.once('message', data => resolve(JSON.parse(data))));
    ws.send(JSON.stringify({ type: 'hello', code: room.code, role: 'host' }));
    ws.send(JSON.stringify({ type: 'game:end' }));
    expect(await reply).toEqual({ type: 'error', error: 'server_error' });
    ws.close();
    await srv.close();
  });

  it('ne laisse pas de connexion fantôme si la socket se ferme pendant l\'authentification', async () => {
    const { host, room } = await roomWithGame();
    const hub = { connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) };
    const srv = await serverWith(hub);
    const ws = new WebSocket(srv.url, { headers: { Cookie: host.cookie } });
    await new Promise(resolve => ws.once('open', resolve));
    ws.send(JSON.stringify({ type: 'hello', code: room.code, role: 'host' }));
    ws.terminate();
    await vi.waitFor(() => expect(hub.connect).toHaveBeenCalled());
    await vi.waitFor(() => expect(hub.disconnect).toHaveBeenCalledTimes(hub.connect.mock.calls.length));
    await srv.close();
  });
});

describe('cohabitation avec le hot reload de Vite', () => {
  it('laisse les autres connexions WebSocket à l\'autre écouteur', async () => {
    const pool = createPool(testDatabaseUrl());
    const other = http.createServer();
    const viteLike = vi.fn((req, socket) => socket.destroy());
    const realtime = attachWebSocket(other, { pool, hub: {} });
    other.on('upgrade', viteLike);
    await new Promise(resolve => other.listen(0, '127.0.0.1', resolve));
    const ws = new WebSocket(`ws://127.0.0.1:${other.address().port}/`);
    await new Promise(resolve => ws.once('error', resolve));
    expect(viteLike).toHaveBeenCalledOnce();
    realtime.close();
    await new Promise(resolve => other.close(resolve));
    await pool.end();
  });
});
