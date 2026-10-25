import express from 'express';
import { z } from 'zod';
import { isThemeId } from '../../shared/themes.js';
import { asyncRoute } from '../async-route.js';
import { createGame, endGame, getGame, lastGameExclusions, listGames, markPlayed } from '../games.js';
import { addReview, listReview, removeReview } from '../review.js';
import { requireUser } from '../session-middleware.js';

const uri = z.string().regex(/^spotify:track:[A-Za-z0-9]{1,80}$/);
const themeId = z.string().refine(isThemeId);
const trackSchema = z.object({
  uri,
  name: z.string().min(1).max(300),
  artists: z.array(z.string().max(200)).min(1).max(20),
  albumImage: z.string().max(500).regex(/^https:\/\//).nullable(),
  themeId,
});
const gameSchema = z.object({
  settings: z.object({
    themes: z.array(themeId).min(1).max(10),
    perTheme: z.number().int().min(1).max(50),
    timer: z.enum(['30s', 'full']),
    start: z.enum(['start', 'middle']),
  }),
  tracks: z.array(trackSchema.extend({ fromReview: z.boolean() })).min(1).max(500),
});
const playedSchema = z.object({ position: z.number().int().min(0) });
const gameId = z.uuid();

const notFound = res => res.status(404).json({ error: 'not_found' });

export function gamesRouter({ pool }) {
  const router = express.Router();
  router.use(['/api/games', '/api/review'], requireUser);

  router.post('/api/games', asyncRoute(async (req, res) => {
    const parsed = gameSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_game' });
    res.status(201).json(await createGame(pool, req.user.id, parsed.data));
  }));

  router.get('/api/games', asyncRoute(async (req, res) => {
    res.json({ games: await listGames(pool, req.user.id) });
  }));

  router.get('/api/games/exclusions', asyncRoute(async (req, res) => {
    res.json({ uris: await lastGameExclusions(pool, req.user.id) });
  }));

  router.get('/api/games/:id', asyncRoute(async (req, res) => {
    if (!gameId.safeParse(req.params.id).success) return notFound(res);
    const game = await getGame(pool, req.user.id, req.params.id);
    if (!game) return notFound(res);
    res.json({ game });
  }));

  router.post('/api/games/:id/played', asyncRoute(async (req, res) => {
    const parsed = playedSchema.safeParse(req.body);
    if (!parsed.success || !gameId.safeParse(req.params.id).success) return notFound(res);
    if (!await markPlayed(pool, req.user.id, req.params.id, parsed.data.position)) return notFound(res);
    res.sendStatus(204);
  }));

  router.post('/api/games/:id/end', asyncRoute(async (req, res) => {
    if (!gameId.safeParse(req.params.id).success) return notFound(res);
    const status = await endGame(pool, req.user.id, req.params.id);
    if (!status) return notFound(res);
    res.json({ status });
  }));

  router.get('/api/review', asyncRoute(async (req, res) => {
    res.json({ tracks: await listReview(pool, req.user.id) });
  }));

  router.post('/api/review', asyncRoute(async (req, res) => {
    const parsed = trackSchema.safeParse(req.body.track);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_track' });
    await addReview(pool, req.user.id, parsed.data);
    res.sendStatus(204);
  }));

  router.delete('/api/review', asyncRoute(async (req, res) => {
    const parsed = uri.safeParse(req.body.uri);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_track' });
    await removeReview(pool, req.user.id, parsed.data);
    res.sendStatus(204);
  }));

  return router;
}
