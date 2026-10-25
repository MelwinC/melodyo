// Avatars proposés : partagés entre le serveur (validation) et le client (affichage)
export const AVATAR_PRESETS = [
  { id: 'note', emoji: '🎵', color: '#1db954' },
  { id: 'guitare', emoji: '🎸', color: '#e67e22' },
  { id: 'micro', emoji: '🎤', color: '#e84393' },
  { id: 'casque', emoji: '🎧', color: '#6c5ce7' },
  { id: 'vinyle', emoji: '💿', color: '#00b894' },
  { id: 'piano', emoji: '🎹', color: '#fdcb6e' },
  { id: 'batterie', emoji: '🥁', color: '#d63031' },
  { id: 'saxo', emoji: '🎷', color: '#0984e3' },
  { id: 'trompette', emoji: '🎺', color: '#e17055' },
  { id: 'violon', emoji: '🎻', color: '#a29bfe' },
  { id: 'radio', emoji: '📻', color: '#00cec9' },
  { id: 'etoile', emoji: '⭐', color: '#fd79a8' },
];

export const isPreset = id => AVATAR_PRESETS.some(a => a.id === id);
