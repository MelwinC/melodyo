import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

// Processus séparé : embedded-postgres installe un hook de sortie qui écraserait le code de sortie de Vitest
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const port = await freePort();
const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'melodyo-pg-'));
const pg = new EmbeddedPostgres({
  databaseDir, port, user: 'postgres', password: 'postgres', persistent: false, onLog: () => {},
  // Chaque fichier de test ouvre son propre pool, en parallèle : la limite par défaut (100) sature
  postgresFlags: ['-c', 'max_connections=300'],
});
await pg.initialise();
await pg.start();
await pg.createDatabase('melodyo_test');
process.stdout.write(`${JSON.stringify({ url: `postgres://postgres:postgres@127.0.0.1:${port}/melodyo_test` })}\n`);

// Le parent ferme stdin pour demander l'arrêt
process.stdin.resume();
process.stdin.on('end', async () => {
  await pg.stop();
  fs.rmSync(databaseDir, { recursive: true, force: true });
  process.exit(0);
});
