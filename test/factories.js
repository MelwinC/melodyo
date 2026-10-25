import crypto from 'node:crypto';
import { hashPassword } from '../server/passwords.js';

export const uniqueName = (prefix = 'u') => `${prefix}${crypto.randomBytes(5).toString('hex')}`;

export async function insertUser(pool, { username = uniqueName(), password = 'motdepasse' } = {}) {
  const { rows } = await pool.query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
    [username, await hashPassword(password)],
  );
  return rows[0];
}
