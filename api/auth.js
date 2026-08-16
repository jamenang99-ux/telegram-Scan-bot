/**
 * api/auth.js — Telegram WebApp initData validation (HMAC-SHA256)
 *
 * Validates that an initData string was genuinely signed by Telegram,
 * using the bot token as the shared secret.
 *
 * Reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

const crypto = require('node:crypto');

/**
 * Validate a Telegram WebApp initData string.
 *
 * @param {string} initData  - Raw query string from window.Telegram.WebApp.initData
 * @param {string} botToken  - Bot token from .env
 * @param {number} maxAgeMs  - Reject initData older than this (default 24h)
 * @returns {{ valid: boolean, user?: object, chat_id?: number, auth_date?: number, error?: string }}
 */
function validateInitData(initData, botToken, maxAgeMs = 86400_000) {
  if (!initData || typeof initData !== 'string') {
    return { valid: false, error: 'initData is required' };
  }

  // Parse the query string — it may or may not have a leading ?
  const raw = initData.startsWith('?') ? initData.slice(1) : initData;
  const params = new URLSearchParams(raw);

  const hash = params.get('hash');
  if (!hash) {
    return { valid: false, error: 'hash missing from initData' };
  }

  // Build data-check string: sort all pairs except hash by key, join with \n
  const pairs = [];
  for (const [key, value] of params) {
    if (key !== 'hash') {
      pairs.push({ key, value });
    }
  }
  pairs.sort((a, b) => a.key.localeCompare(b.key));
  const dataCheckString = pairs.map(p => `${p.key}=${p.value}`).join('\n');

  // Compute secret: HMAC-SHA256 of bot token with key "WebAppData"
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

  // Compute expected hash
  const computedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks.
  // Both values are fixed-length (64-char) hex; compare as Buffers.
  const computedBuf = Buffer.from(computedHash, 'hex');
  const providedBuf = Buffer.from(hash || '', 'hex');
  if (
    computedBuf.length !== providedBuf.length ||
    !crypto.timingSafeEqual(computedBuf, providedBuf)
  ) {
    return { valid: false, error: 'hash mismatch — initData was tampered' };
  }

  // Parse user object if present
  let user = null;
  const userRaw = params.get('user');
  if (userRaw) {
    try {
      user = JSON.parse(userRaw);
    } catch {
      return { valid: false, error: 'invalid user JSON in initData' };
    }
  }

  // Check auth_date freshness
  const authDateStr = params.get('auth_date');
  const authDate = authDateStr ? parseInt(authDateStr, 10) : 0;
  if (authDate && Date.now() / 1000 - authDate > maxAgeMs / 1000) {
    return { valid: false, error: 'initData expired (older than 24h)' };
  }

  // Extract chat_id from start_param if present (format: "chat_-1001234567890")
  let chatId = null;
  const startParam = params.get('start_param');
  if (startParam && startParam.startsWith('chat_')) {
    chatId = parseInt(startParam.slice(5), 10);
  }
  // Also check if chat object exists (Telegram may include it on group buttons)
  const chatRaw = params.get('chat');
  if (!chatId && chatRaw) {
    try {
      const chat = JSON.parse(chatRaw);
      chatId = chat.id;
    } catch { /* ignore */ }
  }

  return {
    valid: true,
    user,
    chat_id: chatId,
    auth_date: authDate,
    raw,
    hash,
  };
}

module.exports = { validateInitData };