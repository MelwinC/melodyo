import { decrypt, encrypt } from './crypto.js';

// Marge d'une minute : un token renvoyé au SDK reste valable le temps de l'utiliser
const EXPIRY_MARGIN_S = 60;

export async function saveLink(pool, key, userId, { spotifyUserId, accessToken, refreshToken, expiresIn, now = new Date() }) {
  const expiresAt = new Date(now.getTime() + (expiresIn - EXPIRY_MARGIN_S) * 1000);
  await pool.query(
    `INSERT INTO spotify_links (user_id, spotify_user_id, access_token, refresh_token, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET spotify_user_id = $2, access_token = $3, refresh_token = $4, expires_at = $5`,
    [userId, spotifyUserId, encrypt(accessToken, key), encrypt(refreshToken, key), expiresAt],
  );
  return { accessToken, expiresAt };
}

export async function getLink(pool, key, userId) {
  const { rows } = await pool.query('SELECT * FROM spotify_links WHERE user_id = $1', [userId]);
  if (!rows[0]) return null;
  return {
    spotifyUserId: rows[0].spotify_user_id,
    accessToken: decrypt(rows[0].access_token, key),
    refreshToken: decrypt(rows[0].refresh_token, key),
    expiresAt: rows[0].expires_at,
  };
}

export async function deleteLink(pool, userId) {
  await pool.query('DELETE FROM spotify_links WHERE user_id = $1', [userId]);
}
