import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./spotify.js', () => ({ api: vi.fn() }));
vi.mock('./themes.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, findTheme: id => testThemes[id] };
});

const { api } = await import('./spotify.js');
const { buildTracks, loadThemePool } = await import('./tracks.js');

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
