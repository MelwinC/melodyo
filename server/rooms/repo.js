import crypto from 'node:crypto';
import { generateRoomCode } from './code.js';

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const toRoom = row => ({ id: row.id, code: row.code, hostId: row.host_id });

const PARTICIPANT_SELECT = `
  SELECT p.id, p.user_id, COALESCE(u.username, p.guest_name) AS name,
         COALESCE(u.avatar_kind, 'preset') AS avatar_kind, COALESCE(u.avatar_value, 'note') AS avatar_value
  FROM participants p LEFT JOIN users u ON u.id = p.user_id`;

const toParticipant = row => ({
  id: row.id,
  name: row.name,
  avatar: { kind: row.avatar_kind, value: row.avatar_value },
  userId: row.user_id,
});

// La room ouverte du créateur, ou une nouvelle (le code est réessayé en cas de collision)
export async function openRoomFor(pool, hostId, { generate = generateRoomCode } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { rows } = await pool.query('SELECT * FROM rooms WHERE host_id = $1 AND closed_at IS NULL', [hostId]);
    if (rows[0]) return toRoom(rows[0]);
    try {
      const created = await pool.query('INSERT INTO rooms (code, host_id) VALUES ($1, $2) RETURNING *', [generate(), hostId]);
      return toRoom(created.rows[0]);
    } catch (err) {
      if (err.code !== '23505') throw err;
    }
  }
  throw new Error('Impossible de créer une room');
}

export async function closeRoom(pool, hostId) {
  await pool.query('UPDATE rooms SET closed_at = now() WHERE host_id = $1 AND closed_at IS NULL', [hostId]);
}

export async function findOpenRoomByCode(pool, code) {
  const { rows } = await pool.query(
    `SELECT r.*, u.username AS host_name FROM rooms r JOIN users u ON u.id = r.host_id
     WHERE r.code = $1 AND r.closed_at IS NULL`,
    [code],
  );
  return rows[0] ? { ...toRoom(rows[0]), hostName: rows[0].host_name } : null;
}

export async function joinAsUser(pool, roomId, userId) {
  await pool.query(
    'INSERT INTO participants (room_id, user_id) VALUES ($1, $2) ON CONFLICT (room_id, user_id) DO NOTHING',
    [roomId, userId],
  );
  return findParticipant(pool, roomId, { userId });
}

export async function joinAsGuest(pool, roomId, name) {
  const token = crypto.randomBytes(32).toString('base64url');
  const { rows } = await pool.query(
    'INSERT INTO participants (room_id, guest_name, guest_token_hash) VALUES ($1, $2, $3) RETURNING id',
    [roomId, name, hashToken(token)],
  );
  return { participant: { id: rows[0].id, name, avatar: { kind: 'preset', value: 'note' }, userId: null }, token };
}

export async function findParticipant(pool, roomId, { userId, guestToken }) {
  if (!userId && !guestToken) return null;
  const { rows } = userId
    ? await pool.query(`${PARTICIPANT_SELECT} WHERE p.room_id = $1 AND p.user_id = $2`, [roomId, userId])
    : await pool.query(`${PARTICIPANT_SELECT} WHERE p.room_id = $1 AND p.guest_token_hash = $2`, [roomId, hashToken(guestToken)]);
  return rows[0] ? toParticipant(rows[0]) : null;
}

export async function listParticipants(pool, roomId) {
  const { rows } = await pool.query(`${PARTICIPANT_SELECT} WHERE p.room_id = $1 ORDER BY p.joined_at, p.id`, [roomId]);
  return rows.map(toParticipant);
}

export async function saveAnswer(pool, { gameId, position, participantId, title, artist }) {
  await pool.query(
    `INSERT INTO answers (game_id, position, participant_id, title, artist) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (game_id, position, participant_id) DO UPDATE SET title = $4, artist = $5, updated_at = now()`,
    [gameId, position, participantId, title, artist],
  );
}

export async function getAnswers(pool, gameId, position) {
  const { rows } = await pool.query('SELECT participant_id, title, artist FROM answers WHERE game_id = $1 AND position = $2', [gameId, position]);
  return new Map(rows.map(r => [r.participant_id, { title: r.title, artist: r.artist }]));
}

export async function getAnswersOf(pool, gameId, participantId) {
  const { rows } = await pool.query(
    'SELECT position, title, artist FROM answers WHERE game_id = $1 AND participant_id = $2 ORDER BY position',
    [gameId, participantId],
  );
  return new Map(rows.map(r => [r.position, { title: r.title, artist: r.artist }]));
}
