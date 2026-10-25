import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './passwords.js';

describe('mots de passe', () => {
  it('produit un hash scrypt salé', async () => {
    const a = await hashPassword('motdepasse');
    const b = await hashPassword('motdepasse');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
  });

  it('accepte le bon mot de passe et refuse les autres', async () => {
    const stored = await hashPassword('motdepasse');
    expect(await verifyPassword('motdepasse', stored)).toBe(true);
    expect(await verifyPassword('MotDePasse', stored)).toBe(false);
  });

  it('refuse un format inconnu', async () => {
    expect(await verifyPassword('x', 'bcrypt$x')).toBe(false);
  });
});
