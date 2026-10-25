import { parseCookie } from 'cookie';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import { normalizeRoomCode } from './rooms/code.js';
import { findOpenRoomByCode, findParticipantFor } from './rooms/repo.js';
import { guestCookieName } from './routes/rooms.js';
import { findSessionUserId, SESSION_COOKIE } from './sessions.js';

const helloSchema = z.object({ type: z.literal('hello'), code: z.string().max(20), role: z.enum(['host', 'player']) });
const hostSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('game:start'), gameId: z.uuid() }),
  z.object({ type: z.literal('round:start'), position: z.number().int().min(0), durationMs: z.number().int().min(1).max(3_600_000) }),
  z.object({ type: z.literal('playback'), paused: z.boolean() }),
  z.object({ type: z.literal('game:end') }),
  z.object({ type: z.literal('correct'), position: z.number().int().min(0), participantId: z.uuid(), field: z.enum(['title', 'artist']), ok: z.boolean() }),
  z.object({ type: z.literal('reveal'), position: z.number().int().min(0) }),
  z.object({ type: z.literal('correction:start'), position: z.number().int().min(0).optional() }),
  z.object({ type: z.literal('correction:next') }),
  z.object({ type: z.literal('game:final') }),
  z.object({ type: z.literal('round:close') }),
]);
const answerSchema = z.object({
  type: z.literal('answer'),
  position: z.number().int().min(0),
  title: z.string().max(200).transform(s => s.trim().slice(0, 100)),
  artist: z.string().max(200).transform(s => s.trim().slice(0, 100)),
});

const FORBIDDEN = { type: 'error', error: 'forbidden' };
const INVALID = { type: 'error', error: 'invalid_message' };

// Temps réel des rooms sur /ws : authentification par cookie (session du compte ou invité de la room)
export function attachWebSocket(httpServer, { pool, hub, pingMs = 30_000 }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  // Une URL ou une origine malformée ne doit jamais faire planter le serveur (aucune session requise)
  const hostOf = url => {
    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  };

  httpServer.on('upgrade', (req, socket, head) => {
    // Les autres connexions WebSocket (hot reload de Vite en dev) ne sont pas les nôtres ;
    // sans autre écouteur (prod), on les ferme plutôt que de les laisser pendantes
    if (!/^\/ws(\?|$)/.test(req.url)) {
      if (httpServer.listenerCount('upgrade') === 1) socket.destroy();
      return;
    }
    const { origin } = req.headers;
    if (origin && hostOf(origin) !== req.headers.host) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => onConnection(ws, req));
  });

  async function authenticate(req, hello) {
    const code = normalizeRoomCode(hello.code);
    if (!code) return null;
    const room = await findOpenRoomByCode(pool, code);
    if (!room) return null;
    const cookies = parseCookie(req.headers.cookie ?? '');
    const sessionToken = cookies[SESSION_COOKIE];
    const userId = sessionToken ? await findSessionUserId(pool, sessionToken) : null;

    if (hello.role === 'host') return room.hostId === userId ? { room, role: 'host' } : null;
    const participant = await findParticipantFor(pool, room.id, { userId, guestToken: cookies[guestCookieName(code)] });
    return participant ? { room, role: 'player', participantId: participant.id } : null;
  }

  function onConnection(ws, req) {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    let joined = null;
    const send = msg => ws.send(JSON.stringify(msg));

    async function handle(raw) {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return send(INVALID);
      }

      if (!joined) {
        const hello = helloSchema.safeParse(msg);
        const auth = hello.success ? await authenticate(req, hello.data) : null;
        if (!auth) {
          send(FORBIDDEN);
          return ws.close(4403);
        }
        const conn = { role: auth.role, participantId: auth.participantId, send };
        await hub.connect(auth.room.id, conn);
        // Socket fermée pendant l'authentification : on ne laisse pas de connexion fantôme dans la room
        if (ws.readyState !== ws.OPEN) return hub.disconnect(auth.room.id, conn);
        joined = { roomId: auth.room.id, conn };
        return;
      }

      if (joined.conn.role === 'host') {
        const event = hostSchema.safeParse(msg);
        if (!event.success) return send(INVALID);
        return hub.hostEvent(joined.roomId, event.data);
      }

      const answer = answerSchema.safeParse(msg);
      if (!answer.success) return send(INVALID);
      const { position, title, artist } = answer.data;
      const status = await hub.answer(joined.roomId, joined.conn.participantId, { position, title, artist });
      send({ type: 'answer:ack', position, status });
    }

    // Messages traités dans l'ordre d'arrivée (game:start doit être appliqué avant round:start)
    let queue = Promise.resolve();
    ws.on('message', raw => {
      queue = queue.then(() => handle(raw)).catch(err => {
        console.error('[ws]', err.message);
        // Échec avant d'avoir rejoint (base indisponible) : fermeture que le client réessaie (1011)
        if (!joined) return ws.close(1011);
        send({ type: 'error', error: 'server_error' });
      });
    });
    // Message trop gros, trame invalide : la bibliothèque ferme la connexion, rien d'autre à faire
    ws.on('error', () => {});
    ws.on('close', () => {
      if (joined) hub.disconnect(joined.roomId, joined.conn).catch(err => console.error('[ws]', err.message));
    });
  }

  // Un appareil en veille ou parti sans fermer proprement est déconnecté au ping suivant
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, pingMs);

  return {
    close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
