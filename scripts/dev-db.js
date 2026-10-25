import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';

// Base PostgreSQL locale pour `npm run dev`, persistée dans .data/postgres (port 5433)
const databaseDir = path.resolve(import.meta.dirname, '..', '.data', 'postgres');
const fresh = !fs.existsSync(path.join(databaseDir, 'PG_VERSION'));

const pg = new EmbeddedPostgres({
  databaseDir, port: 5433, user: 'postgres', password: 'postgres', persistent: true, onLog: () => {},
});

if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('melodyo');
console.log('PostgreSQL prêt sur 127.0.0.1:5433 (base melodyo) — Ctrl+C pour arrêter');

const stop = async () => { await pg.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
