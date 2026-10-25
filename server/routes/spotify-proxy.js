import express from 'express';

// Relaie les appels de l'app vers l'API Spotify pour journaliser les erreurs côté serveur
function isJson(text) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

export function spotifyProxyRouter({ timeoutMs = 10_000 } = {}) {
  const router = express.Router();

  router.all('/spotify/*', async (req, res) => {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'missing_token' });

    const spotifyPath = req.originalUrl.replace(/^\/spotify/, '');
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method);

    try {
      const response = await fetch(`https://api.spotify.com/v1${spotifyPath}`, {
        method: req.method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: hasBody ? JSON.stringify(req.body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
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
  });

  return router;
}
