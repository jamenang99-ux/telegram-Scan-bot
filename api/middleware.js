/**
 * api/middleware.js — JWT session auth + admin status verification
 *
 * After initData validation, the /api/auth/validate endpoint issues a JWT.
 * All protected routes require this JWT via the Authorization header.
 * The admin-check middleware calls Telegram's getChatMember to verify
 * the user is still an admin in the target chat.
 */

const jwt = require('jsonwebtoken');

/**
 * Derive JWT secret deterministically from the bot token so it's stable
 * across restarts but not guessable without the token.
 */
function getJwtSecret(botToken) {
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update('tomneung-mod-bot-jwt:' + botToken).digest('hex');
}

/**
 * Generate a JWT session token.
 * @param {object} payload - { userId, chatId, username, isAdmin }
 * @param {string} botToken - Bot token for deriving the secret
 * @param {number} ttlSec - Token lifetime (default 1 hour)
 * @returns {string} JWT string
 */
function signToken(payload, botToken, ttlSec = 3600) {
  return jwt.sign(payload, getJwtSecret(botToken), { expiresIn: ttlSec });
}

/**
 * Express middleware: require a valid JWT in the Authorization header.
 * Decoded payload is attached to req.auth.
 */
function requireAuth(botToken) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'missing or malformed Authorization header' });
    }
    const token = header.slice(7);
    try {
      const decoded = jwt.verify(token, getJwtSecret(botToken));
      req.auth = decoded;
      next();
    } catch (err) {
      const msg = err.name === 'TokenExpiredError' ? 'token expired' : 'invalid token';
      return res.status(401).json({ error: msg });
    }
  };
}

/**
 * Express middleware: verify the authenticated user is an admin in the
 * target chat (chatId from route params). Calls Telegram's getChatMember.
 *
 * Must be mounted AFTER requireAuth and AFTER a route that has :id param.
 *
 * @param {import('telegraf').Telegraf} bot - Telegraf bot instance for API calls
 */
function requireAdmin(bot) {
  return async (req, res, next) => {
    const chatId = parseInt(req.params.id, 10);
    const userId = req.auth.userId;

    if (!chatId || isNaN(chatId)) {
      return res.status(400).json({ error: 'invalid chat_id in URL' });
    }

    try {
      const member = await bot.telegram.getChatMember(chatId, userId);
      const isAdmin = ['administrator', 'creator'].includes(member.status);
      if (!isAdmin) {
        return res.status(403).json({
          error: 'user is not an admin in this chat',
          user_status: member.status,
        });
      }
      next();
    } catch (err) {
      // Likely the bot isn't in the chat, or chat doesn't exist
      const status = err?.response?.error_code || 500;
      const msg = err?.description || err.message || 'failed to check admin status';
      return res.status(status === 400 ? 404 : 502).json({
        error: `cannot verify admin status: ${msg}`,
      });
    }
  };
}

module.exports = { signToken, requireAuth, requireAdmin, getJwtSecret };