import express from 'express';
import helmet from 'helmet';
import { createLimiters } from './rate-limits.js';
import { accountsRouter } from './routes/accounts.js';
import { avatarsRouter } from './routes/avatars.js';
import { gamesRouter } from './routes/games.js';
import { roomsRouter } from './routes/rooms.js';
import { loadSession } from './session-middleware.js';
import { healthRouter } from './routes/health.js';
import { spotifyAuthRouter } from './routes/spotify-auth.js';
import { spotifyProxyRouter } from './routes/spotify-proxy.js';

// hub : diffusion temps réel des rooms (fourni par le serveur WebSocket)
const noHub = { participantsChanged: () => {} };

export function createApp({ config, pool, limits, hub = noHub }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(securityHeaders(config.prod));
  app.use(healthRouter(pool));
  // Le proxy relaie jusqu'à 500 URIs au lancement d'une partie
  app.use('/spotify', express.json({ limit: '100kb' }));
  // Une partie enregistrée peut compter 500 chansons ; le reste de l'API n'attend que de petits corps
  app.use('/api/games', express.json({ limit: '300kb' }));
  app.use('/api', express.json({ limit: '10kb' }));
  app.use(loadSession(pool));
  const limiters = createLimiters(limits, { clientIpHeader: config.clientIpHeader });
  app.use(accountsRouter({ pool, config, limiters }));
  app.use(avatarsRouter({ pool, config }));
  app.use(gamesRouter({ pool }));
  app.use(roomsRouter({ pool, config, limiters, hub }));
  app.use(spotifyAuthRouter({ pool, config }));
  app.use(spotifyProxyRouter({ pool, config }));

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
