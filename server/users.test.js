import { afterAll, describe, expect, it, vi } from 'vitest';
import { testDatabaseUrl } from '../test/db.js';
import { uniqueName } from '../test/factories.js';
import { createPool } from './db.js';
import { createUser, findUserById, findUserByUsername, setAvatar, UsernameTakenError } from './users.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());

describe('comptes', () => {
  it('crée un compte et le retrouve sans tenir compte de la casse', async () => {
    const username = uniqueName('Mel');
    const user = await createUser(pool, { username, passwordHash: 'h' });
    expect(user).toEqual({ id: expect.any(String), username, avatar: { kind: 'preset', value: 'note' }, spotifyLinked: false });
    const row = await findUserByUsername(pool, username.toUpperCase());
    expect(row).toMatchObject({ id: user.id, username, password_hash: 'h' });
    expect(await findUserById(pool, user.id)).toEqual(user);
  });

  it('renvoie null pour un compte inconnu', async () => {
    expect(await findUserByUsername(pool, uniqueName())).toBeNull();
    expect(await findUserById(pool, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('refuse un pseudo déjà pris, même lors de deux inscriptions simultanées', async () => {
    const username = uniqueName('Dup');
    const results = await Promise.allSettled([
      createUser(pool, { username, passwordHash: 'h' }),
      createUser(pool, { username: username.toLowerCase(), passwordHash: 'h' }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected').reason).toBeInstanceOf(UsernameTakenError);
  });

  it('relaie les autres erreurs SQL', async () => {
    const broken = { query: vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: '08006' })) };
    await expect(createUser(broken, { username: 'x', passwordHash: 'h' })).rejects.toThrow('boom');
  });

  it('indique si Spotify est relié', async () => {
    const user = await createUser(pool, { username: uniqueName(), passwordHash: 'h' });
    await pool.query("INSERT INTO spotify_links VALUES ($1, 's', 'a', 'r', now())", [user.id]);
    expect((await findUserById(pool, user.id)).spotifyLinked).toBe(true);
  });

  it('change l\'avatar et renvoie le précédent', async () => {
    const user = await createUser(pool, { username: uniqueName(), passwordHash: 'h' });
    const { previous } = await setAvatar(pool, user.id, { kind: 'upload', value: 'a.webp' });
    expect(previous).toEqual({ kind: 'preset', value: 'note' });
    expect((await findUserById(pool, user.id)).avatar).toEqual({ kind: 'upload', value: 'a.webp' });
  });
});
