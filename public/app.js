/* ── THEMES ── */
const THEMES = [
  { id: '80s',      label: 'Années 80',         emoji: '📻', playlists: ['65fwT4kfhQvubg7lT0AzPB', '4B37D5fCKikvqycuWg32ut'] },
  { id: '90s',      label: 'Années 90',         emoji: '💿', playlists: ['1o7s2xIFcSHDlOeEuKiCQ4', '02Z9wGJqHVGU5ncfUbZwy7'] },
  { id: '2000s',    label: 'Années 2000',       emoji: '📱', playlists: ['1hXlxfZzz5wE8e6d8NyFIS', '5UljsyCV5dkx6r2U3n5XGn'] },
  { id: '2010s',    label: 'Années 2010',       emoji: '🎧', playlists: ['0v07FRk1SDFWwANuPLoE1i', '66r21SD7RHmAczj4PuIMlQ'] },
  { id: '2020s',    label: '2020 – 2026',       emoji: '🔥', playlists: ['0tfVPwZuHt1BnljLkBWS2q', '5gqX1GdEOWb68v32QsDwbu'] },
  { id: 'disney',   label: 'Disney FR',          emoji: '🏰', playlists: ['7b3R2zEGZdKMSDt9P39eQH'] },
  { id: 'french',   label: 'Variété Française', emoji: '🇫🇷', playlists: ['1dGIBlB5tXeEMfnl0aIwkT'] },
  { id: 'pop',      label: 'Pop',               emoji: '🎵', playlists: ['6CEiAiPJ2KEx7iTnh6zFPa'] },
  { id: 'poprock',  label: 'Pop Rock',          emoji: '🎸', playlists: ['2Kt0sB6fx8Qsk4LKed4ahH'] },
  { id: 'popchill', label: 'Pop Chill',         emoji: '🎤', playlists: ['3jFkI8ltF3cRMN8Aj4jFdL'] },
];

/* ── STATE ── */
const S = {
  token: null, refresh: null, expiry: 0, userId: null,
  player: null, deviceId: null, sdkReady: false,
  currentTrackUri: null, currentSDKTrack: null,
  btTracks: [], btIndex: 0, btRevealed: false,
  btTrackThemes: {}, currentTheme: null,
  playerState: null,
};

/* ── SDK READY PROMISE ── */
let resolveSDK;
const sdkReadyPromise = new Promise(r => { resolveSDK = r; });
window.onSpotifyWebPlaybackSDKReady = () => { S.sdkReady = true; resolveSDK(); };

/* ── TOKENS ── */
function loadTokens() {
  S.token   = localStorage.getItem('bt_token');
  S.refresh = localStorage.getItem('bt_refresh');
  S.expiry  = Number(localStorage.getItem('bt_expiry') || 0);
}

function saveTokens(token, refresh, expiresIn) {
  S.token = token;
  S.refresh = refresh;
  S.expiry = Date.now() + (expiresIn - 60) * 1000;
  localStorage.setItem('bt_token',   token);
  localStorage.setItem('bt_refresh', refresh);
  localStorage.setItem('bt_expiry',  S.expiry);
}

async function ensureToken() {
  if (Date.now() < S.expiry) return;
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
async function api(method, path, body) {
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

/* ── PLAYER INIT (lancé dès l'écran de création) ── */
let playerInitPromise = null;

function ensurePlayerInit() {
  if (S.player) { console.log('[player] déjà connecté, device:', S.deviceId); return Promise.resolve(S.player); }
  if (!playerInitPromise) {
    console.log('[player] démarrage initPlayer…');
    playerInitPromise = initPlayer().catch(err => {
      console.error('[player] initPlayer échoué :', err.message);
      playerInitPromise = null;
      throw err;
    });
  }
  return playerInitPromise;
}

/* ── TRACK SEARCH ── */
function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/\s*[-–(]\s*(remaster(ed)?(\s+\d{4})?|radio edit|single version|original mix|extended mix|live|acoustic|mono|stereo|\d{4} remaster)\s*[)\s]*/gi, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchTracksFromPlaylist(playlistId, theme, count) {
  console.log(`[fetch] ${theme.label} — playlist ${playlistId} — demande ${count} sons`);

  const first = await api('GET', `/playlists/${playlistId}/items?limit=10&offset=0&market=FR`)
    .catch(e => { console.warn(`[fetch] offset=0 échoué :`, e.message); return { items: [], total: 0 }; });

  const total = first.total || (first.items?.length ?? 0);
  console.log(`[fetch] ${playlistId} total=${total} items récupérés à offset=0 : ${first.items?.length ?? 0}`);
  console.log(`[fetch] ${playlistId} structure du premier item :`, JSON.stringify(first.items?.[0]));

  const maxOffset = Math.max(0, Math.floor((total - 10) / 10) * 10);
  const possible = [];
  for (let o = 10; o <= maxOffset; o += 10) possible.push(o);

  const extra = shuffle(possible).slice(0, 3);
  console.log(`[fetch] ${playlistId} offsets extra choisis :`, extra);

  const additional = await Promise.all(
    extra.map(offset =>
      api('GET', `/playlists/${playlistId}/items?limit=10&offset=${offset}&market=FR`)
        .catch(e => { console.warn(`[fetch] offset=${offset} échoué :`, e.message); return { items: [] }; })
    )
  );

  const seen = new Set();
  let all = [first, ...additional]
    .flatMap(r => (r.items || []).filter(i => i.item?.id && i.item?.uri).map(i => i.item))
    .filter(t => !seen.has(t.uri) && seen.add(t.uri));

  console.log(`[fetch] ${playlistId} — ${all.length} sons bruts avant filtre popularité`);

  if (!all.length) throw new Error(`Playlist vide ou inaccessible pour : ${theme.label}`);

  let filtered = all.filter(t => (t.popularity || 0) >= 50);
  console.log(`[fetch] ${playlistId} — ${filtered.length} sons popularité ≥50`);
  if (filtered.length < count) {
    filtered = all.filter(t => (t.popularity || 0) >= 30);
    console.log(`[fetch] ${playlistId} — fallback popularité ≥30 : ${filtered.length} sons`);
  }
  if (!filtered.length) filtered = all;

  const result = shuffle(filtered).slice(0, count).map(t => ({ ...t, _themeId: theme.id, _themeLabel: theme.label }));
  console.log(`[fetch] ${playlistId} — ${result.length} sons retenus`);
  return result;
}

async function buildTracks(themeIds, perTheme, onProgress) {
  console.log(`[build] thèmes : ${themeIds.join(', ')} — ${perTheme} sons/thème`);
  const all = [];
  for (let i = 0; i < themeIds.length; i++) {
    const theme = THEMES.find(t => t.id === themeIds[i]);
    if (!theme) { console.warn(`[build] thème inconnu : ${themeIds[i]}`); continue; }
    onProgress(`${theme.emoji} Chargement : ${theme.label}…`, Math.round((i / themeIds.length) * 80));
    try {
      const playlistIds = theme.playlists;
      console.log(`[build] ${theme.label} — ${playlistIds.length} playlist(s)`);
      if (playlistIds.length === 1) {
        const tracks = await fetchTracksFromPlaylist(playlistIds[0], theme, perTheme);
        console.log(`[build] ${theme.label} → ${tracks.length} sons`);
        all.push(...tracks);
      } else {
        const perPl = Math.ceil(perTheme / playlistIds.length);
        const results = await Promise.all(
          playlistIds.map(id => fetchTracksFromPlaylist(id, theme, perPl).catch(e => {
            console.warn(`[build] playlist ${id} échouée :`, e.message); return [];
          }))
        );
        const seen = new Set();
        const merged = results.flat().filter(t => t?.uri && !seen.has(t.uri) && seen.add(t.uri));
        const kept = shuffle(merged).slice(0, perTheme);
        console.log(`[build] ${theme.label} — merged ${merged.length} → gardés ${kept.length}`);
        all.push(...kept);
      }
    } catch (e) {
      console.warn(`[build] thème ignoré (${theme.label}) :`, e.message);
      toast(`⚠️ ${theme.label} : ${e.message}`);
    }
  }
  console.log(`[build] total avant dédup : ${all.length} sons`);
  const seenTitles = new Set();
  const deduped = shuffle(all).filter(t => {
    const key = normalizeTitle(t.name);
    if (!key || seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });
  console.log(`[build] total après dédup titre : ${deduped.length} sons`);
  return deduped;
}

/* ── WEB PLAYBACK SDK ── */
async function initPlayer() {
  console.log('[player] attente SDK…');
  await sdkReadyPromise;
  console.log('[player] SDK prêt, création du player…');
  await ensureToken();

  return new Promise((resolve, reject) => {
    const player = new Spotify.Player({
      name: 'Blind Test App',
      getOAuthToken: async cb => { await ensureToken(); cb(S.token); },
      volume: 0.8,
    });

    const timeout = setTimeout(() => {
      reject(new Error('Délai dépassé — impossible de se connecter au lecteur Spotify.'));
    }, 20000);

    player.addListener('ready', ({ device_id }) => {
      clearTimeout(timeout);
      console.log('[player] ready! device_id:', device_id);
      S.deviceId = device_id;
      S.player = player;
      resolve(player);
    });
    player.addListener('player_state_changed', onPlayerStateChanged);
    player.addListener('initialization_error', e => { clearTimeout(timeout); console.error('[player] initialization_error:', e.message); reject(new Error(e.message)); });
    player.addListener('authentication_error', e => { clearTimeout(timeout); console.error('[player] authentication_error:', e.message); reject(new Error('Erreur d\'authentification Spotify')); });
    player.addListener('account_error', e => { clearTimeout(timeout); console.error('[player] account_error:', e.message); reject(new Error('Spotify Premium requis pour la lecture dans le navigateur')); });
    player.addListener('not_ready', ({ device_id }) => console.warn('[player] not_ready, device_id:', device_id));
    console.log('[player] connect()…');
    player.connect();
  });
}

async function transferAndPlay(trackUris) {
  console.log(`[transfer] transfert vers device ${S.deviceId}…`);
  await api('PUT', '/me/player', { device_ids: [S.deviceId], play: false });
  console.log('[transfer] transfert OK, attente 600ms…');
  await new Promise(r => setTimeout(r, 600));
  console.log(`[transfer] lancement de ${trackUris.length} URIs…`);
  await api('PUT', `/me/player/play?device_id=${S.deviceId}`, {
    uris: trackUris,
    offset: { position: 0 },
  });
  console.log('[transfer] lecture lancée');
}

function onPlayerStateChanged(state) {
  if (!state) return;

  const isPlaying = !state.paused;
  const playBtn = qs('#btn-play');
  if (playBtn) playBtn.textContent = isPlaying ? '⏸' : '▶';

  S.playerState = state;
  updateProgressBar(state.position, state.duration);

  const sdkTrack = state.track_window?.current_track;
  if (!sdkTrack) return;

  if (sdkTrack.uri !== S.currentTrackUri) {
    S.currentTrackUri = sdkTrack.uri;
    S.currentSDKTrack = sdkTrack;
    S.btRevealed = false;
    S.currentTheme = S.btTrackThemes?.[sdkTrack.uri] || null;

    const idx = S.btTracks.findIndex(t => t.uri === sdkTrack.uri);
    if (idx >= 0) S.btIndex = idx;

    refreshAlbumCover(sdkTrack);
    hideTrackInfo();
    resetHint();
    updateCounter();
    showRevealBtn();
  }
}

function refreshAlbumCover(track) {
  const img = track.album?.images?.[0]?.url;
  const el = qs('#album-cover');
  if (!el) return;
  if (img) el.style.backgroundImage = `url(${img})`;
  el.classList.add('blur');
}

function hideTrackInfo() {
  const el = qs('#track-info');
  if (el) el.classList.remove('show');
}

function updateCounter() {
  const el = qs('#album-counter');
  if (!el) return;
  el.classList.remove('hide');
  const total = S.btTracks.length || '?';
  el.textContent = S.btIndex >= 0 ? `${S.btIndex + 1} / ${total}` : '♫';
}

function showRevealBtn() {
  const btn = qs('#btn-reveal');
  if (btn) btn.classList.remove('done');
}

/* ── TIMELINE ── */
let progressInterval = null;

function startProgressUpdater() {
  clearInterval(progressInterval);
  progressInterval = setInterval(async () => {
    if (!S.player) return;
    const state = await S.player.getCurrentState();
    if (state) updateProgressBar(state.position, state.duration);
  }, 500);
}

function stopProgressUpdater() {
  clearInterval(progressInterval);
  progressInterval = null;
}

function updateProgressBar(position, duration) {
  const fill = $('timeline-fill');
  const cur  = $('time-cur');
  const dur  = $('time-dur');
  if (fill && duration > 0) fill.style.width = (position / duration * 100) + '%';
  if (cur) cur.textContent = fmtTime(position);
  if (dur) dur.textContent = fmtTime(duration);
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function seekClick(event) {
  if (!S.player || !S.playerState) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  S.player.seek(Math.floor(pct * S.playerState.duration));
}

async function seekBy(deltaMs) {
  if (!S.player) return;
  const state = await S.player.getCurrentState();
  if (!state) return;
  const pos = Math.max(0, Math.min(state.position + deltaMs, state.duration - 1000));
  await S.player.seek(pos);
}

function resetHint() {
  const btn = $('btn-hint');
  const txt = $('hint-text');
  if (btn) btn.style.display = '';
  if (txt) { txt.textContent = ''; txt.classList.add('hidden'); }
}

function revealHint() {
  const theme = S.currentTheme;
  if (!theme) return;
  const themeData = THEMES.find(t => t.id === theme.id);
  const btn = $('btn-hint');
  const txt = $('hint-text');
  if (btn) btn.style.display = 'none';
  if (txt) {
    txt.textContent = `${themeData?.emoji || '💡'} ${theme.label}`;
    txt.classList.remove('hidden');
  }
}

/* ── NAVIGATION ── */
const $ = id => document.getElementById(id);
const qs = s => document.querySelector(s);

function go(screen, data = {}) {
  const renders = { login, create, player };
  renders[screen]?.(data);
}

/* ── SCREENS ── */
function login() {
  $('app').innerHTML = `
    <div class="screen screen-login">
      <div class="login-card">
        <div class="login-icon">🎵</div>
        <h1>Blind Test</h1>
        <p>Connectez-vous avec Spotify pour créer et jouer vos blind tests</p>
        <a href="/login" class="btn btn-green btn-full">Se connecter avec Spotify</a>
      </div>
    </div>`;
}

function create() {
  // Lancer la connexion SDK dès l'affichage de l'écran pour éviter le délai au lancement
  ensurePlayerInit().catch(() => {});

  const themeCards = THEMES.map(t => `
    <label class="theme-card" id="tc-${t.id}">
      <input type="checkbox" value="${t.id}" onchange="onThemeChange()" />
      <span class="theme-emoji">${t.emoji}</span>
      <span class="theme-label">${t.label}</span>
    </label>`).join('');

  $('app').innerHTML = `
    <div class="screen">
      <header>
        <span style="width:60px"></span>
        <h1>🎵 Blind Test</h1>
        <button class="btn btn-ghost btn-sm" onclick="logout()">Déco.</button>
      </header>
      <div class="form">
        <div class="form-group">
          <label>Thèmes <span class="badge" id="theme-badge">0 sélectionnés</span></label>
          <div class="theme-grid">${themeCards}</div>
        </div>
        <div class="form-group">
          <label>Sons par thème</label>
          <div class="slider-row">
            <input type="range" min="2" max="10" value="5" id="per-theme"
              oninput="onThemeChange()" />
            <div class="slider-info">
              <span>2</span>
              <span id="slider-val">5 sons/thème</span>
              <span id="total-count" class="total-count">— 0 sons au total</span>
              <span>10</span>
            </div>
          </div>
        </div>
        <button id="submit-btn" class="btn btn-green btn-full" disabled onclick="doCreate()">
          ▶ Lancer le Blind Test
        </button>
        <div class="progress-box" id="progress-box">
          <div class="progress-label" id="progress-label">Démarrage…</div>
          <div class="progress-bar"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
        </div>
      </div>
    </div>`;
}

function onThemeChange() {
  const checked = [...document.querySelectorAll('.theme-grid input:checked')];
  const perTheme = parseInt($('per-theme')?.value || 5);

  checked.forEach(cb => cb.closest('.theme-card')?.classList.add('selected'));
  document.querySelectorAll('.theme-grid input:not(:checked)').forEach(cb =>
    cb.closest('.theme-card')?.classList.remove('selected'));

  if ($('theme-badge')) $('theme-badge').textContent = `${checked.length} sélectionné${checked.length > 1 ? 's' : ''}`;
  if ($('slider-val')) $('slider-val').textContent = `${perTheme} sons/thème`;
  if ($('total-count')) $('total-count').textContent = `— ${checked.length * perTheme} sons au total`;
  if ($('submit-btn')) $('submit-btn').disabled = checked.length === 0;
}

function setProgress(label, pct) {
  const box = $('progress-box');
  if (box) box.classList.add('show');
  if ($('progress-label')) $('progress-label').textContent = label;
  if ($('progress-fill')) $('progress-fill').style.width = pct + '%';
}

async function doCreate() {
  const themeIds = [...document.querySelectorAll('.theme-grid input:checked')].map(c => c.value);
  const perTheme = parseInt($('per-theme')?.value || 5);
  if (!themeIds.length) return;

  $('submit-btn').disabled = true;
  try {
    const tracks = await buildTracks(themeIds, perTheme, setProgress);
    if (!tracks.length) throw new Error('Aucun son trouvé pour ces thèmes.');
    setProgress('Lancement…', 95);
    const label = themeIds.map(id => THEMES.find(t => t.id === id)?.emoji || '').join(' ');
    await startBlindTest(tracks, label || 'Blind Test');
  } catch (e) {
    toast('Erreur : ' + e.message);
    if ($('submit-btn')) $('submit-btn').disabled = false;
  }
}

/* ── PLAYER ── */
function player({ name }) {
  $('app').innerHTML = `
    <div class="screen player-screen">
      <header>
        <button class="btn-back" onclick="exitPlayer()">← Quitter</button>
        <h1>${esc(name)}</h1>
        <span style="width:60px"></span>
      </header>
      <div class="player-loading" id="player-loading">
        <div class="player-loading-spinner"></div>
        Connexion au lecteur Spotify…
      </div>
      <div class="player-body" id="player-body">
        <div class="album-wrap">
          <div class="album-cover blur" id="album-cover"></div>
          <div class="album-counter" id="album-counter">♫</div>
        </div>
        <div class="track-info" id="track-info">
          <div class="track-artists" id="track-artists"></div>
          <div class="track-name" id="track-name"></div>
        </div>
        <div class="player-controls">
          <button class="ctrl-btn seek-btn" onclick="seekBy(-10000)">-10s</button>
          <button class="ctrl-btn" onclick="ctrlPrev()">⏮</button>
          <button class="ctrl-btn play" id="btn-play" onclick="ctrlToggle()">▶</button>
          <button class="ctrl-btn" onclick="ctrlNext()">⏭</button>
          <button class="ctrl-btn seek-btn" onclick="seekBy(10000)">+10s</button>
        </div>
        <div class="timeline-wrap">
          <span class="time-label" id="time-cur">0:00</span>
          <div class="timeline" id="timeline" onclick="seekClick(event)">
            <div class="timeline-fill" id="timeline-fill"></div>
          </div>
          <span class="time-label" id="time-dur">0:00</span>
        </div>
        <div class="hint-row">
          <button class="btn-hint" id="btn-hint" onclick="revealHint()">💡 Indice : thème</button>
          <div class="hint-text hidden" id="hint-text"></div>
        </div>
        <button class="btn-reveal" id="btn-reveal" onclick="reveal()">👁 Révéler</button>
      </div>
    </div>`;
}

async function startBlindTest(tracks, name) {
  console.log(`[start] lancement blind test — ${tracks.length} sons`);
  go('player', { name });

  const loadingEl = $('player-loading');
  try {
    if (loadingEl) loadingEl.innerHTML = '<div class="player-loading-spinner"></div>Connexion au lecteur Spotify…';
    console.log('[start] attente player init…');
    await ensurePlayerInit();
    console.log('[start] player prêt');

    S.btTracks = tracks;
    S.btIndex = 0;
    S.currentTrackUri = null;
    S.btTrackThemes = {};
    tracks.forEach(t => { if (t._themeId) S.btTrackThemes[t.uri] = { id: t._themeId, label: t._themeLabel }; });
    S.currentTheme = null;

    if (loadingEl) loadingEl.textContent = 'Lancement…';
    await transferAndPlay(tracks.map(t => t.uri));

    if (loadingEl) loadingEl.style.display = 'none';
    const body = $('player-body');
    if (body) body.classList.add('show');
    updateCounter();
    startProgressUpdater();
  } catch (e) {
    if (loadingEl) {
      loadingEl.innerHTML = `<div style="color:var(--danger)">${esc(e.message)}</div>
        <button class="btn btn-ghost" style="margin-top:16px" onclick="go('create')">← Retour</button>`;
    }
  }
}

function reveal() {
  if (S.btRevealed) return;
  S.btRevealed = true;

  const track = S.currentSDKTrack || S.btTracks[S.btIndex];
  if (!track) return;

  const cover = $('album-cover');
  if (cover) cover.classList.remove('blur');

  const counter = $('album-counter');
  if (counter) counter.classList.add('hide');

  const artists = (track.artists || []).map(a => a.name).join(', ');
  const name = track.name || '—';

  const artistEl = $('track-artists');
  const nameEl = $('track-name');
  if (artistEl) artistEl.textContent = artists;
  if (nameEl) nameEl.textContent = name;

  const info = $('track-info');
  if (info) info.classList.add('show');

  const btn = $('btn-reveal');
  if (btn) btn.classList.add('done');
}

async function ctrlToggle() {
  if (S.player) await S.player.togglePlay();
}

async function ctrlNext() {
  if (!S.player) return;
  S.btRevealed = false;
  const cover = $('album-cover');
  if (cover) cover.classList.add('blur');
  hideTrackInfo();
  resetHint();
  showRevealBtn();
  const counter = $('album-counter');
  if (counter) counter.classList.remove('hide');
  await S.player.nextTrack();
}

async function ctrlPrev() {
  if (!S.player) return;
  S.btRevealed = false;
  const cover = $('album-cover');
  if (cover) cover.classList.add('blur');
  hideTrackInfo();
  resetHint();
  showRevealBtn();
  const counter = $('album-counter');
  if (counter) counter.classList.remove('hide');
  await S.player.previousTrack();
}

function exitPlayer() {
  stopProgressUpdater();
  if (S.player) S.player.pause().catch(() => {});
  go('create');
}

/* ── UTILS ── */
function esc(str) {
  return String(str || '').replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])
  );
}

let toastTimer;
function toast(msg) {
  let el = $('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

function logout() {
  if (S.player) S.player.disconnect();
  localStorage.clear();
  location.reload();
}

/* ── INIT ── */
async function init() {
  loadTokens();

  const params = new URLSearchParams(location.search);
  if (params.get('access_token')) {
    saveTokens(params.get('access_token'), params.get('refresh_token'), parseInt(params.get('expires_in')));
    history.replaceState({}, '', '/');
  }
  if (params.get('error')) {
    alert('Erreur de connexion : ' + params.get('error'));
    history.replaceState({}, '', '/');
  }

  if (!S.token) { login(); return; }

  try {
    const user = await api('GET', '/me');
    S.userId = user.id;
    go('create');
  } catch {
    login();
  }
}

init();
