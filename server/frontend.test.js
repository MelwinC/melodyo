import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { attachFrontend } from './frontend.js';

vi.mock('vite', () => ({ createServer: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe('attachFrontend en production', () => {
  function distWith(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'melodyo-dist-'));
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), content);
    }
    return dir;
  }

  it('sert les fichiers construits et renvoie index.html pour les autres routes', async () => {
    const distDir = distWith({ 'index.html': '<p>melodyo</p>', 'assets/a.js': 'console.log(1)' });
    const app = express();
    await attachFrontend(app, http.createServer(app), { prod: true }, { distDir });

    const asset = await request(app).get('/assets/a.js');
    expect(asset.status).toBe(200);
    expect(asset.text).toBe('console.log(1)');

    const page = await request(app).get('/nimporte/ou');
    expect(page.status).toBe(200);
    expect(page.text).toBe('<p>melodyo</p>');
  });
});

describe('attachFrontend en développement', () => {
  it('branche Vite en middleware avec le HMR sur le serveur http', async () => {
    const middlewares = (req, res) => res.end('vite');
    createServer.mockResolvedValue({ middlewares });
    const app = express();
    const server = http.createServer(app);

    await attachFrontend(app, server, { prod: false }, { clientDir: '/tmp/client' });

    expect(createServer).toHaveBeenCalledWith({
      root: '/tmp/client',
      configFile: path.join('/tmp/client', 'vite.config.mjs'),
      server: { middlewareMode: true, hmr: { server } },
      appType: 'spa',
    });
    expect((await request(app).get('/')).text).toBe('vite');
  });

  it('utilise le dossier client du projet par défaut', async () => {
    createServer.mockResolvedValue({ middlewares: (req, res) => res.end() });
    await attachFrontend(express(), http.createServer(), { prod: false });
    expect(createServer.mock.calls[0][0].root).toBe(path.resolve(import.meta.dirname, '..', 'client'));
  });
});
