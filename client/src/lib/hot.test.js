import { describe, expect, it, vi } from 'vitest';
import { reloadOnHotUpdate } from './hot.js';

describe('reloadOnHotUpdate', () => {
  it('ne fait rien hors hot reload', () => {
    expect(() => reloadOnHotUpdate(undefined)).not.toThrow();
  });

  it('recharge la page quand le module est mis à jour', () => {
    const hot = { accept: vi.fn() };
    const reload = vi.fn();
    reloadOnHotUpdate(hot, reload);
    expect(hot.accept).toHaveBeenCalledOnce();
    hot.accept.mock.calls[0][0]();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('recharge via location.reload par défaut', () => {
    const hot = { accept: vi.fn() };
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    reloadOnHotUpdate(hot);
    hot.accept.mock.calls[0][0]();
    expect(reload).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
