import { afterEach, describe, expect, it, vi } from 'vitest';
import { testDatabaseUrl } from '../test/db.js';
import { attachFrontend } from './frontend.js';
import { start } from './index.js';

vi.mock('./frontend.js', () => ({ attachFrontend: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

describe('start', () => {
  it('démarre le serveur sur la base et répond à /healthz', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { server, close } = await start({ env: { PORT: '0', DATABASE_URL: testDatabaseUrl() }, argv: [] });
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      expect(await res.json()).toEqual({ ok: true });
      expect(attachFrontend).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Melodyo'));
    } finally {
      await close();
    }
    expect(server.listening).toBe(false);
  });

  it('annonce le mode production', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { close } = await start({ env: { PORT: '0', DATABASE_URL: testDatabaseUrl() }, argv: ['--prod'] });
    await close();
    expect(log.mock.calls[0][0]).toMatch(/Melodyo — http/);
    expect(log.mock.calls[0][0]).not.toMatch(/dev/);
  });

  it('refuse de démarrer si la base est injoignable', async () => {
    attachFrontend.mockClear();
    const env = { PORT: '0', DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:1/x' };
    await expect(start({ env, argv: [] })).rejects.toThrow(/Base de données injoignable/);
    expect(attachFrontend).not.toHaveBeenCalled();
  });

  it('utilise l\'environnement du processus par défaut', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://postgres:postgres@127.0.0.1:1/x');
    await expect(start()).rejects.toThrow(/Base de données injoignable/);
    vi.unstubAllEnvs();
  });
});
