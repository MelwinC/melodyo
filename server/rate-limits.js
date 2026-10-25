import { rateLimit } from 'express-rate-limit';

export const DEFAULT_LIMITS = {
  loginPerIp: { windowMs: 15 * 60_000, limit: 20 },
  loginPerUser: { windowMs: 15 * 60_000, limit: 10 },
  registerPerIp: { windowMs: 60 * 60_000, limit: 10 },
};

const tooMany = (req, res) => res.status(429).json({ error: 'too_many_requests' });

export function createLimiters(limits = DEFAULT_LIMITS) {
  const base = { standardHeaders: 'draft-8', legacyHeaders: false, handler: tooMany };
  return {
    // Seuls les échecs comptent pour la connexion : un joueur qui se reconnecte souvent n'est pas bloqué
    loginPerIp: rateLimit({ ...base, ...limits.loginPerIp, skipSuccessfulRequests: true }),
    loginPerUser: rateLimit({
      ...base, ...limits.loginPerUser, skipSuccessfulRequests: true,
      keyGenerator: req => `user:${String(req.body?.username).toLowerCase()}`,
    }),
    registerPerIp: rateLimit({ ...base, ...limits.registerPerIp }),
  };
}
