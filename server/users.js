export class UsernameTakenError extends Error {}

const USER_COLUMNS = `u.id, u.username, u.avatar_kind, u.avatar_value, (l.user_id IS NOT NULL) AS spotify_linked`;

const toUser = row => ({
  id: row.id,
  username: row.username,
  avatar: { kind: row.avatar_kind, value: row.avatar_value },
  spotifyLinked: row.spotify_linked,
});

export async function createUser(pool, { username, passwordHash }) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, $2)
       RETURNING id, username, avatar_kind, avatar_value, false AS spotify_linked`,
      [username, passwordHash],
    );
    return toUser(rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new UsernameTakenError(username, { cause: err });
    throw err;
  }
}

export async function findUserByUsername(pool, username) {
  const { rows } = await pool.query('SELECT * FROM users WHERE lower(username) = lower($1)', [username]);
  return rows[0] ?? null;
}

export async function findUserById(pool, id) {
  const { rows } = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN spotify_links l ON l.user_id = u.id WHERE u.id = $1`,
    [id],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function setAvatar(pool, id, { kind, value }) {
  const { rows } = await pool.query(
    `UPDATE users u SET avatar_kind = $2, avatar_value = $3
     FROM users old WHERE u.id = $1 AND old.id = u.id
     RETURNING old.avatar_kind, old.avatar_value`,
    [id, kind, value],
  );
  return { previous: { kind: rows[0].avatar_kind, value: rows[0].avatar_value } };
}
