import http from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool, runMigrations } from './db.js';
import { attachFrontend } from './frontend.js';
import { createHub } from './rooms/hub.js';
import { attachWebSocket } from './ws.js';

export async function start({ env = process.env, argv = process.argv, pingMs, limits } = {}) {
  const config = loadConfig(env, argv);

  try {
    await runMigrations(config.databaseUrl);
  } catch (err) {
    throw new Error(`Base de données injoignable : ${err.message}`, { cause: err });
  }

  const pool = createPool(config.databaseUrl);
  const hub = createHub({ pool });
  const app = createApp({ config, pool, hub, limits });
  const server = http.createServer(app);
  const realtime = attachWebSocket(server, { pool, hub, pingMs });
  await attachFrontend(app, server, config);

  await new Promise(resolve => server.listen(config.port, config.host, resolve));
  const { port } = server.address();
  console.log(`\n  Melodyo${config.prod ? '' : ' (dev, hot reload)'} — http://${config.host}:${port}\n`);

  async function close() {
    realtime.close();
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }

  return { server, pool, close };
}
