import express from 'express';
import helmet from 'helmet';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { spotifyProxyRouter } from './routes/spotify-proxy.js';

export function createApp({ config, pool }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders(config.prod));
  app.use(express.json({ limit: '10kb' }));
  app.use(healthRouter(pool));
  app.use(authRouter(config));
  app.use(spotifyProxyRouter());

  // Erreurs du parseur JSON (corps invalide 400, trop gros 413) : réponse JSON plutôt qu'une page HTML
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(err.status).json({ error: err.type }));

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
