import crypto from 'node:crypto';
import express from 'express';
import { asyncRoute } from '../async-route.js';
import { requireUser } from '../session-middleware.js';
import { getAccessToken, sendTokenError, spotifyTokenRequest } from '../spotify-auth.js';
import { saveLink } from '../spotify-links.js';

const STATE_TTL_MS = 10 * 60 * 1000;
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
];

// Liaison du compte Spotify du créateur : les tokens restent côté serveur, jamais dans l'URL
export function spotifyAuthRouter({ pool, config, maxPending = 1000 }) {
  const router = express.Router();
  const timeoutMs = config.spotifyTimeoutMs;
  const pendingAuth = new Map();

  router.get('/api/spotify/connect', (req, res) => {
    if (!req.user) return res.redirect('/?error=login_required');

    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    // Plafond : des appels en rafale ne peuvent pas faire grossir la mémoire sans limite
    if (pendingAuth.size >= maxPending) pendingAuth.delete(pendingAuth.keys().next().value);
    pendingAuth.set(state, { verifier, userId: req.user.id });
    setTimeout(() => pendingAuth.delete(state), STATE_TTL_MS).unref();

    const params = new URLSearchParams({
      client_id: config.spotifyClientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      state,
      scope: SCOPES.join(' '),
      code_challenge_method: 'S256',
      code_challenge: challenge,
    });
    res.redirect(`https://accounts.spotify.com/authorize?${params}`);
  });

  router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`/?error=${encodeURIComponent(error)}`);

    const pending = pendingAuth.get(state);
    if (!pending) return res.redirect('/?error=invalid_state');
    pendingAuth.delete(state);
    if (req.user?.id !== pending.userId) return res.redirect('/?error=login_required');

    try {
      const tokenRes = await spotifyTokenRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: config.spotifyClientId,
        code_verifier: pending.verifier,
      }, timeoutMs);
      const tokens = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(`échange du code ${tokenRes.status}`);

      const meRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!meRes.ok) throw new Error(`profil Spotify ${meRes.status}`);
      const me = await meRes.json();

      await saveLink(pool, config.tokenKey, pending.userId, {
        spotifyUserId: me.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
      });
      res.redirect('/');
    } catch (err) {
      console.error('[spotify] liaison échouée :', err.message);
      res.redirect('/?error=token_exchange_failed');
    }
  });

  router.get('/api/spotify/token', requireUser, asyncRoute(async (req, res) => {
    try {
      res.json(await getAccessToken(pool, config, req.user.id, { timeoutMs }));
    } catch (err) {
      sendTokenError(res, err);
    }
  }));

  return router;
}
