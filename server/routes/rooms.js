import express from 'express';
import { asyncRoute } from '../async-route.js';
import { normalizeRoomCode } from '../rooms/code.js';
import { closeRoom, findOpenRoomByCode, joinAsGuest, joinAsUser, openRoomFor } from '../rooms/repo.js';
import { requireUser } from '../session-middleware.js';

const GUEST_DAYS = 7;
export const guestCookieName = code => `melodyo_guest_${code}`;

const roomNotFound = res => res.status(404).json({ error: 'room_not_found' });

export function roomsRouter({ pool, config, limiters, hub }) {
  const router = express.Router();

  async function roomFromParam(req) {
    const code = normalizeRoomCode(req.params.code);
    if (!code) return null;
    return findOpenRoomByCode(pool, code);
  }

  router.post('/api/rooms', requireUser, asyncRoute(async (req, res) => {
    const { id, code } = await openRoomFor(pool, req.user.id);
    res.json({ room: { id, code } });
  }));

  router.post('/api/rooms/close', requireUser, asyncRoute(async (req, res) => {
    await closeRoom(pool, req.user.id);
    res.sendStatus(204);
  }));

  router.get('/api/rooms/:code', asyncRoute(async (req, res) => {
    const room = await roomFromParam(req);
    if (!room) return roomNotFound(res);
    res.json({ room: { code: room.code, hostName: room.hostName } });
  }));

  // Un compte connecté rejoint avec son compte, sauf s'il donne un nom (il joue alors en invité)
  router.post('/api/rooms/:code/join', limiters.joinPerIp, asyncRoute(async (req, res) => {
    const room = await roomFromParam(req);
    if (!room) return roomNotFound(res);
    const { guestName } = req.body;

    if (req.user && guestName === undefined) {
      const participant = await joinAsUser(pool, room.id, req.user.id);
      hub.participantsChanged(room.id);
      return res.json({ participant });
    }

    const name = typeof guestName === 'string' ? guestName.trim() : '';
    if (!name || name.length > 20) return res.status(400).json({ error: 'invalid_name' });
    const { participant, token } = await joinAsGuest(pool, room.id, name);
    res.cookie(guestCookieName(room.code), token, {
      httpOnly: true, sameSite: 'lax', secure: config.prod, path: '/', maxAge: GUEST_DAYS * 24 * 3600 * 1000,
    });
    hub.participantsChanged(room.id);
    res.json({ participant });
  }));

  return router;
}
