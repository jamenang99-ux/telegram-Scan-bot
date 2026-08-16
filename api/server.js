/**
 * api/server.js — Express API server for Mini App back-end
 *
 * Provides:
 *   POST /api/auth/validate  — validate Telegram initData, return JWT
 *   GET|POST /api/chat/:id/settings
 *   GET|POST /api/chat/:id/locks
 *   GET|POST|DELETE /api/chat/:id/blocklist/...
 *   GET       /api/chat/:id/modlogs
 *
 * All routes after /api/auth/validate require a Bearer JWT in the
 * Authorization header AND the user must be an admin in the target chat.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { validateInitData } = require('./auth');
const { signToken, requireAuth, requireAdmin } = require('./middleware');
const { settingsRoutes } = require('./routes/settings');
const { locksRoutes } = require('./routes/locks');
const { blocklistRoutes } = require('./routes/blocklist');
const { modlogsRoutes } = require('./routes/modlogs');

/**
 * Start the Express API server. Designed to be called from bot.js.
 *
 * @param {import('telegraf').Telegraf} bot - Telegraf bot instance (for admin checks)
 * @param {number} port - HTTP port (default 3001)
 * @returns {Promise<import('http').Server>}
 */
function startApiServer(bot, port = 3001) {
  return new Promise((resolve, reject) => {
    const app = express();
    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
      return reject(new Error('BOT_TOKEN required to start API server'));
    }

    // ── Middleware ────────────────────────────────────────────────
    app.use(cors());
    app.use(express.json());

    // ── Serve built Mini App (React SPA) ─────────────────────────
    const path = require('path');
    const miniAppDir = path.join(__dirname, '..', 'mini-app', 'dist');
    app.use('/admin', express.static(miniAppDir));
    // SPA fallback: serve index.html for any /admin/* path that isn't a static file
    app.get('/admin/*', (req, res) => {
      res.sendFile(path.join(miniAppDir, 'index.html'));
    });

    // ── Auth endpoint (no JWT required) ───────────────────────────
    app.post('/api/auth/validate', async (req, res) => {
      const { initData } = req.body;
      if (!initData) {
        return res.status(400).json({ error: 'initData is required' });
      }

      // 1. Validate HMAC
      const result = validateInitData(initData, botToken);
      if (!result.valid) {
        return res.status(401).json({ error: result.error });
      }

      const userId = result.user?.id;
      if (!userId) {
        return res.status(400).json({ error: 'no user in initData' });
      }

      // 2. Check auth_date freshness already done inside validateInitData

      // 3. If we have a chat_id (from start_param), verify admin status
      const chatId = result.chat_id || (req.body.chat_id ? parseInt(req.body.chat_id, 10) : null);
      let adminStatus = null;
      let chatInfo = null;

      if (chatId) {
        try {
          const member = await bot.telegram.getChatMember(chatId, userId);
          adminStatus = member.status;
          const isAdmin = ['administrator', 'creator'].includes(member.status);
          if (!isAdmin) {
            return res.status(403).json({
              error: 'user is not an admin in this chat',
              user_status: adminStatus,
              user: result.user,
              chat_id: chatId,
            });
          }

          // Also fetch chat title for display
          try {
            const chat = await bot.telegram.getChat(chatId);
            chatInfo = { id: chat.id, title: chat.title, type: chat.type };
          } catch { /* non-fatal */ }
        } catch (err) {
          // Bot may not be in the chat yet
          return res.status(404).json({
            error: `cannot verify admin status: ${err.description || err.message}`,
            user: result.user,
            chat_id: chatId,
          });
        }
      }

      // 4. Issue JWT
      const token = signToken(
        { userId, chatId: chatId || null, username: result.user?.username || null, isAdmin: !!adminStatus },
        botToken
      );

      res.json({
        ok: true,
        token,
        user: result.user,
        chat: chatInfo || (chatId ? { id: chatId } : null),
        admin_status: adminStatus,
      });
    });

    // ── Health check ──────────────────────────────────────────────
    app.get('/api/health', (req, res) => {
      res.json({ ok: true, uptime: process.uptime() });
    });

    // ── Protected routes (require JWT + admin in chat) ────────────
    const requireChatAdmin = [requireAuth(botToken)];
    // We only mount admin-check AFTER the auth check — the admin check
    // is injected per-route-group below.

    // Helper: mount routes with both auth + admin middleware
    function mountProtected(basePath, routeBuilder) {
      // Auth + admin check on the parent router
      const router = express.Router({ mergeParams: true });
      router.use(requireAuth(botToken));
      router.use(requireAdmin(bot));
      router.use('/', routeBuilder());
      app.use(basePath, router);
    }

    mountProtected('/api/chat/:id/settings', settingsRoutes);
    mountProtected('/api/chat/:id/locks', locksRoutes);
    mountProtected('/api/chat/:id/blocklist', blocklistRoutes);
    mountProtected('/api/chat/:id/modlogs', modlogsRoutes);
    mountProtected('/api/chat/:id/mod-logs', modlogsRoutes); // alias with hyphen

    // ── Error handler ─────────────────────────────────────────────
    app.use((err, req, res, _next) => {
      console.error('[api] unhandled error:', err.message);
      res.status(500).json({ error: 'internal server error' });
    });

    // ── Listen ────────────────────────────────────────────────────
    const server = app.listen(port, () => {
      console.log(`[api] Mini App API server listening on http://localhost:${port}`);
      resolve(server);
    });

    server.on('error', reject);
  });
}

module.exports = { startApiServer };