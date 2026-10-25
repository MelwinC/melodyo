import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('a des valeurs par défaut pour le dev', () => {
    expect(loadConfig({}, [])).toEqual({
      prod: false,
      host: '127.0.0.1',
      port: 8888,
      spotifyClientId: 'ad428e7422b645b6876c4c6e07ff3ed2',
      redirectUri: 'http://127.0.0.1:8888/callback',
      databaseUrl: 'postgres://postgres:postgres@127.0.0.1:5433/melodyo',
      avatarDir: path.resolve(import.meta.dirname, '..', '.data', 'avatars'),
      tokenKey: '0'.repeat(64),
      trustProxy: 0,
      spotifyTimeoutMs: 10_000,
      clientIpHeader: null,
    });
  });

  it('lit chaque variable d\'environnement', () => {
    const env = {
      PORT: '9000', HOST: '0.0.0.0', SPOTIFY_CLIENT_ID: 'cid',
      REDIRECT_URI: 'https://x/callback', DATABASE_URL: 'postgres://db/x',
      AVATAR_DIR: '/data/avatars', TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32), TRUST_PROXY: '2', CLIENT_IP_HEADER: 'cf-connecting-ip',
    };
    expect(loadConfig(env, ['--prod'])).toEqual({
      prod: true, host: '0.0.0.0', port: 9000, spotifyClientId: 'cid',
      redirectUri: 'https://x/callback', databaseUrl: 'postgres://db/x',
      avatarDir: '/data/avatars', tokenKey: 'ab'.repeat(32), trustProxy: 2, spotifyTimeoutMs: 10_000, clientIpHeader: 'cf-connecting-ip',
    });
  });

  it('construit l\'URL de callback avec le port choisi', () => {
    expect(loadConfig({ PORT: '9000' }, []).redirectUri).toBe('http://127.0.0.1:9000/callback');
  });

  it('retombe sur 8888 si PORT n\'est pas numérique', () => {
    expect(loadConfig({ PORT: 'abc' }, []).port).toBe(8888);
  });

  it('exige DATABASE_URL en production', () => {
    expect(() => loadConfig({ TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32) }, ['--prod'])).toThrow(/DATABASE_URL manquant/);
  });

  it('exige une clé de chiffrement valide en production', () => {
    const env = { DATABASE_URL: 'postgres://db/x' };
    expect(() => loadConfig(env, ['--prod'])).toThrow(/TOKEN_ENCRYPTION_KEY manquant/);
    expect(() => loadConfig({ ...env, TOKEN_ENCRYPTION_KEY: 'zz' }, ['--prod'])).toThrow(/TOKEN_ENCRYPTION_KEY invalide/);
  });
});
