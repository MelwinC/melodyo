import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./spotify.js', () => ({ api: vi.fn() }));
vi.mock('./themes.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, findTheme: id => testThemes[id] };
});

const { api } = await import('./spotify.js');
const { buildTracks, getThemePools, loadThemePool } = await import('./tracks.js');
const { getToast } = await import('./toast.js');

const testThemes = {};
let themeSeq = 0;

// Chaque test utilise un thème neuf : le cache des playlists est global au module
function makeTheme(playlists) {
  const id = `t${++themeSeq}`;
  testThemes[id] = { id, label: `Thème ${id}`, emoji: '🎵', playlists: Object.keys(playlists) };
  return testThemes[id];
}

function track(name, extra = {}) {
  const id = extra.id || name.toLowerCase().replace(/\W/g, '');
  return { id, uri: `spotify:track:${id}`, name, type: 'track', is_playable: true, popularity: 60, ...extra };
}

// Simule l'API paginée /playlists/{id}/items à partir d'une liste de sons par playlist
function mockPlaylists(playlists) {
  api.mockImplementation(async (method, path) => {
    const [, id] = path.match(/\/playlists\/([^/]+)\/items/);
    const offset = Number(new URL(path, 'http://x').searchParams.get('offset'));
    const limit = Number(new URL(path, 'http://x').searchParams.get('limit'));
    const all = playlists[id];
    return { total: all.length, items: all.slice(offset, offset + limit).map(item => ({ item })) };
  });
}

beforeEach(() => { api.mockReset(); });

describe('loadThemePool', () => {
  it('exclut les sons non lisibles, locaux et les podcasts', async () => {
    const playlists = {
      p1: [
        track('Ok'),
        track('Bloqué', { is_playable: false }),
        track('Local', { is_local: true }),
        track('Podcast', { type: 'episode' }),
        null,
      ],
    };
    mockPlaylists(playlists);
    const pool = await loadThemePool(makeTheme(playlists));
    expect(pool.map(t => t.name)).toEqual(['Ok']);
  });

  it('dédoublonne par URI et par titre normalisé entre playlists', async () => {
    const playlists = {
      p1: [track('Take On Me'), track('Africa')],
      p2: [track('Take On Me - 2017 Remaster', { id: 'tom2' }), track('Africa')],
    };
    mockPlaylists(playlists);
    const pool = await loadThemePool(makeTheme(playlists));
    expect(pool).toHaveLength(2);
  });

  it('lit toutes les pages de la playlist', async () => {
    const playlists = { p1: Array.from({ length: 130 }, (_, i) => track(`Son ${i}`)) };
    mockPlaylists(playlists);
    const pool = await loadThemePool(makeTheme(playlists));
    expect(pool).toHaveLength(130);
    expect(api).toHaveBeenCalledTimes(3);
  });

  it('échoue si aucun son n\'est lisible', async () => {
    const playlists = { p1: [track('Bloqué', { is_playable: false })] };
    mockPlaylists(playlists);
    await expect(loadThemePool(makeTheme(playlists))).rejects.toThrow(/vide ou inaccessible/);
  });
});

describe('buildTracks', () => {
  it('prend le nombre demandé par thème, en privilégiant les sons populaires', async () => {
    const playlists = {
      p1: [
        ...Array.from({ length: 5 }, (_, i) => track(`Tube ${i}`, { popularity: 80 })),
        ...Array.from({ length: 20 }, (_, i) => track(`Inconnu ${i}`, { popularity: 5 })),
      ],
    };
    mockPlaylists(playlists);
    const theme = makeTheme(playlists);
    const tracks = await buildTracks([theme.id], 5, () => {});
    expect(tracks).toHaveLength(5);
    expect(tracks.every(t => t.name.startsWith('Tube'))).toBe(true);
    expect(tracks.every(t => t._themeId === theme.id)).toBe(true);
  });

  it('ne joue pas deux fois un titre présent dans deux thèmes', async () => {
    const playlists = { p1: [track('Commun'), track('A1')], p2: [track('Commun', { id: 'c2' }), track('B1')] };
    mockPlaylists(playlists);
    const a = makeTheme({ p1: 1 });
    const b = makeTheme({ p2: 1 });
    const tracks = await buildTracks([a.id, b.id], 2, () => {});
    expect(tracks.filter(t => t.name === 'Commun')).toHaveLength(1);
  });
});

describe('loadThemePool — cas limites', () => {
  it('continue si une page de la playlist échoue', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const all = Array.from({ length: 120 }, (_, i) => track(`Son ${i}`));
    api.mockImplementation(async (method, path) => {
      const offset = Number(new URL(path, 'http://x').searchParams.get('offset'));
      if (offset === 50) throw new Error('500');
      return { total: all.length, items: all.slice(offset, offset + 50).map(item => ({ item })) };
    });
    const pool = await loadThemePool(makeTheme({ p1: 1 }));
    expect(pool).toHaveLength(70);
    expect(console.warn).toHaveBeenCalled();
  });

  it('traite une réponse sans total ni items comme une playlist vide', async () => {
    api.mockResolvedValue({});
    await expect(loadThemePool(makeTheme({ p1: 1 }))).rejects.toThrow(/vide ou inaccessible/);
  });

  it('ignore une playlist inaccessible si une autre répond', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockPlaylists({ p2: [track('Ok')] });
    const fallback = api.getMockImplementation();
    api.mockImplementation(async (method, path) => {
      if (path.includes('/p1/')) throw new Error('403');
      return fallback(method, path);
    });
    const pool = await loadThemePool(makeTheme({ p1: 1, p2: 1 }));
    expect(pool.map(t => t.name)).toEqual(['Ok']);
  });

  it('écarte les titres vides une fois normalisés', async () => {
    const playlists = { p1: [track('!!!', { id: 'x' }), track('', { id: 'y', name: undefined }), track('Vrai titre')] };
    mockPlaylists(playlists);
    const pool = await loadThemePool(makeTheme(playlists));
    expect(pool.map(t => t.name)).toEqual(['Vrai titre']);
  });

  it('expose le nombre de sons disponibles par thème', async () => {
    const playlists = { p1: [track('A'), track('B')] };
    mockPlaylists(playlists);
    const theme = makeTheme(playlists);
    await loadThemePool(theme);
    expect(getThemePools()[theme.id]).toHaveLength(2);
  });

  it('réutilise le cache pour un thème déjà chargé', async () => {
    const playlists = { p1: [track('A')] };
    mockPlaylists(playlists);
    const theme = makeTheme(playlists);
    const first = await loadThemePool(theme);
    expect(await loadThemePool(theme)).toBe(first);
    expect(api).toHaveBeenCalledOnce();
  });
});

describe('buildTracks — cas limites', () => {
  it('classe les sons moyennement populaires avant les inconnus', async () => {
    const playlists = { p1: [track('Inconnu', { popularity: undefined }), track('Moyen', { popularity: 35 })] };
    mockPlaylists(playlists);
    const theme = makeTheme(playlists);
    const tracks = await buildTracks([theme.id], 1, () => {});
    expect(tracks.map(t => t.name)).toEqual(['Moyen']);
  });

  it('ignore un thème inconnu et signale un thème en échec', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    api.mockResolvedValue({ total: 0, items: [] });
    const theme = makeTheme({ p1: 1 });
    const onProgress = vi.fn();
    const tracks = await buildTracks(['inexistant', theme.id], 3, onProgress);
    expect(tracks).toEqual([]);
    expect(getToast().msg).toMatch(new RegExp(`${theme.label}.*vide ou inaccessible`));
    expect(onProgress).toHaveBeenCalledWith(`🎵 Chargement : ${theme.label}…`, 40);
  });
});

describe('chansons enregistrées', () => {
  it('convertit un son Spotify pour l\'enregistrer', async () => {
    const { toTrackInput } = await import('./tracks.js');
    const t = { uri: 'spotify:track:x', name: 'Titre', artists: [{ name: 'A' }, { name: 'B' }], album: { images: [{ url: 'https://i.scdn.co/1' }] }, _themeId: '80s' };
    expect(toTrackInput(t)).toEqual({ uri: 'spotify:track:x', name: 'Titre', artists: ['A', 'B'], albumImage: 'https://i.scdn.co/1', themeId: '80s', fromReview: false });
    expect(toTrackInput({ ...t, album: { images: [] }, _fromReview: true })).toMatchObject({ albumImage: null, fromReview: true });
    expect(toTrackInput({ ...t, album: undefined }).albumImage).toBeNull();
  });
});

describe('availableCount', () => {
  it('retire les exclus mais garde les sons à revoir', async () => {
    const { availableCount } = await import('./tracks.js');
    const pool = [track('A'), track('B'), track('C')];
    const excluded = new Set([pool[0].uri, pool[1].uri]);
    const review = [
      { uri: pool[1].uri, themeId: 'x' },
      { uri: 'spotify:track:ailleurs', themeId: 'x' },
      { uri: 'spotify:track:autre-theme', themeId: 'y' },
    ];
    expect(availableCount('x', pool, excluded, review)).toBe(3);
    expect(availableCount('x', pool, new Set(), [])).toBe(3);
  });
});

describe('buildTracks — exclusion et chansons à revoir', () => {
  const reviewItem = (name, themeId, over = {}) => ({
    uri: `spotify:track:${name}`, name, artists: ['R'], albumImage: 'https://i.scdn.co/r', themeId, ...over,
  });

  it('évite les sons de la partie précédente', async () => {
    const playlists = { p1: [track('Vu'), track('Neuf 1'), track('Neuf 2')] };
    mockPlaylists(playlists);
    const theme = makeTheme(playlists);
    const tracks = await buildTracks([theme.id], 3, () => {}, { excluded: new Set([track('Vu').uri]) });
    expect(tracks.map(t => t.name).sort()).toEqual(['Neuf 1', 'Neuf 2']);
  });

  it('place au plus la moitié du quota en sons à revoir, même exclus, jamais pour un thème non choisi', async () => {
    const playlists = { p1: Array.from({ length: 10 }, (_, i) => track(`Son ${i}`)) };
    mockPlaylists(playlists);
    const theme = makeTheme(playlists);
    const review = [
      reviewItem('Son 0', theme.id, { uri: track('Son 0').uri }),
      reviewItem('Rev A', theme.id), reviewItem('Rev B', theme.id), reviewItem('Rev C', theme.id),
      reviewItem('Autre', 'theme-non-choisi'),
    ];
    const tracks = await buildTracks([theme.id], 5, () => {}, { excluded: new Set([track('Son 0').uri]), review });
    const fromReview = tracks.filter(t => t._fromReview);
    expect(tracks).toHaveLength(5);
    expect(fromReview).toHaveLength(3);
    expect(tracks.some(t => t.name === 'Autre')).toBe(false);
    const rebuilt = fromReview.find(t => t.name.startsWith('Rev'));
    expect(rebuilt).toMatchObject({ artists: [{ name: 'R' }], album: { images: [{ url: 'https://i.scdn.co/r' }] }, _themeId: theme.id });
  });

  it('reprend une chanson à revoir sans pochette', async () => {
    const playlists = { p1: [track('A')] };
    mockPlaylists(playlists);
    const theme = makeTheme(playlists);
    const tracks = await buildTracks([theme.id], 2, () => {}, { review: [reviewItem('Seule', theme.id, { albumImage: null })] });
    expect(tracks.find(t => t.name === 'Seule').album.images).toEqual([]);
  });
});

describe('availableCount correspond à ce que buildTracks peut fournir', () => {
  const reviewOf = (t, themeId) => ({ uri: t.uri, name: t.name, artists: ['R'], albumImage: null, themeId });

  it.each([
    ['tout exclu, 6 sons à revoir hors playlist', 10, 10, 6, 0],
    ['8 exclus dont les 4 sons à revoir', 10, 8, 0, 4],
    ['rien d\'exclu', 12, 0, 0, 0],
    ['un peu de tout', 20, 15, 3, 2],
    ['sons à revoir encore jouables dans la playlist', 6, 0, 1, 2],
  ])('%s', async (_, poolSize, excludedCount, outsideReview, insideReview) => {
    const { availableCount } = await import('./tracks.js');
    const pool = Array.from({ length: poolSize }, (_, i) => track(`P${i}`));
    mockPlaylists({ p1: pool });
    const theme = makeTheme({ p1: 1 });
    const excluded = new Set(pool.slice(0, excludedCount).map(t => t.uri));
    const review = [
      ...Array.from({ length: outsideReview }, (_, i) => reviewOf(track(`Hors ${i}`), theme.id)),
      ...pool.slice(0, insideReview).map(t => reviewOf(t, theme.id)),
    ];
    const max = availableCount(theme.id, pool, excluded, review);
    const built = await buildTracks([theme.id], max, () => {}, { excluded, review });
    expect(built).toHaveLength(max);
    const more = await buildTracks([theme.id], max + 1, () => {}, { excluded, review });
    expect(more.length).toBeLessThan(max + 1);
  });
});

describe('chansons enregistrées — bornes', () => {
  it('tronque les titres et listes d\'artistes trop longs', async () => {
    const { toTrackInput } = await import('./tracks.js');
    const t = { uri: 'spotify:track:x', name: 'n'.repeat(400), artists: Array.from({ length: 30 }, () => ({ name: 'a'.repeat(300) })), album: { images: [] }, _themeId: '80s' };
    const input = toTrackInput(t);
    expect(input.name).toHaveLength(300);
    expect(input.artists).toHaveLength(20);
    expect(input.artists[0]).toHaveLength(200);
  });
});
