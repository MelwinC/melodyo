import { api } from './spotify.js';
import { findTheme } from './themes.js';
import { toast } from './toast.js';
import { reloadOnHotUpdate } from './hot.js';

const PAGE_SIZE = 50;
const MAX_ITEMS_PER_PLAYLIST = 1000;

function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/\s*[-–(]\s*(remaster(ed)?(\s+\d{4})?|radio edit|single version|original mix|extended mix|live|acoustic|mono|stereo|\d{4} remaster)\s*[)\s]*/gi, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isPlayable(t) {
  // Les titres non lisibles dans le pays du compte (ou locaux / podcasts) sont sautés par le SDK
  return t?.id && t.uri && t.type === 'track' && !t.is_local && t.is_playable !== false;
}

async function fetchPlaylistTracks(playlistId) {
  const page = offset => api('GET', `/playlists/${playlistId}/items?limit=${PAGE_SIZE}&offset=${offset}&market=from_token`);
  const first = await page(0);
  const total = Math.min(first.total || 0, MAX_ITEMS_PER_PLAYLIST);

  const offsets = [];
  for (let o = PAGE_SIZE; o < total; o += PAGE_SIZE) offsets.push(o);

  // Par lots de 5 pour ne pas déclencher le rate limit Spotify
  const pages = [first];
  for (let i = 0; i < offsets.length; i += 5) {
    pages.push(...await Promise.all(offsets.slice(i, i + 5).map(o =>
      page(o).catch(e => { console.warn(`[fetch] ${playlistId} offset=${o} échoué :`, e.message); return { items: [] }; })
    )));
  }

  const items = pages.flatMap(r => (r.items || []).map(i => i.item));
  const playable = items.filter(isPlayable);
  console.log(`[fetch] ${playlistId} — ${playable.length}/${items.length} sons lisibles`);
  return playable;
}

// Sons disponibles par thème (lisibles, sans doublon d'URI ni de titre), mis en cache
const themePools = {};
const loadedPools = {};

export const getThemePools = () => ({ ...loadedPools });

export function loadThemePool(theme) {
  if (!themePools[theme.id]) {
    themePools[theme.id] = (async () => {
      const results = await Promise.all(theme.playlists.map(id =>
        fetchPlaylistTracks(id).catch(e => { console.warn(`[fetch] playlist ${id} échouée :`, e.message); return []; })
      ));
      const seenUris = new Set();
      const seenTitles = new Set();
      const pool = results.flat().filter(t => {
        const key = normalizeTitle(t.name);
        if (!key || seenUris.has(t.uri) || seenTitles.has(key)) return false;
        seenUris.add(t.uri);
        seenTitles.add(key);
        return true;
      }).map(t => ({ ...t, _themeId: theme.id, _themeLabel: theme.label }));
      if (!pool.length) throw new Error(`Playlist vide ou inaccessible pour : ${theme.label}`);
      console.log(`[fetch] ${theme.label} — ${pool.length} sons disponibles`);
      loadedPools[theme.id] = pool;
      return pool;
    })().catch(e => { delete themePools[theme.id]; throw e; });
  }
  return themePools[theme.id];
}

// Mélange en privilégiant les sons populaires (≥50, puis ≥30, puis le reste)
function popularFirst(pool) {
  const tier = t => (t.popularity || 0) >= 50 ? 0 : (t.popularity || 0) >= 30 ? 1 : 2;
  return shuffle(pool).sort((a, b) => tier(a) - tier(b));
}

// Format enregistré en base pour l'historique et la liste « à revoir »
export function toTrackInput(t) {
  return {
    uri: t.uri,
    // Bornes du serveur : un titre ou une compilation hors norme ne doit pas bloquer la partie
    name: t.name.slice(0, 300),
    artists: t.artists.slice(0, 20).map(a => a.name.slice(0, 200)),
    albumImage: t.album?.images?.[0]?.url ?? null,
    themeId: t._themeId,
    fromReview: Boolean(t._fromReview),
  };
}

// Plus grand nombre de sons qu'un thème peut fournir, avec les mêmes règles que buildTracks :
// les sons neufs du pool, plus les sons « à revoir » plafonnés à la moitié du quota
export function availableCount(themeId, pool, excluded, review) {
  const inPool = new Set(pool.map(t => t.uri));
  const toReview = new Set(review.filter(r => r.themeId === themeId).map(r => r.uri));
  let fresh = pool.filter(t => !excluded.has(t.uri) && !toReview.has(t.uri)).length;
  let reviewOnly = 0;
  for (const uri of toReview) {
    // Un son « à revoir » encore jouable depuis le pool compte comme neuf ; sinon seule la liste peut l'apporter
    if (inPool.has(uri) && !excluded.has(uri)) fresh++;
    else reviewOnly++;
  }
  let n = fresh + reviewOnly;
  while (n > fresh + Math.min(reviewOnly, Math.ceil(n / 2))) n--;
  return n;
}

// Son « à revoir » remis au format du lecteur (il peut ne plus être dans la playlist)
const reviewToTrack = (r, theme) => ({
  uri: r.uri,
  name: r.name,
  artists: r.artists.map(name => ({ name })),
  album: { images: r.albumImage ? [{ url: r.albumImage }] : [] },
  _themeId: theme.id,
  _themeLabel: theme.label,
  _fromReview: true,
});

export async function buildTracks(themeIds, perTheme, onProgress, { excluded = new Set(), review = [] } = {}) {
  console.log(`[build] thèmes : ${themeIds.join(', ')} — ${perTheme} sons/thème`);
  const all = [];
  const usedTitles = new Set();
  for (let i = 0; i < themeIds.length; i++) {
    const theme = findTheme(themeIds[i]);
    if (!theme) { console.warn(`[build] thème inconnu : ${themeIds[i]}`); continue; }
    onProgress(`${theme.emoji} Chargement : ${theme.label}…`, Math.round((i / themeIds.length) * 80));
    try {
      const pool = await loadThemePool(theme);
      // Sons « à revoir » d'abord (au plus la moitié du quota), puis des sons neufs
      // Priorité aux sons que seule la liste peut apporter (exclus ou sortis de la playlist)
      const inPool = new Set(pool.map(t => t.uri));
      const themeReview = review.filter(r => r.themeId === theme.id);
      const onlyByReview = r => excluded.has(r.uri) || !inPool.has(r.uri);
      const reviewPicks = [...shuffle(themeReview.filter(onlyByReview)), ...shuffle(themeReview.filter(r => !onlyByReview(r)))]
        .slice(0, Math.ceil(perTheme / 2))
        .map(r => reviewToTrack(r, theme));
      const picked = new Set(reviewPicks.map(t => t.uri));
      const fresh = popularFirst(pool.filter(t => !excluded.has(t.uri) && !picked.has(t.uri)));

      // Un même titre peut apparaître dans deux thèmes : on le garde pour le premier
      const kept = [];
      for (const t of [...reviewPicks, ...fresh]) {
        if (kept.length >= perTheme) break;
        const key = normalizeTitle(t.name);
        if (usedTitles.has(key)) continue;
        usedTitles.add(key);
        kept.push(t);
      }
      if (kept.length < perTheme) console.warn(`[build] ${theme.label} — seulement ${kept.length}/${perTheme} sons`);
      console.log(`[build] ${theme.label} → ${kept.length} sons`);
      all.push(...kept);
    } catch (e) {
      console.warn(`[build] thème ignoré (${theme.label}) :`, e.message);
      toast(`⚠️ ${theme.label} : ${e.message}`);
    }
  }
  console.log(`[build] total : ${all.length} sons`);
  return shuffle(all);
}

reloadOnHotUpdate(import.meta.hot);
