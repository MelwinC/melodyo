const toReviewTrack = row => ({
  uri: row.uri,
  name: row.name,
  artists: row.artists,
  albumImage: row.album_image,
  themeId: row.theme_id,
  addedAt: row.added_at,
});

export async function listReview(pool, hostId) {
  const { rows } = await pool.query('SELECT * FROM review_tracks WHERE host_id = $1 ORDER BY added_at DESC', [hostId]);
  return rows.map(toReviewTrack);
}

export async function addReview(pool, hostId, track) {
  await pool.query(
    `INSERT INTO review_tracks (host_id, uri, name, artists, album_image, theme_id)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
    [hostId, track.uri, track.name, JSON.stringify(track.artists), track.albumImage, track.themeId],
  );
}

export async function removeReview(pool, hostId, uri) {
  await pool.query('DELETE FROM review_tracks WHERE host_id = $1 AND uri = $2', [hostId, uri]);
}
