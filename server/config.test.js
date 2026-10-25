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
    });
  });

  it('lit chaque variable d\'environnement', () => {
    const env = {
      PORT: '9000', HOST: '0.0.0.0', SPOTIFY_CLIENT_ID: 'cid',
      REDIRECT_URI: 'https://x/callback', DATABASE_URL: 'postgres://db/x',
    };
    expect(loadConfig(env, ['--prod'])).toEqual({
      prod: true, host: '0.0.0.0', port: 9000, spotifyClientId: 'cid',
      redirectUri: 'https://x/callback', databaseUrl: 'postgres://db/x',
    });
  });

  it('construit l\'URL de callback avec le port choisi', () => {
    expect(loadConfig({ PORT: '9000' }, []).redirectUri).toBe('http://127.0.0.1:9000/callback');
  });

  it('retombe sur 8888 si PORT n\'est pas numérique', () => {
    expect(loadConfig({ PORT: 'abc' }, []).port).toBe(8888);
  });

  it('exige DATABASE_URL en production', () => {
    expect(() => loadConfig({}, ['--prod'])).toThrow(/DATABASE_URL manquant/);
  });
});
