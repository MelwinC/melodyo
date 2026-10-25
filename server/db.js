import path from 'node:path';
import pg from 'pg';
import { runner } from 'node-pg-migrate';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '..', 'migrations');

// Délai de connexion : un hôte injoignable fait échouer vite au lieu de bloquer /healthz ou le démarrage
const CONNECTION_TIMEOUT_MS = 5000;

export function createPool(databaseUrl, { connectionTimeoutMillis = CONNECTION_TIMEOUT_MS } = {}) {
  const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis });
  // Une connexion inactive coupée par PostgreSQL (redémarrage, coupure réseau) émet 'error' :
  // sans écouteur, le processus entier s'arrête
  pool.on('error', err => console.error('[db]', err.message));
  return pool;
}

export async function runMigrations(databaseUrl, { connectionTimeoutMillis = CONNECTION_TIMEOUT_MS } = {}) {
  await runner({
    databaseUrl: { connectionString: databaseUrl, connectionTimeoutMillis },
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    // Deux démarrages simultanés (tests, redémarrage du conteneur) : le second attend le verrou
    advisoryLockMode: 'wait',
    log: () => {},
  });
}
