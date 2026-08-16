/**
 * api/routes/modlogs.js — GET paginated mod logs
 */

const { Router } = require('express');
const { getModLogs, countModLogs } = require('../../db');

function modlogsRoutes() {
  const router = Router();

  // GET /api/chat/:id/modlogs?limit=50&offset=0
  router.get('/', (req, res) => {
    const chatId = parseInt(req.params.id, 10);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    try {
      const logs = getModLogs(chatId, limit, offset);
      const total = countModLogs(chatId);

      res.json({
        ok: true,
        logs,
        pagination: {
          total,
          limit,
          offset,
          has_more: offset + limit < total,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { modlogsRoutes };