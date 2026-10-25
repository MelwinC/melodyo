import crypto from 'node:crypto';

export const SESSION_COOKIE = 'melodyo_sid';
export const SESSION_DAYS = 30;

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

export async function createSession(pool, userId, { now = new Date() } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 3600 * 1000);
  await pool.query(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)',
    [hashToken(token), userId, now, expiresAt],
  );
  return token;
}

export async function findSessionUserId(pool, token, { now = new Date() } = {}) {
  const { rows } = await pool.query(
    'SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > $2',
    [hashToken(token), now],
  );
  return rows[0]?.user_id ?? null;
}

export async function deleteSession(pool, token) {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}
