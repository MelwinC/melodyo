import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

// Un vrai PostgreSQL éphémère pour les tests serveur, sans Docker (Mac, Linux, Windows, CI)
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

export default async function setup(project) {
  const port = await freePort();
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'melodyo-pg-'));
  const pg = new EmbeddedPostgres({
    databaseDir, port, user: 'postgres', password: 'postgres', persistent: false, onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('melodyo_test');
  project.provide('databaseUrl', `postgres://postgres:postgres@127.0.0.1:${port}/melodyo_test`);

  return async () => {
    await pg.stop();
    fs.rmSync(databaseDir, { recursive: true, force: true });
  };
}
