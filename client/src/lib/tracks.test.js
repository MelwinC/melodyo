import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./spotify.js', () => ({ api: vi.fn() }));
vi.mock('./themes.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, findTheme: id => testThemes[id] };
});

const { api } = await import('./spotify.js');
const { buildTracks, getThemeCounts, loadThemePool } = await import('./tracks.js');
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
    expect(getThemeCounts()[theme.id]).toBe(2);
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
