import { reloadOnHotUpdate } from './hot.js';
import { markSpotifyUnlinked } from './session.js';

// Le token d'accès n'est jamais stocké côté navigateur : le SDK le demande au serveur
let token = null;
let expiresAt = 0;
let pending = null;

const relinkError = () => {
  markSpotifyUnlinked();
  return new Error('Reconnecte ton compte Spotify');
};

async function fetchToken() {
  const res = await fetch('/api/spotify/token');
  const json = await res.json();
  if (res.status === 409) throw relinkError();
  if (!res.ok) throw new Error('Spotify injoignable, réessaie');
  token = json.accessToken;
  expiresAt = new Date(json.expiresAt).getTime();
}

export function ensureToken() {
  if (token && Date.now() < expiresAt) return Promise.resolve();
  pending ??= fetchToken().finally(() => { pending = null; });
  return pending;
}

export const getToken = () => token;

/* ── SPOTIFY API (via le proxy du serveur, qui ajoute le token du compte) ── */
export async function api(method, path, body) {
  const res = await fetch(`/spotify${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json();
  if (res.status === 409) throw relinkError();
  if (!res.ok) throw new Error(json.error?.message || `Erreur Spotify ${res.status}`);
  return json;
}

reloadOnHotUpdate(import.meta.hot);
