import { request, uploadImage } from './http.js';
import { reloadOnHotUpdate } from './hot.js';
import { resizeForAvatar } from './image.js';
import { toast } from './toast.js';

/* ── STORE (lu par les composants via useSyncExternalStore) ── */
let snapshot = { status: 'loading', user: null };
const listeners = new Set();

function set(next) {
  snapshot = next;
  listeners.forEach(fn => fn());
}

const ready = user => set({ status: 'ready', user });

export const subscribeSession = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const getSession = () => snapshot;

export async function loadSession() {
  try {
    ready((await request('GET', '/api/me')).user);
  } catch (err) {
    if (err.status !== 401) toast('Serveur injoignable, réessaie dans un instant');
    set({ status: 'anonymous', user: null });
  }
}

export async function login(username, password) {
  ready((await request('POST', '/api/auth/login', { username, password })).user);
}

export async function register(username, password) {
  ready((await request('POST', '/api/auth/register', { username, password })).user);
}

export async function logout() {
  await request('POST', '/api/auth/logout');
  set({ status: 'anonymous', user: null });
}

export async function choosePreset(preset) {
  ready((await request('PUT', '/api/me/avatar', { preset })).user);
}

export async function uploadAvatar(file) {
  ready((await uploadImage('/api/me/avatar', await resizeForAvatar(file))).user);
}

// Liaison Spotify révoquée ou absente : l'app repasse sur l'écran « Relier Spotify »
export function markSpotifyUnlinked() {
  if (snapshot.user) ready({ ...snapshot.user, spotifyLinked: false });
}

const MESSAGES = {
  username_taken: 'Ce pseudo est déjà pris',
  invalid_credentials: 'Pseudo ou mot de passe incorrect',
  invalid_username: 'Pseudo : 3 à 20 caractères (lettres, chiffres, . _ -)',
  invalid_password: 'Mot de passe : 8 caractères minimum',
  too_many_requests: 'Trop de tentatives, réessaie dans quelques minutes',
  invalid_image: 'Image illisible (PNG, JPEG ou WebP)',
  unsupported_type: 'Format non supporté (PNG, JPEG ou WebP)',
  'entity.too.large': 'Image trop lourde (2 Mo max)',
};

export const messageFor = code => MESSAGES[code] ?? 'Une erreur est survenue';


reloadOnHotUpdate(import.meta.hot);
