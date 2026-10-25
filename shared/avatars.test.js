import { describe, expect, it } from 'vitest';
import { AVATAR_PRESETS, isPreset } from './avatars.js';

describe('avatars proposés', () => {
  it('propose 12 avatars distincts', () => {
    expect(AVATAR_PRESETS).toHaveLength(12);
    expect(new Set(AVATAR_PRESETS.map(a => a.id)).size).toBe(12);
    expect(AVATAR_PRESETS[0]).toEqual({ id: 'note', emoji: '🎵', color: '#1db954' });
  });

  it('reconnaît un avatar proposé', () => {
    expect(isPreset('guitare')).toBe(true);
    expect(isPreset('x')).toBe(false);
  });
});
