export const THEMES = [
  { id: '80s',      label: 'Années 80',         emoji: '📻', playlists: ['65fwT4kfhQvubg7lT0AzPB', '4B37D5fCKikvqycuWg32ut'] },
  { id: '90s',      label: 'Années 90',         emoji: '💿', playlists: ['1o7s2xIFcSHDlOeEuKiCQ4', '02Z9wGJqHVGU5ncfUbZwy7'] },
  { id: '2000s',    label: 'Années 2000',       emoji: '📱', playlists: ['1hXlxfZzz5wE8e6d8NyFIS', '5UljsyCV5dkx6r2U3n5XGn'] },
  { id: '2010s',    label: 'Années 2010',       emoji: '🎧', playlists: ['0v07FRk1SDFWwANuPLoE1i', '66r21SD7RHmAczj4PuIMlQ'] },
  { id: '2020s',    label: '2020 – 2026',       emoji: '🔥', playlists: ['0tfVPwZuHt1BnljLkBWS2q', '5gqX1GdEOWb68v32QsDwbu'] },
  { id: 'disney',   label: 'Disney FR',          emoji: '🏰', playlists: ['7b3R2zEGZdKMSDt9P39eQH'] },
  { id: 'french',   label: 'Variété Française', emoji: '🇫🇷', playlists: ['1dGIBlB5tXeEMfnl0aIwkT'] },
  { id: 'pop',      label: 'Pop',               emoji: '🎵', playlists: ['6CEiAiPJ2KEx7iTnh6zFPa'] },
  { id: 'poprock',  label: 'Pop Rock',          emoji: '🎸', playlists: ['2Kt0sB6fx8Qsk4LKed4ahH'] },
  { id: 'popchill', label: 'Pop Chill',         emoji: '🎤', playlists: ['3jFkI8ltF3cRMN8Aj4jFdL'] },
];

export const MIN_PER_THEME = 2;
export const MAX_PER_THEME = 50;

export const findTheme = id => THEMES.find(t => t.id === id);
