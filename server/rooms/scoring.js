// 1 point pour un titre validé, 1 pour un artiste validé, sur les seules chansons révélées
// (sinon le score trahirait la correction avant la révélation) ; 0 pour un participant sans réponse
export async function getScores(pool, gameId, participantIds) {
  const { rows } = await pool.query(
    `SELECT a.participant_id, sum((a.title_ok IS TRUE)::int + (a.artist_ok IS TRUE)::int)::int AS score
     FROM answers a JOIN game_reveals r ON r.game_id = a.game_id AND r.position = a.position
     WHERE a.game_id = $1 GROUP BY a.participant_id`,
    [gameId],
  );
  const scores = new Map(participantIds.map(id => [id, 0]));
  for (const r of rows) if (scores.has(r.participant_id)) scores.set(r.participant_id, r.score);
  return scores;
}

// Classement : ex æquo au même rang (1, 1, 3), départagés à l'affichage par nom
export function rank(rows) {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'fr'));
  return sorted.map(row => ({ ...row, rank: sorted.findIndex(r => r.score === row.score) + 1 }));
}

// Réponses d'un participant chanson par chanson ; la chanson n'apparaît que si elle a été révélée
export async function getParticipantDetail(pool, gameId, participantId) {
  const { rows } = await pool.query(
    `SELECT t.position, t.name, t.artists, t.album_image, r.position IS NOT NULL AS revealed,
            a.title, a.artist, a.title_ok, a.artist_ok
     FROM game_tracks t
     LEFT JOIN answers a ON a.game_id = t.game_id AND a.position = t.position AND a.participant_id = $2
     LEFT JOIN game_reveals r ON r.game_id = t.game_id AND r.position = t.position
     WHERE t.game_id = $1 ORDER BY t.position`,
    [gameId, participantId],
  );
  return rows.map(r => ({
    position: r.position,
    track: r.revealed ? { position: r.position, name: r.name, artists: r.artists, albumImage: r.album_image } : null,
    answer: r.title === null ? null : { title: r.title, artist: r.artist },
    titleOk: r.title_ok,
    artistOk: r.artist_ok,
  }));
}
