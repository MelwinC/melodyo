import { describe, expect, it } from 'vitest';
import { MAX_PER_THEME, MIN_PER_THEME, sliderBounds } from './themes.js';

describe('sliderBounds', () => {
  it('plafonne à 50 sans thème sélectionné', () => {
    expect(sliderBounds([], {})).toMatchObject({ min: MIN_PER_THEME, max: MAX_PER_THEME, limitedBy: null, pending: false });
  });

  it('garde 50 quand tous les thèmes ont assez de sons', () => {
    expect(sliderBounds(['80s', 'pop'], { '80s': 120, pop: 80 })).toMatchObject({ max: 50, limitedBy: null });
  });

  it('réduit le max au thème qui a le moins de sons', () => {
    const b = sliderBounds(['80s', 'disney', 'pop'], { '80s': 120, disney: 23, pop: 31 });
    expect(b.max).toBe(23);
    expect(b.limitedBy.id).toBe('disney');
  });

  it('signale un calcul en cours', () => {
    expect(sliderBounds(['80s', 'pop'], { '80s': 120, pop: 'loading' }).pending).toBe(true);
  });

  it('abaisse le min quand un thème a moins de 2 sons', () => {
    expect(sliderBounds(['disney'], { disney: 1 })).toMatchObject({ min: 1, max: 1 });
  });
});
