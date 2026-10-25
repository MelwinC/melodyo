import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addToReview, removeFromReview } from '../lib/games.js';
import { toast } from '../lib/toast.js';
import { savedTrack } from '../../test/fixtures.js';
import { useReview } from './useReview.js';

vi.mock('../lib/games.js', () => ({ addToReview: vi.fn(), removeFromReview: vi.fn() }));
vi.mock('../lib/toast.js', () => ({ toast: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe('useReview', () => {
  it('ajoute puis retire une chanson', async () => {
    const initial = new Set();
    const { result } = renderHook(() => useReview(initial));
    const t = savedTrack(1);
    await act(() => result.current.toggle({ ...t, fromReview: false }));
    expect(addToReview).toHaveBeenCalledWith(t);
    expect(result.current.has(t.uri)).toBe(true);
    expect(toast).toHaveBeenLastCalledWith('Ajoutée à la liste à revoir');
    await act(() => result.current.toggle(t));
    expect(removeFromReview).toHaveBeenCalledWith(t.uri);
    expect(result.current.has(t.uri)).toBe(false);
    expect(toast).toHaveBeenLastCalledWith('Retirée de la liste à revoir');
  });

  it('part de la liste connue et signale une erreur', async () => {
    const t = savedTrack(2);
    removeFromReview.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useReview(new Set([t.uri])));
    expect(result.current.has(t.uri)).toBe(true);
    await act(() => result.current.toggle(t));
    expect(result.current.has(t.uri)).toBe(true);
    expect(toast).toHaveBeenCalledWith('Une erreur est survenue');
  });

  it('se recale sur une liste chargée plus tard', () => {
    const { result } = renderHook(() => useReview(new Set()));
    act(() => result.current.replace(new Set(['spotify:track:x'])));
    expect(result.current.has('spotify:track:x')).toBe(true);
  });
});
