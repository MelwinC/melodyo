// Statistiques d'un compte, calculées à partir des parties terminées où il a répondu.
// Si le compte apparaît deux fois dans une partie (invité puis compte), sa meilleure participation compte.
const GAMES_QUERY = `
  WITH scores AS (
    SELECT a.game_id, a.participant_id,
           sum((a.title_ok IS TRUE)::int + (a.artist_ok IS TRUE)::int)::int AS score,
           sum((a.title_ok IS TRUE)::int)::int AS titles,
           sum((a.artist_ok IS TRUE)::int)::int AS artists
    FROM answers a JOIN games g ON g.id = a.game_id AND g.status = 'finished'
    GROUP BY a.game_id, a.participant_id
  ),
  ranked AS (
    SELECT s.*, RANK() OVER (PARTITION BY s.game_id ORDER BY s.score DESC)::int AS rank,
           count(*) OVER (PARTITION BY s.game_id)::int AS players
    FROM scores s
  )
  SELECT DISTINCT ON (r.game_id) r.game_id, r.participant_id, r.titles, r.artists, r.rank, r.players,
         (SELECT count(*)::int FROM game_tracks t WHERE t.game_id = r.game_id) AS songs
  FROM ranked r JOIN participants p ON p.id = r.participant_id AND p.user_id = $1
  ORDER BY r.game_id, r.score DESC`;

const THEMES_QUERY = `
  SELECT t.theme_id, count(*)::int AS songs,
         sum((a.title_ok IS TRUE)::int)::int AS titles, sum((a.artist_ok IS TRUE)::int)::int AS artists
  FROM unnest($1::uuid[], $2::uuid[]) AS mine(game_id, participant_id)
  JOIN game_tracks t ON t.game_id = mine.game_id
  LEFT JOIN answers a ON a.game_id = t.game_id AND a.position = t.position AND a.participant_id = mine.participant_id
  GROUP BY t.theme_id ORDER BY songs DESC, t.theme_id`;

const percent = (count, total) => (total ? Math.round((100 * count) / total) : null);
const sum = (rows, key) => rows.reduce((n, r) => n + r[key], 0);

export async function getStats(pool, userId) {
  const { rows: games } = await pool.query(GAMES_QUERY, [userId]);
  const { rows: themes } = await pool.query(THEMES_QUERY, [games.map(g => g.game_id), games.map(g => g.participant_id)]);

  // Victoires, défaites et classements : seulement les parties à au moins 2 participants
  const ranked = games.filter(g => g.players >= 2);
  const wins = ranked.filter(g => g.rank === 1).length;
  const songs = sum(games, 'songs');
  const titles = sum(games, 'titles');
  const artists = sum(games, 'artists');

  return {
    games: games.length,
    wins,
    losses: ranked.length - wins,
    titleRate: percent(titles, songs),
    artistRate: percent(artists, songs),
    overallRate: percent(titles + artists, 2 * songs),
    averageRank: ranked.length ? Math.round((10 * sum(ranked, 'rank')) / ranked.length) / 10 : null,
    bestRank: ranked.length ? Math.min(...ranked.map(g => g.rank)) : null,
    themes: themes.map(t => ({ themeId: t.theme_id, songs: t.songs, titleOk: t.titles, artistOk: t.artists })),
  };
}
