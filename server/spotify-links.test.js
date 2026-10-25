import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../test/db.js';
import { insertUser } from '../test/factories.js';
import { createPool } from './db.js';
import { deleteLink, getLink, saveLink } from './spotify-links.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());
const key = 'c'.repeat(64);
const now = new Date('2026-10-25T10:00:00Z');

describe('liaisons Spotify', () => {
  it('enregistre les tokens chiffrés et les relit en clair', async () => {
    const user = await insertUser(pool);
    const saved = await saveLink(pool, key, user.id, { spotifyUserId: 'sp', accessToken: 'acc', refreshToken: 'ref', expiresIn: 3600, now });
    expect(saved).toEqual({ accessToken: 'acc', expiresAt: new Date('2026-10-25T10:59:00Z') });
    expect(await getLink(pool, key, user.id)).toEqual({ spotifyUserId: 'sp', accessToken: 'acc', refreshToken: 'ref', expiresAt: new Date('2026-10-25T10:59:00Z') });
    const { rows } = await pool.query('SELECT access_token, refresh_token FROM spotify_links WHERE user_id = $1', [user.id]);
    expect(rows[0].access_token).not.toContain('acc');
    expect(rows[0].refresh_token).not.toContain('ref');
  });

  it('remplace une liaison existante', async () => {
    const user = await insertUser(pool);
    await saveLink(pool, key, user.id, { spotifyUserId: 'sp', accessToken: 'a1', refreshToken: 'r1', expiresIn: 3600, now });
    await saveLink(pool, key, user.id, { spotifyUserId: 'sp2', accessToken: 'a2', refreshToken: 'r2', expiresIn: 3600, now });
    expect(await getLink(pool, key, user.id)).toMatchObject({ spotifyUserId: 'sp2', accessToken: 'a2', refreshToken: 'r2' });
  });

  it('supprime une liaison', async () => {
    const user = await insertUser(pool);
    await saveLink(pool, key, user.id, { spotifyUserId: 'sp', accessToken: 'a', refreshToken: 'r', expiresIn: 3600 });
    await deleteLink(pool, user.id);
    expect(await getLink(pool, key, user.id)).toBeNull();
  });
});
