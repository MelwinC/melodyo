import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isPreset } from '../../shared/avatars.js';
import { asyncRoute } from '../async-route.js';
import { toAvatarImage } from '../avatar-image.js';
import { requireUser } from '../session-middleware.js';
import { findUserById, setAvatar } from '../users.js';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export function avatarsRouter({ pool, config }) {
  const router = express.Router();

  async function replaceAvatar(req, res, avatar) {
    const { previous } = await setAvatar(pool, req.user.id, avatar);
    if (previous.kind === 'upload') await fs.rm(path.join(config.avatarDir, previous.value), { force: true });
    res.json({ user: await findUserById(pool, req.user.id) });
  }

  router.put('/api/me/avatar', requireUser, asyncRoute(async (req, res) => {
    if (!isPreset(req.body.preset)) return res.status(400).json({ error: 'invalid_preset' });
    await replaceAvatar(req, res, { kind: 'preset', value: req.body.preset });
  }));

  router.post('/api/me/avatar', requireUser, express.raw({ type: IMAGE_TYPES, limit: '2mb' }), asyncRoute(async (req, res) => {
    if (!Buffer.isBuffer(req.body)) return res.status(415).json({ error: 'unsupported_type' });
    let image;
    try {
      image = await toAvatarImage(req.body);
    } catch {
      // toAvatarImage ne lève que InvalidImageError
      return res.status(400).json({ error: 'invalid_image' });
    }
    const file = `${crypto.randomUUID()}.webp`;
    await fs.mkdir(config.avatarDir, { recursive: true });
    await fs.writeFile(path.join(config.avatarDir, file), image);
    await replaceAvatar(req, res, { kind: 'upload', value: file });
  }));

  router.get('/avatars/:file', (req, res) => {
    if (!FILE_NAME.test(req.params.file)) return res.sendStatus(404);
    res.sendFile(req.params.file, {
      root: config.avatarDir,
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    }, err => err && res.sendStatus(404));
  });

  return router;
}
