import express from 'express';
import { z } from 'zod';
import { asyncRoute } from '../async-route.js';
import { hashPassword, verifyPassword } from '../passwords.js';
import { requireUser } from '../session-middleware.js';
import { createSession, deleteSession, SESSION_COOKIE, SESSION_DAYS } from '../sessions.js';
import { getStats } from '../stats.js';
import { createUser, findUserById, findUserByUsername, UsernameTakenError } from '../users.js';

const credentials = z.object({
  username: z.string().regex(/^[A-Za-z0-9_.-]{3,20}$/),
  password: z.string().min(8).max(200),
});

// Hash factice : un pseudo inconnu prend autant de temps qu'un mauvais mot de passe
let dummyHash;
const dummy = async () => (dummyHash ??= await hashPassword('mot-de-passe-factice'));

export function accountsRouter({ pool, config, limiters }) {
  const router = express.Router();
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: config.prod, path: '/' };

  async function openSession(res, userId) {
    const token = await createSession(pool, userId);
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_DAYS * 24 * 3600 * 1000 });
  }

  router.post('/api/auth/register', limiters.registerPerIp, asyncRoute(async (req, res) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      const field = parsed.error.issues[0].path[0];
      return res.status(400).json({ error: field === 'password' ? 'invalid_password' : 'invalid_username' });
    }
    try {
      const user = await createUser(pool, { username: parsed.data.username, passwordHash: await hashPassword(parsed.data.password) });
      await openSession(res, user.id);
      res.status(201).json({ user });
    } catch (err) {
      if (!(err instanceof UsernameTakenError)) throw err;
      res.status(409).json({ error: 'username_taken' });
    }
  }));

  router.post('/api/auth/login', limiters.loginPerIp, limiters.loginPerUser, asyncRoute(async (req, res) => {
    const parsed = credentials.safeParse(req.body);
    const row = parsed.success ? await findUserByUsername(pool, parsed.data.username) : null;
    const ok = await verifyPassword(parsed.success ? parsed.data.password : '', row?.password_hash ?? await dummy());
    if (!row || !ok) return res.status(401).json({ error: 'invalid_credentials' });
    await openSession(res, row.id);
    res.json({ user: await findUserById(pool, row.id) });
  }));

  router.post('/api/auth/logout', asyncRoute(async (req, res) => {
    if (req.sessionToken) await deleteSession(pool, req.sessionToken);
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.sendStatus(204);
  }));

  router.get('/api/me', requireUser, (req, res) => res.json({ user: req.user }));

  router.get('/api/me/stats', requireUser, asyncRoute(async (req, res) => {
    res.json({ stats: await getStats(pool, req.user.id) });
  }));

  return router;
}
