import { parseCookie } from 'cookie';
import { asyncRoute } from './async-route.js';
import { findSessionUserId, SESSION_COOKIE } from './sessions.js';
import { findUserById } from './users.js';

export const sessionToken = req => parseCookie(req.headers.cookie ?? '')[SESSION_COOKIE];

export function loadSession(pool) {
  return asyncRoute(async (req, res, next) => {
    const token = sessionToken(req);
    if (token) {
      const userId = await findSessionUserId(pool, token);
      req.sessionToken = token;
      req.user = userId && await findUserById(pool, userId);
    }
    next();
  });
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_logged_in' });
  next();
}
