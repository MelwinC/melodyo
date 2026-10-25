import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../test/db.js';
import { insertUser } from '../test/factories.js';
import { track } from '../test/games.js';
import { createPool } from './db.js';
import { addReview, listReview, removeReview } from './review.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());

const { fromReview, ...reviewTrack } = track(1);

describe('liste à revoir', () => {
  it('ajoute sans doublon, liste et retire', async () => {
    const host = await insertUser(pool);
    await addReview(pool, host.id, reviewTrack);
    await addReview(pool, host.id, reviewTrack);
    await addReview(pool, host.id, { ...reviewTrack, uri: 'spotify:track:autre' });
    const list = await listReview(pool, host.id);
    expect(list.map(t => t.uri)).toEqual(['spotify:track:autre', 'spotify:track:t1']);
    expect(list[1]).toEqual({ ...reviewTrack, addedAt: expect.any(Date) });
    await removeReview(pool, host.id, 'spotify:track:t1');
    expect((await listReview(pool, host.id)).map(t => t.uri)).toEqual(['spotify:track:autre']);
  });

  it('sépare les listes de chaque compte', async () => {
    const a = await insertUser(pool);
    const b = await insertUser(pool);
    await addReview(pool, a.id, reviewTrack);
    expect(await listReview(pool, b.id)).toEqual([]);
    await removeReview(pool, b.id, reviewTrack.uri);
    expect(await listReview(pool, a.id)).toHaveLength(1);
  });
});
