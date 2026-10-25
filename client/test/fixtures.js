// Données d'affichage partagées par les tests de composants
export const savedTrack = (n, over = {}) => ({
  uri: `spotify:track:t${n}`,
  name: `Titre ${n}`,
  artists: [`Artiste ${n}`, 'Feat'],
  albumImage: `https://i.scdn.co/${n}`,
  themeId: '80s',
  ...over,
});

export const summary = (over = {}) => ({
  id: 'g1',
  status: 'finished',
  settings: { themes: ['80s', 'disney'], perTheme: 5, timer: '30s', start: 'middle' },
  createdAt: '2026-10-24T20:30:00.000Z',
  endedAt: '2026-10-24T21:00:00.000Z',
  trackCount: 10,
  playedCount: 8,
  ...over,
});
