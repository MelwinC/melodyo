const S = { token: null, refresh: null, expiry: 0 };

export function loadTokens() {
  S.token   = localStorage.getItem('bt_token');
  S.refresh = localStorage.getItem('bt_refresh');
  S.expiry  = Number(localStorage.getItem('bt_expiry') || 0);
  return !!S.token;
}

export function saveTokens(token, refresh, expiresIn) {
  S.token = token;
  S.refresh = refresh;
  S.expiry = Date.now() + (expiresIn - 60) * 1000;
  localStorage.setItem('bt_token',   token);
  localStorage.setItem('bt_refresh', refresh);
  localStorage.setItem('bt_expiry',  S.expiry);
}

export const getToken = () => S.token;

// Le refresh token change à chaque renouvellement : les appels simultanés partagent la même requête
let refreshPromise = null;

export function ensureToken() {
  if (Date.now() < S.expiry) return Promise.resolve();
  if (!refreshPromise) refreshPromise = refreshToken().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function refreshToken() {
  const r = S.refresh || localStorage.getItem('bt_refresh');
  if (!r) throw new Error('not_logged_in');
  const res = await fetch('/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: r }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Session expirée, veuillez vous reconnecter.');
  saveTokens(data.access_token, data.refresh_token || r, data.expires_in);
}

/* ── SPOTIFY API (via server proxy) ── */
export async function api(method, path, body) {
  await ensureToken();
  const res = await fetch(`/spotify${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-token': S.token },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `Erreur Spotify ${res.status}`);
  return json;
}

// Module à état (tokens) : on recharge la page plutôt que de perdre l'état au hot reload
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
