import { deleteLink, getLink, saveLink } from './spotify-links.js';

export class SpotifyNotLinkedError extends Error {}
export class SpotifyRelinkRequiredError extends Error {}

const TOKEN_URL = 'https://accounts.spotify.com/api/token';

export function spotifyTokenRequest(params, timeoutMs) {
  return fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

// Un seul renouvellement à la fois par compte : Spotify change le refresh token à chaque fois
const inflight = new Map();

export function getAccessToken(pool, config, userId, { timeoutMs = 10_000 } = {}) {
  if (!inflight.has(userId)) {
    inflight.set(userId, loadToken(pool, config, userId, timeoutMs).finally(() => inflight.delete(userId)));
  }
  return inflight.get(userId);
}

async function loadToken(pool, config, userId, timeoutMs) {
  const now = new Date();
  const link = await getLink(pool, config.tokenKey, userId);
  if (!link) throw new SpotifyNotLinkedError();
  if (link.expiresAt > now) return { accessToken: link.accessToken, expiresAt: link.expiresAt };
  return refresh(pool, config, userId, link, now, timeoutMs);
}

async function refresh(pool, config, userId, link, now, timeoutMs) {
  const res = await spotifyTokenRequest({
    grant_type: 'refresh_token',
    refresh_token: link.refreshToken,
    client_id: config.spotifyClientId,
  }, timeoutMs);
  // Accès révoqué côté Spotify : la liaison est inutilisable, il faudra la refaire
  if (res.status === 400 || res.status === 401) {
    await deleteLink(pool, userId);
    throw new SpotifyRelinkRequiredError();
  }
  if (!res.ok) throw new Error(`refresh Spotify ${res.status}`);
  const data = await res.json();
  return saveLink(pool, config.tokenKey, userId, {
    spotifyUserId: link.spotifyUserId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? link.refreshToken,
    expiresIn: data.expires_in,
    now,
  });
}

// Traduit une erreur de token en réponse HTTP pour le client
export function sendTokenError(res, err) {
  if (err instanceof SpotifyNotLinkedError) return res.status(409).json({ error: 'spotify_not_linked' });
  if (err instanceof SpotifyRelinkRequiredError) return res.status(409).json({ error: 'spotify_relink_required' });
  console.error('[spotify] token indisponible :', err.message);
  res.status(502).json({ error: 'spotify_unreachable' });
}
