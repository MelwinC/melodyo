import express from 'express';
import helmet from 'helmet';
import { createLimiters } from './rate-limits.js';
import { accountsRouter } from './routes/accounts.js';
import { avatarsRouter } from './routes/avatars.js';
import { authRouter } from './routes/auth.js';
import { loadSession } from './session-middleware.js';
import { healthRouter } from './routes/health.js';
import { spotifyProxyRouter } from './routes/spotify-proxy.js';

export function createApp({ config, pool, limits }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(securityHeaders(config.prod));
  app.use(healthRouter(pool));
  // /refresh n'attend qu'un token ; le proxy relaie jusqu'à 500 URIs au lancement d'une partie
  app.use('/refresh', express.json({ limit: '10kb' }));
  app.use('/spotify', express.json({ limit: '100kb' }));
  app.use('/api', express.json({ limit: '10kb' }));
  app.use(loadSession(pool));
  app.use(accountsRouter({ pool, config, limiters: createLimiters(limits) }));
  app.use(avatarsRouter({ pool, config }));
  app.use(authRouter(config));
  app.use(spotifyProxyRouter());

  // Toujours du JSON : erreurs du parseur (400, 413) avec leur type, sinon 500 journalisée
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.status) return res.status(err.status).json({ error: err.type ?? 'bad_request' });
    console.error('[server]', err);
    res.status(500).json({ error: 'server_error' });
  });

  return app;
}

// CSP stricte en prod (SDK Spotify et pochettes uniquement) ; en dev, Vite injecte des scripts inline et le HMR passe par WebSocket
function securityHeaders(prod) {
  return helmet({
    frameguard: { action: 'deny' },
    contentSecurityPolicy: {
      directives: {
        scriptSrc: prod ? ["'self'", 'https://sdk.scdn.co'] : ["'self'", "'unsafe-inline'", 'https://sdk.scdn.co'],
        frameSrc: ['https://sdk.scdn.co'],
        imgSrc: ["'self'", 'data:', 'https://i.scdn.co'],
        connectSrc: prod ? ["'self'"] : ["'self'", 'ws:'],
        upgradeInsecureRequests: prod ? [] : null,
      },
    },
  });
}
