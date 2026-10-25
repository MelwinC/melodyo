import express from 'express';
import { asyncRoute } from '../async-route.js';
import { requireUser } from '../session-middleware.js';
import { getAccessToken, sendTokenError } from '../spotify-auth.js';

function isJson(text) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

// Relaie les appels de l'app vers l'API Spotify avec le token stocké du compte connecté
export function spotifyProxyRouter({ pool, config }) {
  const router = express.Router();
  const timeoutMs = config.spotifyTimeoutMs;

  router.all('/spotify/*', requireUser, asyncRoute(async (req, res) => {
    let accessToken;
    try {
      ({ accessToken } = await getAccessToken(pool, config, req.user.id, { timeoutMs }));
    } catch (err) {
      return sendTokenError(res, err);
    }

    const spotifyPath = req.originalUrl.replace(/^\/spotify/, '');
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method);
    const callSpotify = token => fetch(`https://api.spotify.com/v1${spotifyPath}`, {
      method: req.method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: hasBody ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });

    try {
      let response = await callSpotify(accessToken);
      // Token refusé avant son expiration : un renouvellement forcé, puis un seul nouvel essai
      if (response.status === 401) {
        try {
          ({ accessToken } = await getAccessToken(pool, config, req.user.id, { timeoutMs, forceRefresh: true }));
        } catch (err) {
          return sendTokenError(res, err);
        }
        response = await callSpotify(accessToken);
      }
      const text = await response.text();

      console.log(`[Spotify] ${req.method} ${spotifyPath.split('?')[0]} → ${response.status}`);
      if (response.status >= 400) console.error('[Spotify Error]', text);

      res.status(response.status);
      if (!text) return res.end();
      // Une page d'erreur HTML (passerelle Spotify) est encapsulée pour que le client reçoive toujours du JSON
      res.type('json').send(isJson(text) ? text : JSON.stringify(text));
    } catch (err) {
      console.error('[Proxy Error]', err.message);
      res.status(502).json({ error: err.message });
    }
  }));

  return router;
}
