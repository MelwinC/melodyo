import { isPaused, openClock, pauseClock, remainingMs, resumeClock } from './clock.js';
import {
  getAnswers, getCorrections, getRevealed, getRoomGame, getTrack, listParticipants,
  markRevealed, resetValidations, saveAnswer, setValidation, unreveal,
} from './repo.js';
import { getParticipantDetail, getScores, rank } from './scoring.js';

// En mode extrait, les équipes ont 1 min 30 pour répondre ; sinon toute la durée de lecture
const EXTRACT_ANSWER_MS = 90_000;
// Une room sans aucune connexion depuis 2 h est retirée de la mémoire (ses données restent en base)
const IDLE_MS = 2 * 3600 * 1000;

const logError = err => console.error('[hub]', err.message);

// État des rooms en mémoire : le serveur décide seul des manches, de la correction et des révélations.
// Les participants ne reçoivent une chanson qu'une fois révélée.
export function createHub({ pool, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const rooms = new Map();

  function roomOf(roomId) {
    if (!rooms.has(roomId)) rooms.set(roomId, { conns: new Set(), timer: null, purge: null, ...emptyGame() });
    return rooms.get(roomId);
  }

  function emptyGame() {
    return { game: null, round: null, phase: null, correction: null, revealed: new Set(), lastEnded: null };
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
      room.lastEnded = room.round.position;
      return broadcast(roomId).catch(logError);
    }, remainingMs(room.round.clock, now()));
  }

  // Chanson en cours de correction : à la volée, la dernière manche terminée (échéance, verrouillage
  // ou chanson suivante lancée) — on corrige la précédente pendant que la suivante joue ; à la fin, la position parcourue
  function correctionTarget(room) {
    if (room.phase === 'correcting') return room.correction.position;
    if (room.phase === 'playing' && room.game.correction === 'live') return room.lastEnded;
    return null;
  }

  async function broadcast(roomId) {
    const room = roomOf(roomId);
    const participants = await listParticipants(pool, roomId);
    const { game } = room;
    const answers = game && room.round ? await getAnswers(pool, game.id, room.round.position) : new Map();
    const target = game ? correctionTarget(room) : null;
    const corrections = target === null ? null : await getCorrections(pool, game.id, target);
    const revealed = [];
    for (const position of [...room.revealed].sort((a, b) => a - b)) revealed.push(await getTrack(pool, game.id, position));
    const ids = participants.map(p => p.id);
    const scores = game ? await getScores(pool, game.id, ids) : new Map();
    const details = new Map();
    if (game) for (const id of ids) details.set(id, await getParticipantDetail(pool, game.id, id));

    const connected = new Set([...room.conns].map(c => c.participantId));
    const base = {
      type: 'state',
      participants: participants.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, connected: connected.has(p.id) })),
      game,
      round: room.round && {
        position: room.round.position,
        status: room.round.status,
        remainingMs: remainingMs(room.round.clock, now()),
        paused: isPaused(room.round.clock),
      },
      phase: room.phase,
      correction: target === null ? null : { position: target },
      revealed,
      scores: game ? rank(participants.map(p => ({ id: p.id, name: p.name, score: scores.get(p.id) }))) : [],
      final: room.phase === 'final' ? { details: Object.fromEntries(details) } : null,
    };
    const answered = [...answers].filter(([, a]) => a.title || a.artist).map(([id]) => id);
    const hostAnswers = corrections && participants.map(p => {
      const c = corrections.get(p.id) ?? { title: '', artist: '', titleOk: null, artistOk: null };
      return { participantId: p.id, ...c };
    });

    for (const conn of room.conns) {
      if (conn.role === 'host') {
        conn.send({ ...base, answered, answers: hostAnswers });
      } else {
        const results = (details.get(conn.participantId) ?? [])
          .filter(d => d.track)
          .map(({ position, titleOk, artistOk }) => ({ position, titleOk, artistOk }));
        conn.send({ ...base, you: { id: conn.participantId, answer: answers.get(conn.participantId) ?? null, results } });
      }
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

  async function reveal(room, position) {
    await markRevealed(pool, room.game.id, position);
    room.revealed.add(position);
  }

  // Classement final : toutes les chansons sont dévoilées (avant le changement de phase, pour qu'aucun
  // état « final » ne parte avec une chanson encore cachée)
  async function finish(room) {
    stopTimer(room);
    for (let position = 0; position < room.game.total; position++) await reveal(room, position);
    room.phase = 'final';
    room.correction = null;
  }

  // Renvoie true si l'événement a changé l'état (et doit être diffusé)
  async function apply(roomId, room, event) {
    const { type } = event;
    if (type === 'game:start') {
      // Reprise après reconnexion du créateur : la partie en cours continue telle quelle
      if (room.game?.id === event.gameId) return false;
      const game = await getRoomGame(pool, roomId, event.gameId);
      if (!game) return false;
      stopTimer(room);
      Object.assign(room, emptyGame(), { game, phase: 'playing', revealed: await getRevealed(pool, game.id) });
      return true;
    }
    if (type === 'game:end') {
      stopTimer(room);
      Object.assign(room, emptyGame());
      return true;
    }
    if (!room.game) return false;
    if (type === 'round:start') return startRound(roomId, room, event);
    if (type === 'playback') return playback(roomId, room, event);
    if (type === 'round:close') {
      if (room.round?.status !== 'open') return false;
      stopTimer(room);
      room.round.status = 'closed';
      room.lastEnded = room.round.position;
      return true;
    }
    if (type === 'correct') {
      if (correctionTarget(room) !== event.position) return false;
      const { position, participantId, field, ok } = event;
      return setValidation(pool, { gameId: room.game.id, position, participantId, field, ok });
    }
    if (type === 'reveal') {
      if (correctionTarget(room) !== event.position) return false;
      await reveal(room, event.position);
      return true;
    }
    if (type === 'correction:start') {
      const position = event.position ?? 0;
      if (room.game.correction !== 'end' || room.phase === 'final' || position >= room.game.total) return false;
      if (room.phase === 'correcting' && room.correction.position === position) return false;
      stopTimer(room);
      Object.assign(room, { phase: 'correcting', correction: { position }, round: null });
      return true;
    }
    if (type === 'correction:next') {
      if (room.phase !== 'correcting') return false;
      if (room.correction.position + 1 < room.game.total) room.correction = { position: room.correction.position + 1 };
      else await finish(room);
      return true;
    }
    // game:final
    if (room.phase === 'final') return false;
    await finish(room);
    return true;
  }

  async function startRound(roomId, room, event) {
    if (room.phase !== 'playing' || event.position >= room.game.total || room.round?.position === event.position) return false;
    // Nouvelle chanson ou retour sur une précédente : délai complet, et ses points repassent en attente
    if (room.round) room.lastEnded = room.round.position;
    await resetValidations(pool, room.game.id, event.position);
    if (room.revealed.delete(event.position)) await unreveal(pool, room.game.id, event.position);
    const durationMs = room.game.timer === '30s' ? EXTRACT_ANSWER_MS : event.durationMs;
    room.round = { position: event.position, status: 'open', clock: openClock(now(), durationMs) };
    scheduleClose(roomId, room);
    return true;
  }

  function playback(roomId, room, event) {
    if (room.round?.status !== 'open') return false;
    if (event.paused) {
      room.round.clock = pauseClock(room.round.clock, now());
      stopTimer(room);
    } else {
      room.round.clock = resumeClock(room.round.clock, now());
      scheduleClose(roomId, room);
    }
    return true;
  }

  async function hostEvent(roomId, event) {
    const room = roomOf(roomId);
    if (await apply(roomId, room, event)) await broadcast(roomId);
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
