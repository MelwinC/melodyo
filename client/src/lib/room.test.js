import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from './http.js';

vi.mock('./http.js', () => ({ request: vi.fn() }));

let room, sockets;

class FakeSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.readyState = 0;
    sockets.push(this);
  }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  open() { this.readyState = 1; this.onopen(); }
  receive(msg) { this.onmessage({ data: JSON.stringify(msg) }); }
  drop(code = 1006) { this.readyState = 3; this.onclose({ code }); }
}

beforeEach(async () => {
  vi.useFakeTimers({ now: 5000 });
  sockets = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.resetModules();
  room = await import('./room.js');
});
afterEach(() => { room.disconnectRoom(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('connexion', () => {
  it('se connecte à /ws et se présente', () => {
    room.connectRoom('ABC234', 'player');
    expect(sockets[0].url).toBe(`ws://${location.host}/ws`);
    sockets[0].open();
    expect(sockets[0].sent[0]).toEqual({ type: 'hello', code: 'ABC234', role: 'player' });
    expect(room.getRoomState()).toMatchObject({ connected: true, error: null });
  });

  it('utilise wss en https', () => {
    vi.stubGlobal('location', { protocol: 'https:', host: 'melodyo.fr' });
    room.connectRoom('ABC234', 'player');
    expect(sockets[0].url).toBe('wss://melodyo.fr/ws');
  });

  it('garde les messages en file jusqu\'à l\'ouverture', () => {
    room.connectRoom('ABC234', 'host');
    room.sendRoom({ type: 'game:start', gameId: 'g' });
    expect(sockets[0].sent).toEqual([]);
    sockets[0].open();
    expect(sockets[0].sent.map(m => m.type)).toEqual(['hello', 'game:start']);
    room.sendRoom({ type: 'game:end' });
    expect(sockets[0].sent.at(-1)).toEqual({ type: 'game:end' });
  });

  it('enregistre l\'état, les accusés et les erreurs reçus, avec l\'heure de réception', () => {
    const listener = vi.fn();
    const unsubscribe = room.subscribeRoom(listener);
    room.connectRoom('ABC234', 'player');
    sockets[0].open();
    sockets[0].receive({ type: 'state', round: null });
    expect(room.getRoomState()).toMatchObject({ state: { type: 'state', round: null }, receivedAt: 5000 });
    sockets[0].receive({ type: 'answer:ack', position: 0, status: 'saved' });
    expect(room.getRoomState().lastAck).toEqual({ type: 'answer:ack', position: 0, status: 'saved' });
    sockets[0].receive({ type: 'error', error: 'invalid_message' });
    expect(room.getRoomState().error).toBe('invalid_message');
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});

describe('reconnexion', () => {
  it('réessaie avec un délai croissant plafonné à 10 s et prévient le créateur', () => {
    const onReconnect = vi.fn();
    room.connectRoom('ABC234', 'host', { onReconnect });
    sockets[0].open();
    for (const [i, delay] of [1000, 2000, 4000, 8000, 10000, 10000].entries()) {
      sockets.at(-1).drop();
      expect(room.getRoomState().connected).toBe(false);
      vi.advanceTimersByTime(delay - 1);
      expect(sockets).toHaveLength(i + 1);
      vi.advanceTimersByTime(1);
      expect(sockets).toHaveLength(i + 2);
    }
    sockets.at(-1).open();
    expect(sockets.at(-1).sent[0]).toEqual({ type: 'hello', code: 'ABC234', role: 'host' });
    expect(onReconnect).toHaveBeenCalledOnce();
    sockets.at(-1).drop();
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(8);
  });

  it('ne réessaie pas après un refus', () => {
    room.connectRoom('ABC234', 'player');
    sockets[0].open();
    sockets[0].receive({ type: 'error', error: 'forbidden' });
    sockets[0].drop(4403);
    vi.advanceTimersByTime(20000);
    expect(sockets).toHaveLength(1);
    expect(room.getRoomState().error).toBe('forbidden');
  });

  it('ne réessaie pas après une déconnexion volontaire', () => {
    room.connectRoom('ABC234', 'player');
    sockets[0].open();
    room.disconnectRoom();
    vi.advanceTimersByTime(20000);
    expect(sockets).toHaveLength(1);
    expect(room.getRoomState()).toEqual({ connected: false, state: null, error: null, lastAck: null, receivedAt: 0 });
  });

  it('ignore la fermeture d\'une ancienne connexion', () => {
    room.connectRoom('AAA222', 'player');
    const old = sockets[0];
    room.connectRoom('BBB333', 'player');
    sockets[1].open();
    old.onclose({ code: 1006 });
    expect(room.getRoomState().connected).toBe(true);
  });
});

describe('API des rooms', () => {
  it.each([
    ['openRoom', [], 'POST', '/api/rooms', undefined, { room: { id: 'r', code: 'C' } }, { id: 'r', code: 'C' }],
    ['closeRoom', [], 'POST', '/api/rooms/close', undefined, null, null],
    ['getRoomInfo', ['ab c'], 'GET', '/api/rooms/ab%20c', undefined, { room: { code: 'ABC' } }, { code: 'ABC' }],
    ['joinRoom', ['ABC', 'Moi'], 'POST', '/api/rooms/ABC/join', { guestName: 'Moi' }, { participant: { id: 'p' } }, { id: 'p' }],
    ['joinRoom', ['ABC'], 'POST', '/api/rooms/ABC/join', {}, { participant: { id: 'p' } }, { id: 'p' }],
    ['myParticipant', ['ab c'], 'GET', '/api/rooms/ab%20c/me', undefined, { participant: { id: 'p' } }, { id: 'p' }],
  ])('%s', async (fn, args, method, path, body, response, expected) => {
    request.mockResolvedValue(response);
    expect(await room[fn](...args)).toEqual(expected);
    expect(request).toHaveBeenCalledWith(...[method, path, body].filter(x => x !== undefined));
  });
});

describe('myParticipant', () => {
  it('renvoie null si l\'appareil n\'a pas encore rejoint', async () => {
    const { ApiError } = await vi.importActual('./http.js');
    request.mockRejectedValue(new ApiError(404, 'not_joined'));
    expect(await room.myParticipant('ABC234')).toBeNull();
    request.mockRejectedValue(new ApiError(404, 'room_not_found'));
    await expect(room.myParticipant('ABC234')).rejects.toMatchObject({ code: 'room_not_found' });
  });
});
