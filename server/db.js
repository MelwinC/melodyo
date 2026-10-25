import path from 'node:path';
import pg from 'pg';
import { runner } from 'node-pg-migrate';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '..', 'migrations');

export const createPool = databaseUrl => new pg.Pool({ connectionString: databaseUrl });

export async function runMigrations(databaseUrl) {
  await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    // Deux démarrages simultanés (tests, redémarrage du conteneur) : le second attend le verrou
    advisoryLockMode: 'wait',
    log: () => {},
  });
}
