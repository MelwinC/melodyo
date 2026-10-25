import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from './crypto.js';

const key = 'a'.repeat(64);

describe('chiffrement des tokens', () => {
  it('chiffre et déchiffre', () => {
    const payload = encrypt('secret', key);
    expect(payload).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
    expect(payload).not.toContain('secret');
    expect(decrypt(payload, key)).toBe('secret');
  });

  it('produit un résultat différent à chaque fois', () => {
    expect(encrypt('secret', key)).not.toBe(encrypt('secret', key));
  });

  it('refuse des données altérées', () => {
    const [iv, tag, data] = encrypt('secret', key).split('.');
    const altered = Buffer.from(data, 'base64');
    altered[0] ^= 1;
    expect(() => decrypt([iv, tag, altered.toString('base64')].join('.'), key)).toThrow();
  });

  it('refuse une mauvaise clé', () => {
    expect(() => decrypt(encrypt('secret', key), 'b'.repeat(64))).toThrow();
  });
});
