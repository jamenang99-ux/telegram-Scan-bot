/**
 * api/routes/settings.js — GET/POST chat settings
 */

const { Router } = require('express');
const { getSettings, getBlockedExtensions, getBlockedDomains, getAllowedDomains } = require('../../db');

function settingsRoutes() {
  const router = Router();

  // GET /api/chat/:id/settings — full settings payload
  router.get('/', (req, res) => {
    const chatId = parseInt(req.params.id, 10);
    try {
      const settings = getSettings(chatId);
      const blockedExts = getBlockedExtensions(chatId);
      const blockedDomains = getBlockedDomains(chatId);
      const allowedDomains = getAllowedDomains(chatId);

      res.json({
        ok: true,
        settings,
        blocked_extensions: blockedExts,
        blocked_domains: blockedDomains.map(d => d.domain),
        allowed_domains: allowedDomains.map(d => d.domain),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/chat/:id/settings — update one or more settings fields
  router.post('/', (req, res) => {
    const chatId = parseInt(req.params.id, 10);
    const allowedFields = [
      'flood_limit', 'flood_seconds', 'max_warns',
      'mute_duration_min', 'captcha_enabled', 'welcome_template',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'no valid fields to update' });
    }

    try {
      const db = require('../../db').db;
      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const values = Object.values(updates);
      values.push(chatId);
      db.prepare(`UPDATE chat_settings SET ${setClauses} WHERE chat_id = ?`).run(...values);

      const updated = getSettings(chatId);
      res.json({ ok: true, settings: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { settingsRoutes };