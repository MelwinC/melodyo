// Avatars proposés : partagés entre le serveur (validation) et le client (affichage)
export const AVATAR_PRESETS = [
  { id: 'note', emoji: '🎵', color: '#cfc2fa' },
  { id: 'guitare', emoji: '🎸', color: '#ffd3b8' },
  { id: 'micro', emoji: '🎤', color: '#ffcfe0' },
  { id: 'casque', emoji: '🎧', color: '#d9d0fb' },
  { id: 'vinyle', emoji: '💿', color: '#c2ecd9' },
  { id: 'piano', emoji: '🎹', color: '#fff0ae' },
  { id: 'batterie', emoji: '🥁', color: '#ffc9cf' },
  { id: 'saxo', emoji: '🎷', color: '#c4e3fa' },
  { id: 'trompette', emoji: '🎺', color: '#ffd9c4' },
  { id: 'violon', emoji: '🎻', color: '#dcd3fb' },
  { id: 'radio', emoji: '📻', color: '#bfeaea' },
  { id: 'etoile', emoji: '⭐', color: '#ffd3e8' },
];

export const isPreset = id => AVATAR_PRESETS.some(a => a.id === id);
