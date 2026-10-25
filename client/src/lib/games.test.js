import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from './http.js';
import * as games from './games.js';

vi.mock('./http.js', () => ({ request: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe('API des parties', () => {
  it('récupère les exclusions sous forme d\'ensemble', async () => {
    request.mockResolvedValue({ uris: ['a', 'b'] });
    expect(await games.fetchExclusions()).toEqual(new Set(['a', 'b']));
    expect(request).toHaveBeenCalledWith('GET', '/api/games/exclusions');
  });

  it.each([
    ['fetchReview', [], 'GET', '/api/review', undefined, { tracks: [1] }, [1]],
    ['createGame', [{ s: 1 }, [2]], 'POST', '/api/games', { settings: { s: 1 }, tracks: [2] }, { id: 'g' }, 'g'],
    ['listGames', [], 'GET', '/api/games', undefined, { games: [3] }, [3]],
    ['getGame', ['g'], 'GET', '/api/games/g', undefined, { game: 4 }, 4],
    ['markPlayed', ['g', 2], 'POST', '/api/games/g/played', { position: 2 }, null, null],
    ['endGame', ['g'], 'POST', '/api/games/g/end', undefined, { status: 'finished' }, { status: 'finished' }],
    ['addToReview', [{ uri: 'u' }], 'POST', '/api/review', { track: { uri: 'u' } }, null, null],
    ['removeFromReview', ['u'], 'DELETE', '/api/review', { uri: 'u' }, null, null],
  ])('%s', async (fn, args, method, path, body, response, expected) => {
    request.mockResolvedValue(response);
    expect(await games[fn](...args)).toEqual(expected);
    expect(request).toHaveBeenCalledWith(...[method, path, body].filter(x => x !== undefined));
  });
});
