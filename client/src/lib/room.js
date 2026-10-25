import { reloadOnHotUpdate } from './hot.js';
import { request } from './http.js';

/* ── API REST ── */
export const openRoom = async () => (await request('POST', '/api/rooms')).room;
export const closeRoom = () => request('POST', '/api/rooms/close');
export const getRoomInfo = async code => (await request('GET', `/api/rooms/${encodeURIComponent(code)}`)).room;
// null si l'appareil n'a pas encore rejoint la room
export async function myParticipant(code) {
  try {
    return (await request('GET', `/api/rooms/${encodeURIComponent(code)}/me`)).participant;
  } catch (err) {
    if (err.code === 'not_joined') return null;
    throw err;
  }
}

export const joinRoom = async (code, guestName) =>
  (await request('POST', `/api/rooms/${code}/join`, guestName === undefined ? {} : { guestName })).participant;

/* ── TEMPS RÉEL (store lu par les composants via useSyncExternalStore) ── */
const INITIAL = { connected: false, state: null, error: null, lastAck: null, receivedAt: 0 };
let snapshot = INITIAL;
const listeners = new Set();

let socket = null;
let target = null;
let queue = [];
let attempt = 0;
let retryTimer = null;
let onReconnect = null;

function update(patch) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach(fn => fn());
}

export const subscribeRoom = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const getRoomState = () => snapshot;

function open(isReconnect) {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  socket = ws;

  ws.onopen = () => {
    attempt = 0;
    ws.send(JSON.stringify({ type: 'hello', code: target.code, role: target.role }));
    queue.forEach(msg => ws.send(JSON.stringify(msg)));
    queue = [];
    update({ connected: true, error: null });
    if (isReconnect && onReconnect) onReconnect();
  };

  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'state') update({ state: msg, receivedAt: Date.now() });
    else if (msg.type === 'answer:ack') update({ lastAck: msg });
    else {
      // Refus du serveur (room fermée, pas les droits) : inutile de réessayer
      if (msg.error === 'forbidden') target = null;
      update({ error: msg.error });
    }
  };

  // Veille, perte de réseau : nouvelle tentative 1 s, 2 s, 4 s… plafonnée à 10 s
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    update({ connected: false });
    if (!target) return;
    const delay = Math.min(1000 * 2 ** attempt, 10_000);
    attempt += 1;
    retryTimer = setTimeout(() => open(true), delay);
  };
}

export function connectRoom(code, role, options = {}) {
  disconnectRoom();
  target = { code, role };
  onReconnect = options.onReconnect ?? null;
  open(false);
}

export function disconnectRoom() {
  target = null;
  clearTimeout(retryTimer);
  const ws = socket;
  socket = null;
  queue = [];
  attempt = 0;
  ws?.close();
  snapshot = INITIAL;
  listeners.forEach(fn => fn());
}

export function sendRoom(msg) {
  if (socket?.readyState === 1) socket.send(JSON.stringify(msg));
  else queue.push(msg);
}

reloadOnHotUpdate(import.meta.hot);
