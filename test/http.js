import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { uniqueName } from './factories.js';

// Limites larges par défaut : les tests créent beaucoup de comptes depuis la même IP
const generous = { windowMs: 60_000, limit: 10_000 };
export const TEST_LIMITS = { loginPerIp: generous, loginPerUser: generous, registerPerIp: generous, joinPerIp: generous };

export function createTestApp(pool, { limits = TEST_LIMITS, hub, ...configOverrides } = {}) {
  return createApp({ config: { ...loadConfig({}, []), ...configOverrides }, pool, limits, hub });
}

export async function signUp(agent, username = uniqueName(), password = 'motdepasse') {
  const res = await agent.post('/api/auth/register').send({ username, password });
  return res.body.user;
}

export async function linkSpotify(pool, userId, { expiresIn = 3600, now = new Date(), accessToken = 'acc', refreshToken = 'ref' } = {}) {
  const { saveLink } = await import('../server/spotify-links.js');
  return saveLink(pool, loadConfig({}, []).tokenKey, userId, { spotifyUserId: 'spotify-user', accessToken, refreshToken, expiresIn, now });
}
