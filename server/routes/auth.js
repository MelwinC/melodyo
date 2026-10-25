import crypto from 'node:crypto';
import express from 'express';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
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

function postForm(params, timeoutMs) {
  return fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export function authRouter(config, { maxPending = 1000, timeoutMs = 10_000 } = {}) {
  const router = express.Router();
  const pendingAuth = new Map();

  router.get('/login', (req, res) => {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    // Plafond : des appels en rafale à /login ne peuvent pas faire grossir la mémoire sans limite
    if (pendingAuth.size >= maxPending) pendingAuth.delete(pendingAuth.keys().next().value);
    pendingAuth.set(state, verifier);
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

    const verifier = pendingAuth.get(state);
    if (!verifier) return res.redirect('/?error=invalid_state');
    pendingAuth.delete(state);

    try {
      const response = await postForm({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: config.spotifyClientId,
        code_verifier: verifier,
      }, timeoutMs);
      const data = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(data));

      const p = new URLSearchParams({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      });
      res.redirect(`/?${p}`);
    } catch (err) {
      console.error('Token exchange error:', err.message);
      res.redirect('/?error=token_exchange_failed');
    }
  });

  router.post('/refresh', async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'missing_token' });

    try {
      const response = await postForm({
        grant_type: 'refresh_token',
        refresh_token,
        client_id: config.spotifyClientId,
      }, timeoutMs);
      if (!response.ok) throw new Error(`refresh ${response.status}`);
      res.json(await response.json());
    } catch {
      res.status(400).json({ error: 'refresh_failed' });
    }
  });

  return router;
}
