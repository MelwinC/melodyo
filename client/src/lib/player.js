import { api, ensureToken, getToken } from './spotify.js';
import { toast } from './toast.js';
import { reloadOnHotUpdate } from './hot.js';

let player = null;
let deviceId = null;
let initPromise = null;
let playbackErrorCount = 0;
let queue = [];

/* ── OPTIONS DE PARTIE (extrait de 30 s, départ au milieu) ── */
const EXTRACT_MS = 30000;
let options = { timer: 'full', start: 'start' };
let started = new Set();
let playedMs = 0;
let lastTick = null;
let extractDone = false;

// Temps d'écoute de l'extrait : ne s'écoule que pendant la lecture (la pause l'arrête, un saut de ±10 s ne change rien)
function extractPatch(paused) {
  const now = Date.now();
  if (lastTick !== null) playedMs += now - lastTick;
  lastTick = paused ? null : now;
  if (options.timer !== '30s') return { remaining: null };
  const remaining = Math.max(0, EXTRACT_MS - playedMs);
  // Une seule pause automatique par chanson : après la révélation, on peut écouter la suite
  if (remaining === 0 && !paused && !extractDone) {
    extractDone = true;
    player.pause().catch(() => {});
  }
  return { remaining };
}

/* ── STORE (lu par les composants via useSyncExternalStore) ── */
let snapshot = { paused: true, position: 0, duration: 0, sdkTrack: null, index: 0, total: 0, theme: null, timer: 'full', remaining: null };
const listeners = new Set();

function update(patch) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach(fn => fn());
}

export const subscribePlayer = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const getPlayerSnapshot = () => snapshot;

/* ── INIT (lancé dès l'écran de création) ── */
export function ensurePlayer() {
  if (player) return Promise.resolve(player);
  if (!initPromise) {
    console.log('[player] démarrage initPlayer…');
    initPromise = initPlayer().catch(err => {
      console.error('[player] initPlayer échoué :', err.message);
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

// Le délai court dès le départ : il couvre aussi un SDK jamais chargé (bloqueur de pub, réseau)
function initPlayer() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Délai dépassé — impossible de se connecter au lecteur Spotify.'));
    }, 20000);
    const fail = err => { clearTimeout(timeout); reject(err); };
    connectPlayer(p => { clearTimeout(timeout); resolve(p); }, fail).catch(fail);
  });
}

async function connectPlayer(onReady, onError) {
  await window.spotifySdkReady;
  await ensureToken();

  const p = new window.Spotify.Player({
    name: 'Melodyo',
    getOAuthToken: async cb => {
      try {
        await ensureToken();
        cb(getToken());
      } catch (e) {
        console.error('[player] renouvellement du token échoué :', e.message);
        toast(e.message);
      }
    },
    volume: 0.8,
  });

  p.addListener('ready', ({ device_id }) => {
    console.log('[player] ready! device_id:', device_id);
    deviceId = device_id;
    player = p;
    onReady(p);
  });
  p.addListener('player_state_changed', onPlayerStateChanged);
  p.addListener('initialization_error', e => { console.error('[player] initialization_error:', e.message); onError(new Error(e.message)); });
  p.addListener('authentication_error', e => { console.error('[player] authentication_error:', e.message); onError(new Error('Erreur d\'authentification Spotify')); });
  p.addListener('account_error', e => { console.error('[player] account_error:', e.message); onError(new Error('Spotify Premium requis pour la lecture dans le navigateur')); });
  p.addListener('not_ready', ({ device_id }) => console.warn('[player] not_ready, device_id:', device_id));
  p.addListener('playback_error', e => {
    console.error('[player] playback_error:', e.message);
    // Erreurs en rafale = le navigateur ne peut pas déchiffrer l'audio (DRM Widevine) :
    // on met en pause au lieu de laisser le SDK sauter toute la playlist
    if (++playbackErrorCount >= 2) {
      p.pause().catch(() => {});
      toast('⚠️ Ce navigateur ne peut pas lire l\'audio Spotify (DRM). Essaie Chrome ou Edge.');
    } else {
      toast(`⚠️ Lecture impossible : ${e.message}`);
    }
  });
  p.addListener('autoplay_failed', () => {
    console.warn('[player] autoplay bloqué par le navigateur');
    toast('Lecture bloquée par le navigateur — appuie sur ▶');
  });
  p.connect();
}

// Firefox reçoit un 403 sur la licence Widevine de Spotify : aucun son n'est lisible
export const isFirefox = /firefox|fxios/i.test(navigator.userAgent);

/* ── LECTURE ── */
export async function startQueue(tracks, { timer = 'full', start = 'start', onTrackStart = () => {} } = {}) {
  queue = tracks;
  options = { timer, start, onTrackStart };
  started = new Set();
  playedMs = 0;
  lastTick = null;
  update({
    index: 0, total: tracks.length, sdkTrack: null, theme: null, position: 0, duration: 0,
    timer, remaining: timer === '30s' ? EXTRACT_MS : null,
  });

  console.log(`[transfer] transfert vers device ${deviceId}…`);
  await api('PUT', '/me/player', { device_ids: [deviceId], play: false });
  await new Promise(r => setTimeout(r, 600));
  console.log(`[transfer] lancement de ${tracks.length} URIs…`);
  await api('PUT', `/me/player/play?device_id=${deviceId}`, {
    uris: tracks.map(t => t.uri),
    offset: { position: 0 },
  });
}

// Spotify peut remplacer un titre par une version équivalente (relinking) : on compare aussi linked_from
function trackUris(track) {
  return [track.uri, track.linked_from?.uri].filter(Boolean);
}

function onPlayerStateChanged(state) {
  if (!state) return;
  if (!state.paused && state.position > 0) playbackErrorCount = 0;

  const sdkTrack = state.track_window?.current_track || null;
  const patch = { paused: state.paused, position: state.position, duration: state.duration, sdkTrack };

  if (sdkTrack && sdkTrack.uri !== snapshot.sdkTrack?.uri) {
    const uris = trackUris(sdkTrack);
    const idx = queue.findIndex(t => trackUris(t).some(u => uris.includes(u)));
    if (idx >= 0) patch.index = idx;
    patch.theme = idx >= 0 ? { id: queue[idx]._themeId, label: queue[idx]._themeLabel } : null;

    // Nouvelle chanson (ou retour sur une précédente) : l'extrait repart de zéro
    playedMs = 0;
    lastTick = null;
    extractDone = false;
    if (options.start === 'middle') {
      player.seek(Math.max(0, Math.floor(state.duration / 2) - (options.timer === '30s' ? 15000 : 0)));
    }
    if (idx >= 0 && !started.has(idx)) {
      started.add(idx);
      options.onTrackStart(idx);
    }
  }
  update({ ...patch, ...extractPatch(state.paused) });
}

export async function pollPosition() {
  const state = await player?.getCurrentState();
  if (state) update({ position: state.position, duration: state.duration, ...extractPatch(state.paused) });
}

// Doit être appelé de façon synchrone dans un clic, sinon le navigateur peut bloquer l'audio
export const activate = () => player?.activateElement();

export async function togglePlay() {
  if (!player) return;
  activate();
  await player.togglePlay();
}

export const nextTrack = () => player?.nextTrack();
export const previousTrack = () => player?.previousTrack();
export const pause = () => player?.pause().catch(() => {});
export const disconnect = () => player?.disconnect();
export const seek = ms => player?.seek(Math.floor(ms));

export async function seekBy(deltaMs) {
  const state = await player?.getCurrentState();
  if (!state) return;
  await player.seek(Math.max(0, Math.min(state.position + deltaMs, state.duration - 1000)));
}

reloadOnHotUpdate(import.meta.hot);
