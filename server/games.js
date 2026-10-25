const SUMMARY_COLUMNS = `g.id, g.status, g.settings, g.created_at, g.ended_at,
  (SELECT count(*)::int FROM game_tracks t WHERE t.game_id = g.id) AS track_count,
  (SELECT count(*)::int FROM game_tracks t WHERE t.game_id = g.id AND t.played) AS played_count`;

const toSummary = row => ({
  id: row.id,
  status: row.status,
  settings: row.settings,
  createdAt: row.created_at,
  endedAt: row.ended_at,
  trackCount: row.track_count,
  playedCount: row.played_count,
});

const toTrack = row => ({
  uri: row.uri,
  name: row.name,
  artists: row.artists,
  albumImage: row.album_image,
  themeId: row.theme_id,
  fromReview: row.from_review,
  position: row.position,
  played: row.played,
});

// Une nouvelle partie interrompt celle qui était en cours (onglet fermé sans quitter)
export async function createGame(pool, hostId, { settings, tracks }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE games g SET ended_at = now(), status = CASE
         WHEN EXISTS (SELECT 1 FROM game_tracks t WHERE t.game_id = g.id AND NOT t.played) THEN 'interrupted'
         ELSE 'finished' END
       WHERE g.host_id = $1 AND g.status = 'playing'`,
      [hostId],
    );
    const { rows } = await client.query('INSERT INTO games (host_id, settings) VALUES ($1, $2) RETURNING id', [hostId, settings]);
    const gameId = rows[0].id;
    const values = [];
    const params = [gameId];
    tracks.forEach((t, position) => {
      const p = params.length;
      values.push(`($1, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, $${p + 7})`);
      params.push(position, t.uri, t.name, JSON.stringify(t.artists), t.albumImage, t.themeId, t.fromReview);
    });
    await client.query(
      `INSERT INTO game_tracks (game_id, position, uri, name, artists, album_image, theme_id, from_review) VALUES ${values.join(', ')}`,
      params,
    );
    await client.query('COMMIT');
    return { id: gameId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function markPlayed(pool, hostId, gameId, position) {
  const { rowCount } = await pool.query(
    `UPDATE game_tracks t SET played = true FROM games g
     WHERE t.game_id = g.id AND g.id = $2 AND g.host_id = $1 AND t.position = $3`,
    [hostId, gameId, position],
  );
  return rowCount > 0;
}

// Terminée si toutes les chansons ont été jouées, interrompue sinon
export async function endGame(pool, hostId, gameId) {
  const { rows } = await pool.query(
    `UPDATE games g SET ended_at = now(), status = CASE
       WHEN EXISTS (SELECT 1 FROM game_tracks t WHERE t.game_id = g.id AND NOT t.played) THEN 'interrupted'
       ELSE 'finished' END
     WHERE g.id = $2 AND g.host_id = $1 AND g.status = 'playing'
     RETURNING g.status`,
    [hostId, gameId],
  );
  return rows[0]?.status ?? null;
}

export async function listGames(pool, hostId) {
  const { rows } = await pool.query(
    `SELECT ${SUMMARY_COLUMNS} FROM games g WHERE g.host_id = $1 ORDER BY g.created_at DESC LIMIT 50`,
    [hostId],
  );
  return rows.map(toSummary);
}

export async function getGame(pool, hostId, gameId) {
  const { rows } = await pool.query(`SELECT ${SUMMARY_COLUMNS} FROM games g WHERE g.id = $2 AND g.host_id = $1`, [hostId, gameId]);
  if (!rows[0]) return null;
  const tracks = await pool.query('SELECT * FROM game_tracks WHERE game_id = $1 ORDER BY position', [gameId]);
  return { ...toSummary(rows[0]), tracks: tracks.rows.map(toTrack) };
}

// Chansons réellement jouées de la dernière partie où au moins une chanson a été jouée
// (une partie dont le lancement a échoué n'efface pas l'exclusion de la précédente)
export async function lastGameExclusions(pool, hostId) {
  const { rows } = await pool.query(
    `SELECT uri FROM game_tracks WHERE played AND game_id = (
       SELECT g.id FROM games g WHERE g.host_id = $1
         AND EXISTS (SELECT 1 FROM game_tracks t WHERE t.game_id = g.id AND t.played)
       ORDER BY g.created_at DESC LIMIT 1
     ) ORDER BY position`,
    [hostId],
  );
  return rows.map(r => r.uri);
}
