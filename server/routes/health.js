import express from 'express';

export function healthRouter(pool) {
  const router = express.Router();

  router.get('/healthz', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  return router;
}
