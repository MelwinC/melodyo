import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../test/db.js';
import { createPool, runMigrations } from './db.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());

describe('base de données', () => {
  it('se connecte', async () => {
    const { rows } = await pool.query('SELECT 1 AS ok');
    expect(rows).toEqual([{ ok: 1 }]);
  });

  it('applique les migrations de façon idempotente', async () => {
    await runMigrations(testDatabaseUrl());
    await runMigrations(testDatabaseUrl());
    const { rows } = await pool.query("SELECT to_regclass('public.pgmigrations') AS t");
    expect(rows[0].t).toBe('pgmigrations');
  });
});
