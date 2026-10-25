import path from 'node:path';

const DEV_DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5433/melodyo';
const DEV_TOKEN_KEY = '0'.repeat(64);
const ROOT = path.resolve(import.meta.dirname, '..');

function tokenKey(env, prod) {
  if (!prod) return env.TOKEN_ENCRYPTION_KEY || DEV_TOKEN_KEY;
  if (!env.TOKEN_ENCRYPTION_KEY) throw new Error('TOKEN_ENCRYPTION_KEY manquant');
  if (!/^[0-9a-f]{64}$/i.test(env.TOKEN_ENCRYPTION_KEY)) throw new Error('TOKEN_ENCRYPTION_KEY invalide');
  return env.TOKEN_ENCRYPTION_KEY;
}

export function loadConfig(env = process.env, argv = process.argv) {
  const prod = argv.includes('--prod');
  const port = Number(env.PORT) || 8888;
  const key = tokenKey(env, prod);
  if (prod && !env.DATABASE_URL) throw new Error('DATABASE_URL manquant');

  return {
    prod,
    host: env.HOST || '127.0.0.1',
    port,
    spotifyClientId: env.SPOTIFY_CLIENT_ID || 'ad428e7422b645b6876c4c6e07ff3ed2',
    redirectUri: env.REDIRECT_URI || `http://127.0.0.1:${port}/callback`,
    databaseUrl: env.DATABASE_URL || DEV_DATABASE_URL,
    avatarDir: env.AVATAR_DIR || path.join(ROOT, '.data', 'avatars'),
    tokenKey: key,
    trustProxy: Number(env.TRUST_PROXY) || 0,
    spotifyTimeoutMs: 10_000,
  };
}
