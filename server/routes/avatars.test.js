import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../../test/db.js';
import { createTestApp, signUp } from '../../test/http.js';
import { createPool } from '../db.js';

const pool = createPool(testDatabaseUrl());
afterAll(() => pool.end());

const avatarDir = fs.mkdtempSync(path.join(os.tmpdir(), 'melodyo-avatars-'));
const app = createTestApp(pool, { avatarDir });
const png = () => sharp({ create: { width: 300, height: 300, channels: 3, background: '#00b894' } }).png().toBuffer();
const upload = (agent, body, type = 'image/png') => agent.post('/api/me/avatar').set('Content-Type', type).send(body);
const files = () => fs.readdirSync(avatarDir);

async function loggedIn() {
  const agent = request.agent(app);
  await signUp(agent);
  return agent;
}

describe('avatar proposé', () => {
  it('se choisit dans la liste', async () => {
    const agent = await loggedIn();
    const res = await agent.put('/api/me/avatar').send({ preset: 'guitare' });
    expect(res.status).toBe(200);
    expect(res.body.user.avatar).toEqual({ kind: 'preset', value: 'guitare' });
  });

  it('refuse un avatar inconnu', async () => {
    const res = await (await loggedIn()).put('/api/me/avatar').send({ preset: 'licorne' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_preset' });
  });

  it('exige d\'être connecté', async () => {
    expect((await request(app).put('/api/me/avatar').send({ preset: 'note' })).status).toBe(401);
    expect((await upload(request(app), await png())).status).toBe(401);
  });
});

describe('avatar envoyé', () => {
  it('est ré-encodé, stocké et servi', async () => {
    const agent = await loggedIn();
    const res = await upload(agent, await png());
    expect(res.status).toBe(200);
    const { kind, value } = res.body.user.avatar;
    expect(kind).toBe('upload');
    expect(value).toMatch(/^[0-9a-f-]{36}\.webp$/);
    expect(files()).toContain(value);

    const served = await request(app).get(`/avatars/${value}`);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/webp');
    expect(served.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('refuse un faux PNG sans rien écrire', async () => {
    const before = files().length;
    const res = await upload(await loggedIn(), Buffer.from('%PDF-1.4 pas une image'));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_image' });
    expect(files()).toHaveLength(before);
  });

  it('refuse un autre type de contenu', async () => {
    const res = await upload(await loggedIn(), 'bonjour', 'text/plain');
    expect(res.status).toBe(415);
    expect(res.body).toEqual({ error: 'unsupported_type' });
  });

  it('refuse un fichier de plus de 2 Mo', async () => {
    const res = await upload(await loggedIn(), Buffer.alloc(2.5 * 1024 * 1024));
    expect(res.status).toBe(413);
  });

  it('supprime l\'ancienne image quand on la remplace', async () => {
    const agent = await loggedIn();
    const first = (await upload(agent, await png())).body.user.avatar.value;
    const second = (await upload(agent, await png())).body.user.avatar.value;
    expect(files()).not.toContain(first);
    expect(files()).toContain(second);
    await agent.put('/api/me/avatar').send({ preset: 'micro' });
    expect(files()).not.toContain(second);
  });
});

describe('GET /avatars', () => {
  it.each(['..%2Fpackage.json', 'abc.webp', '00000000-0000-0000-0000-000000000000.webp'])('renvoie 404 pour %s', async file => {
    expect((await request(app).get(`/avatars/${file}`)).status).toBe(404);
  });
});
