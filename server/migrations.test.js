import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../test/db.js';
import { insertUser, uniqueName } from '../test/factories.js';
import { createPool } from './db.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());

describe('schéma des comptes', () => {
  it('crée les tables des comptes, sessions et liaisons Spotify', async () => {
    const { rows } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name IN ('users', 'sessions', 'spotify_links') ORDER BY 1",
    );
    expect(rows.map(r => r.table_name)).toEqual(['sessions', 'spotify_links', 'users']);
  });

  it('impose un pseudo unique sans tenir compte de la casse', async () => {
    const name = uniqueName('Ab');
    await insertUser(pool, { username: name });
    await expect(insertUser(pool, { username: name.toLowerCase() })).rejects.toMatchObject({ code: '23505' });
  });

  it('donne un avatar par défaut', async () => {
    const { id } = await insertUser(pool);
    const { rows } = await pool.query('SELECT avatar_kind, avatar_value FROM users WHERE id = $1', [id]);
    expect(rows[0]).toEqual({ avatar_kind: 'preset', avatar_value: 'note' });
  });
});
