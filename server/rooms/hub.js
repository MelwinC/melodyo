import { isPaused, openClock, pauseClock, remainingMs, resumeClock } from './clock.js';
import { getAnswers, getRoomGame, listParticipants, saveAnswer } from './repo.js';

// En mode extrait, les équipes ont 1 min 30 pour répondre ; sinon toute la durée de lecture
const EXTRACT_ANSWER_MS = 90_000;
// Une room sans aucune connexion depuis 2 h est retirée de la mémoire (ses données restent en base)
const IDLE_MS = 2 * 3600 * 1000;

// État des rooms en mémoire : le serveur décide seul de l'ouverture et de la fermeture des manches.
// Les participants ne reçoivent jamais d'information sur les chansons.
const logError = err => console.error('[hub]', err.message);

export function createHub({ pool, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const rooms = new Map();

  function roomOf(roomId) {
    if (!rooms.has(roomId)) rooms.set(roomId, { conns: new Set(), game: null, round: null, timer: null, purge: null });
    return rooms.get(roomId);
  }

  function stopTimer(room) {
    if (room.timer) clearTimer(room.timer);
    room.timer = null;
  }

  function scheduleClose(roomId, room) {
    stopTimer(room);
    room.timer = setTimer(() => {
      room.timer = null;
      room.round.status = 'closed';
      return broadcast(roomId).catch(logError);
    }, remainingMs(room.round.clock, now()));
  }

  async function broadcast(roomId) {
    const room = roomOf(roomId);
    const participants = await listParticipants(pool, roomId);
    const answers = room.game && room.round ? await getAnswers(pool, room.game.id, room.round.position) : new Map();
    const connected = new Set([...room.conns].map(c => c.participantId));
    const base = {
      type: 'state',
      participants: participants.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, connected: connected.has(p.id) })),
      game: room.game,
      round: room.round && {
        position: room.round.position,
        status: room.round.status,
        remainingMs: remainingMs(room.round.clock, now()),
        paused: isPaused(room.round.clock),
      },
    };
    const answered = [...answers].filter(([, a]) => a.title || a.artist).map(([id]) => id);
    for (const conn of room.conns) {
      if (conn.role === 'host') conn.send({ ...base, answered });
      else conn.send({ ...base, you: { id: conn.participantId, answer: answers.get(conn.participantId) ?? null } });
    }
  }

  async function connect(roomId, conn) {
    const room = roomOf(roomId);
    if (room.purge) clearTimer(room.purge);
    room.purge = null;
    room.conns.add(conn);
    await broadcast(roomId);
  }

  async function disconnect(roomId, conn) {
    const room = roomOf(roomId);
    room.conns.delete(conn);
    if (room.conns.size === 0) {
      room.purge = setTimer(() => {
        stopTimer(room);
        rooms.delete(roomId);
      }, IDLE_MS);
    }
    await broadcast(roomId);
  }

  async function hostEvent(roomId, event) {
    const room = roomOf(roomId);
    if (event.type === 'game:start') {
      // Reprise après reconnexion du créateur : la partie en cours continue telle quelle
      if (room.game?.id === event.gameId) return;
      const game = await getRoomGame(pool, roomId, event.gameId);
      if (!game) return;
      stopTimer(room);
      room.game = game;
      room.round = null;
    } else if (event.type === 'game:end') {
      stopTimer(room);
      room.game = null;
      room.round = null;
    } else if (!room.game) {
      return;
    } else if (event.type === 'round:start') {
      if (event.position >= room.game.total || room.round?.position === event.position) return;
      // Nouvelle chanson ou retour sur une précédente : la manche (ré)ouvre avec un délai complet
      const durationMs = room.game.timer === '30s' ? EXTRACT_ANSWER_MS : event.durationMs;
      room.round = { position: event.position, status: 'open', clock: openClock(now(), durationMs) };
      scheduleClose(roomId, room);
    } else if (room.round?.status === 'open') {
      if (event.paused) {
        room.round.clock = pauseClock(room.round.clock, now());
        stopTimer(room);
      } else {
        room.round.clock = resumeClock(room.round.clock, now());
        scheduleClose(roomId, room);
      }
    } else {
      return;
    }
    await broadcast(roomId);
  }

  async function answer(roomId, participantId, { position, title, artist }) {
    const room = rooms.get(roomId);
    if (room?.round?.status !== 'open' || room.round.position !== position) return 'closed';
    await saveAnswer(pool, { gameId: room.game.id, position, participantId, title, artist });
    await broadcast(roomId);
    return 'saved';
  }

  async function participantsChanged(roomId) {
    if (rooms.has(roomId)) await broadcast(roomId);
  }

  return { connect, disconnect, hostEvent, answer, participantsChanged };
}
