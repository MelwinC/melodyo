import { describe, expect, it } from 'vitest';
import { isThemeId, THEMES } from './themes.js';

describe('thèmes partagés', () => {
  it('liste les 10 thèmes', () => {
    expect(THEMES.map(t => t.id)).toEqual(['80s', '90s', '2000s', '2010s', '2020s', 'disney', 'french', 'pop', 'poprock', 'popchill']);
  });

  it('reconnaît un thème', () => {
    expect(isThemeId('disney')).toBe(true);
    expect(isThemeId('jazz')).toBe(false);
  });
});
