/**
 * api/routes/blocklist.js — GET/POST/DELETE blocklist items
 *
 * Manages: blocked extensions (via blocklist table), blocked domains,
 * allowed domains, and blocked files.
 */

const { Router } = require('express');
const { getBlockedExtensions, getBlockedDomains, getAllowedDomains, getBlockedFiles } = require('../../db');

function blocklistRoutes() {
  const router = Router();

  // GET /api/chat/:id/blocklist — returns all blocklist categories
  router.get('/', (req, res) => {
    const chatId = parseInt(req.params.id, 10);
    try {
      const db = require('../../db');

      // Blocklist table (extensions + any other types)
      const listRows = db.db.prepare('SELECT * FROM blocklist WHERE chat_id = ? ORDER BY type, value').all(chatId);

      res.json({
        ok: true,
        blocked_extensions: getBlockedExtensions(chatId),
        blocked_domains: getBlockedDomains(chatId).map(r => ({ domain: r.domain, added_by: r.added_by, created_at: r.created_at })),
        allowed_domains: getAllowedDomains(chatId).map(r => ({ domain: r.domain, added_by: r.added_by, created_at: r.created_at })),
        blocked_files: getBlockedFiles(chatId),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/chat/:id/blocklist — add an item
  // body: { type: 'extension'|'domain'|'allowed_domain'|'file', value: '...' }
  router.post('/', (req, res) => {
    const chatId = parseInt(req.params.id, 10);
    const { type, value } = req.body;
    const userId = req.auth?.userId || null;

    if (!type || !value) {
      return res.status(400).json({ error: 'type and value are required' });
    }

    try {
      const db = require('../../db');
      let added = false;

      switch (type) {
        case 'extension':
          let ext = value.trim().toLowerCase();
          if (!ext.startsWith('.')) ext = '.' + ext;
          try {
            db.db.prepare("INSERT INTO blocklist (chat_id, type, value) VALUES (?, 'extension', ?)").run(chatId, ext);
            added = true;
          } catch { /* duplicate — still report success */ added = true; }
          break;

        case 'domain':
          added = db.addBlockedDomain(chatId, value, userId);
          break;

        case 'allowed_domain':
          added = db.addAllowedDomain(chatId, value, userId);
          break;

        case 'file':
          added = db.blockFile(chatId, value, req.body.file_name || null, req.body.file_hash || null, userId);
          break;

        default:
          return res.status(400).json({ error: `unknown type: ${type}. Valid: extension, domain, allowed_domain, file` });
      }

      res.json({ ok: true, added });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/chat/:id/blocklist/:type/:value — remove an item
  router.delete('/:type/:value', (req, res) => {
    const chatId = parseInt(req.params.id, 10);
    const { type, value } = req.params;
    const decodedValue = decodeURIComponent(value);

    try {
      const db = require('../../db');

      switch (type) {
        case 'extension':
          db.db.prepare("DELETE FROM blocklist WHERE chat_id = ? AND type = 'extension' AND value = ?").run(chatId, decodedValue);
          break;
        case 'domain':
          db.removeBlockedDomain(chatId, decodedValue);
          break;
        case 'allowed_domain':
          db.removeAllowedDomain(chatId, decodedValue);
          break;
        case 'file':
          db.unblockFile(chatId, decodedValue);
          break;
        default:
          return res.status(400).json({ error: `unknown type: ${type}` });
      }

      res.json({ ok: true, removed: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { blocklistRoutes };