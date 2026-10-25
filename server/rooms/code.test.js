import { describe, expect, it } from 'vitest';
import { generateRoomCode, normalizeRoomCode, ROOM_CODE_ALPHABET } from './code.js';

describe('codes de room', () => {
  it('génère 6 caractères sans caractères ambigus', () => {
    expect(ROOM_CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789');
    for (let i = 0; i < 50; i++) expect(generateRoomCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
  });

  it('utilise le générateur fourni', () => {
    expect(generateRoomCode(() => 0)).toBe('AAAAAA');
  });

  it.each([
    [' ab c2d3 ', 'ABC2D3'],
    ['abc', null],
    ['ABC0D3', null],
    ['ABCDEFG', null],
    [undefined, null],
  ])('normalise %j en %j', (input, expected) => {
    expect(normalizeRoomCode(input)).toBe(expected);
  });
});
