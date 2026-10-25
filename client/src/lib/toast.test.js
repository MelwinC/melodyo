import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getToast, subscribeToast, toast } from './toast.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('toast', () => {
  it('affiche le message et prévient les abonnés', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToast(listener);
    toast('Bonjour');
    expect(getToast()).toEqual({ msg: 'Bonjour', visible: true });
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('se masque après 3 secondes', () => {
    toast('x');
    vi.advanceTimersByTime(2999);
    expect(getToast().visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(getToast()).toEqual({ msg: 'x', visible: false });
  });

  it('relance le minuteur à chaque nouveau message', () => {
    toast('a');
    vi.advanceTimersByTime(2000);
    toast('b');
    vi.advanceTimersByTime(2000);
    expect(getToast()).toEqual({ msg: 'b', visible: true });
  });

  it('n\'avertit plus un abonné désinscrit', () => {
    const listener = vi.fn();
    subscribeToast(listener)();
    toast('x');
    expect(listener).not.toHaveBeenCalled();
  });
});
