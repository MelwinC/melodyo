import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../test/db.js';
import { insertUser } from '../test/factories.js';
import { createPool } from './db.js';
import { createSession, deleteSession, findSessionUserId, SESSION_COOKIE, SESSION_DAYS } from './sessions.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());

describe('sessions', () => {
  it('expose le nom du cookie et la durée', () => {
    expect(SESSION_COOKIE).toBe('melodyo_sid');
    expect(SESSION_DAYS).toBe(30);
  });

  it('crée une session et retrouve son compte', async () => {
    const user = await insertUser(pool);
    const token = await createSession(pool, user.id);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await findSessionUserId(pool, token)).toBe(user.id);
  });

  it('ne stocke que le hash du token', async () => {
    const user = await insertUser(pool);
    const token = await createSession(pool, user.id);
    const { rows } = await pool.query('SELECT token_hash FROM sessions WHERE user_id = $1', [user.id]);
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('expire après 30 jours', async () => {
    const user = await insertUser(pool);
    const now = new Date('2026-01-01T00:00:00Z');
    const token = await createSession(pool, user.id, { now });
    expect(await findSessionUserId(pool, token, { now: new Date('2026-01-30T23:00:00Z') })).toBe(user.id);
    expect(await findSessionUserId(pool, token, { now: new Date('2026-01-31T00:00:01Z') })).toBeNull();
  });

  it('supprime une session', async () => {
    const user = await insertUser(pool);
    const token = await createSession(pool, user.id);
    await deleteSession(pool, token);
    expect(await findSessionUserId(pool, token)).toBeNull();
  });

  it('ignore un token inconnu', async () => {
    expect(await findSessionUserId(pool, 'inconnu')).toBeNull();
  });
});
