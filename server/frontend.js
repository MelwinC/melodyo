import express from 'express';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// Prod : fichiers construits par Vite. Dev : Vite en middleware sur le même port (hot reload)
export async function attachFrontend(app, httpServer, config, {
  distDir = path.join(ROOT, 'dist'),
  clientDir = path.join(ROOT, 'client'),
} = {}) {
  if (config.prod) {
    app.use(express.static(distDir));
    app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')));
    return;
  }

  const { createServer } = await import('vite');
  const vite = await createServer({
    root: clientDir,
    configFile: path.join(clientDir, 'vite.config.mjs'),
    server: { middlewareMode: true, hmr: { server: httpServer } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}
