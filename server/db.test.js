import { afterAll, describe, expect, it, vi } from 'vitest';
import { testDatabaseUrl } from '../test/db.js';
import { silentServer } from '../test/silent-server.js';
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

describe('pool face à une coupure de la base', () => {
  it('survit à la fermeture de ses connexions par PostgreSQL', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const victim = createPool(testDatabaseUrl());
    await victim.query('SELECT 1');
    await pool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()");
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith('[db]', expect.any(String)));
    const { rows } = await victim.query('SELECT 1 AS ok');
    expect(rows).toEqual([{ ok: 1 }]);
    await victim.end();
    error.mockRestore();
  });
});

describe('délais de connexion', () => {
  it('abandonne une base qui ne répond pas', async () => {
    const silent = await silentServer();
    const stuck = createPool(silent.url, { connectionTimeoutMillis: 100 });
    await expect(stuck.query('SELECT 1')).rejects.toThrow(/timeout/i);
    await stuck.end();
    await silent.close();
  });

  it('abandonne les migrations si la base ne répond pas', async () => {
    const silent = await silentServer();
    await expect(runMigrations(silent.url, { connectionTimeoutMillis: 100 })).rejects.toThrow(/timeout/i);
    await silent.close();
  });
});
