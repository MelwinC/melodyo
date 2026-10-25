import { describe, expect, it, vi } from 'vitest';
import { request } from './http.js';
import { fetchStats } from './stats.js';

vi.mock('./http.js', () => ({ request: vi.fn() }));

describe('fetchStats', () => {
  it('récupère les statistiques du compte', async () => {
    request.mockResolvedValue({ stats: { games: 3 } });
    expect(await fetchStats()).toEqual({ games: 3 });
    expect(request).toHaveBeenCalledWith('GET', '/api/me/stats');
  });
});
