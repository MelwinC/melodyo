import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fmtClock, useCountdown } from './useCountdown.js';

beforeEach(() => vi.useFakeTimers({ now: 10_000 }));
afterEach(() => vi.useRealTimers());

describe('useCountdown', () => {
  it('décompte localement depuis la réception de l\'état', () => {
    const round = { status: 'open', remainingMs: 5000, paused: false };
    const { result } = renderHook(() => useCountdown(round, 10_000));
    expect(result.current).toBe(5000);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toBe(3000);
    act(() => vi.advanceTimersByTime(9000));
    expect(result.current).toBe(0);
  });

  it('reste figé en pause, une fois fermé ou sans manche', () => {
    const { result, rerender } = renderHook(({ round }) => useCountdown(round, 10_000), {
      initialProps: { round: { status: 'open', remainingMs: 5000, paused: true } },
    });
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toBe(5000);
    rerender({ round: { status: 'closed', remainingMs: 0, paused: false } });
    expect(result.current).toBe(0);
    rerender({ round: null });
    expect(result.current).toBe(0);
  });

  it('formate le temps en m:ss arrondi à la seconde supérieure', () => {
    expect(fmtClock(90000)).toBe('1:30');
    expect(fmtClock(1)).toBe('0:01');
    expect(fmtClock(0)).toBe('0:00');
  });
});
