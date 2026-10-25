import { describe, expect, it } from 'vitest';
import { isPaused, openClock, pauseClock, remainingMs, resumeClock } from './clock.js';

describe('horloge de manche', () => {
  it('décompte depuis l\'ouverture sans passer sous zéro', () => {
    const c = openClock(1000, 90000);
    expect(remainingMs(c, 1000)).toBe(90000);
    expect(remainingMs(c, 31000)).toBe(60000);
    expect(remainingMs(c, 200000)).toBe(0);
    expect(isPaused(c)).toBe(false);
  });

  it('se fige pendant la pause et reprend ensuite', () => {
    const paused = pauseClock(openClock(0, 90000), 10000);
    expect(isPaused(paused)).toBe(true);
    expect(remainingMs(paused, 50000)).toBe(80000);
    expect(pauseClock(paused, 60000)).toBe(paused);
    const resumed = resumeClock(paused, 60000);
    expect(isPaused(resumed)).toBe(false);
    expect(remainingMs(resumed, 70000)).toBe(70000);
    expect(resumeClock(resumed, 80000)).toBe(resumed);
  });
});
