const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = 8888;
const CLIENT_ID = '6cb984ffc4a14b71b43b70790e82a40d';
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';

const pendingAuth = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/login', (req, res) => {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  pendingAuth.set(state, verifier);
  setTimeout(() => pendingAuth.delete(state), 10 * 60 * 1000);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    state,
    scope: [
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
    ].join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

app.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`/?error=${encodeURIComponent(error)}`);

  const verifier = pendingAuth.get(state);
  if (!verifier) return res.redirect('/?error=invalid_state');
  pendingAuth.delete(state);

  try {
    const { data } = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        code_verifier: verifier,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const p = new URLSearchParams({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    });
    res.redirect(`/?${p}`);
  } catch (err) {
    console.error('Token exchange error:', err.response?.data || err.message);
    res.redirect('/?error=token_exchange_failed');
  }
});

// Proxy all Spotify API calls through the server so we can log errors
app.all('/spotify/*', async (req, res) => {
  const token = req.headers['x-token'];
  if (!token) return res.status(401).json({ error: 'missing_token' });

  const spotifyPath = req.originalUrl.replace(/^\/spotify/, '');
  const url = `https://api.spotify.com/v1${spotifyPath}`;

  try {
    const response = await axios({
      method: req.method,
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
      validateStatus: () => true,
    });

    const short = spotifyPath.split('?')[0];
    console.log(`[Spotify] ${req.method} ${short} → ${response.status}`);
    if (response.status >= 400) {
      console.error('[Spotify Error]', JSON.stringify(response.data));
    }

    if (response.status === 204) return res.sendStatus(204);
    res.status(response.status).json(response.data);
  } catch (err) {
    console.error('[Proxy Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'missing_token' });

  try {
    const { data } = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token,
        client_id: CLIENT_ID,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: 'refresh_failed' });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Blind Test — http://127.0.0.1:${PORT}\n`);
});
