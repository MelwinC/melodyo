// Données de partie valides pour les tests
export const settings = (over = {}) => ({ themes: ['80s'], perTheme: 3, timer: 'full', start: 'start', ...over });

export const track = (n, over = {}) => ({
  uri: `spotify:track:t${n}`,
  name: `Titre ${n}`,
  artists: [`Artiste ${n}`],
  albumImage: `https://i.scdn.co/image/${n}`,
  themeId: '80s',
  fromReview: false,
  ...over,
});
