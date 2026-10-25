import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const headersFor = async argv => {
  const env = { DATABASE_URL: 'postgres://x' };
  const res = await request(createApp({ config: loadConfig(env, argv), pool: null })).get('/login');
  return res.headers;
};

const directives = csp => Object.fromEntries(csp.split(';').map(d => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

describe('en-têtes de sécurité', () => {
  it('protègent toutes les réponses', async () => {
    const h = await headersFor(['--prod']);
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('no-referrer');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-powered-by']).toBeUndefined();
  });

  it('limitent les sources en production au SDK et aux pochettes Spotify', async () => {
    const csp = directives((await headersFor(['--prod']))['content-security-policy']);
    expect(csp['script-src']).toEqual(["'self'", 'https://sdk.scdn.co']);
    expect(csp['frame-src']).toEqual(['https://sdk.scdn.co']);
    expect(csp['img-src']).toEqual(["'self'", 'data:', 'https://i.scdn.co']);
    expect(csp['connect-src']).toEqual(["'self'"]);
    expect(csp).toHaveProperty('upgrade-insecure-requests');
  });

  it('autorisent le hot reload de Vite en développement', async () => {
    const csp = directives((await headersFor([]))['content-security-policy']);
    expect(csp['script-src']).toContain("'unsafe-inline'");
    expect(csp['connect-src']).toEqual(["'self'", 'ws:']);
    expect(csp).not.toHaveProperty('upgrade-insecure-requests');
  });
});
