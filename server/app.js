import express from 'express';
import { authRouter } from './routes/auth.js';
import { spotifyProxyRouter } from './routes/spotify-proxy.js';

export function createApp({ config }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));
  app.use(authRouter(config));
  app.use(spotifyProxyRouter());

  // Erreurs du parseur JSON (corps invalide 400, trop gros 413) : réponse JSON plutôt qu'une page HTML
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(err.status).json({ error: err.type }));

  return app;
}
