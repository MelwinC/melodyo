const DEV_DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5433/melodyo';

export function loadConfig(env = process.env, argv = process.argv) {
  const prod = argv.includes('--prod');
  const port = Number(env.PORT) || 8888;
  if (prod && !env.DATABASE_URL) throw new Error('DATABASE_URL manquant');

  return {
    prod,
    host: env.HOST || '127.0.0.1',
    port,
    spotifyClientId: env.SPOTIFY_CLIENT_ID || 'ad428e7422b645b6876c4c6e07ff3ed2',
    redirectUri: env.REDIRECT_URI || `http://127.0.0.1:${port}/callback`,
    databaseUrl: env.DATABASE_URL || DEV_DATABASE_URL,
  };
}
