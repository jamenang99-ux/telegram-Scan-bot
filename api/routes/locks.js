/**
 * api/routes/locks.js — GET/POST locks
 */

const { Router } = require('express');
const { getLocks, setLock } = require('../../db');

function locksRoutes() {
  const router = Router();

  // GET /api/chat/:id/locks
  router.get('/', (req, res) => {
    const chatId = parseInt(req.params.id, 10);
    try {
      const locks = getLocks(chatId);
      res.json({ ok: true, locks });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/chat/:id/locks — body: { lock_type: 'links', enabled: true }
  router.post('/', (req, res) => {
    const chatId = parseInt(req.params.id, 10);
    const { lock_type, enabled } = req.body;

    const validTypes = ['links','media','forwards','stickers','gifs','inline_bots','polls','games'];
    if (!lock_type || !validTypes.includes(lock_type)) {
      return res.status(400).json({ error: `lock_type must be one of: ${validTypes.join(', ')}` });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be boolean' });
    }

    try {
      setLock(chatId, lock_type, enabled);
      const locks = getLocks(chatId);
      res.json({ ok: true, locks });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { locksRoutes };