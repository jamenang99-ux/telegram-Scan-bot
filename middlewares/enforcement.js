/**
 * middlewares/enforcement.js — enforces Mini App–configured locks,
 * domain block/allow lists, and file_id blocklist.
 *
 * These settings are written by the API (api/routes/*) and were previously
 * NEVER read by the bot. This middleware closes that gap so the Mini App
 * "Locks" and "Blocklist" tabs actually do something.
 *
 * Lock types (db.locks): links, media, forwards, stickers, gifs,
 *                         inline_bots, polls, games
 *   - links:       block ANY url (http(s)/t.me) unless domain in allowed_domains
 *   - media:       block photo/video/audio/voice/video_note/document
 *   - forwards:    block forwarded messages (forward_origin / forward_from)
 *   - stickers:    block sticker messages
 *   - gifs:        block animation (GIF) messages
 *   - inline_bots: block messages sent via an inline bot (via_bot)
 *   - polls:       block poll messages
 *   - games:       block game messages
 *
 * blocked_domains: always deleted (regardless of links lock)
 * allowed_domains: exempt from the links lock
 * blocked_files:   document.file_id blocked (regardless of extension)
 *
 * Reads are cached (lib/cache) so we don't hit SQLite / the API on every message.
 */

const { isAdmin } = require('./flood');
const {
  getLocksMap, getBlockedDomains, getAllowedDomains, getBlockedFiles,
  addWarn, logAction, getSettings,
} = require('../db');
const {
  locksCache, bdomainsCache, adomainsCache, bfilesCache,
} = require('../lib/cache');

function collectUrls(msg) {
  const urls = [];
  const text = msg.text || '';
  const caption = msg.caption || '';
  const pushRaw = (s) => {
    const m = s.match(/https?:\/\/[^\s]+|t\.me\/[^\s]+/gi);
    if (m) urls.push(...m);
  };
  pushRaw(text);
  pushRaw(caption);
  for (const e of (msg.entities || [])) {
    if (e.type === 'text_link' && e.url) urls.push(e.url);
    else if (e.type === 'url') urls.push(text.slice(e.offset, e.offset + e.length));
  }
  for (const e of (msg.caption_entities || [])) {
    if (e.type === 'text_link' && e.url) urls.push(e.url);
    else if (e.type === 'url') urls.push(caption.slice(e.offset, e.offset + e.length));
  }
  return urls;
}

function domainOf(url) {
  try {
    let u = url;
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
    const host = new URL(u).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return null;
  }
}

async function deleteAndWarn(ctx, chatId, userId, reason, action) {
  try {
    await ctx.deleteMessage();
  } catch (err) {
    console.error('enforcement delete failed:', err.message);
  }
  const settings = getSettings(chatId);
  const count = addWarn(chatId, userId, reason);
  logAction(chatId, null, userId, action, reason);
  await ctx.reply(
    `⚠️ ${ctx.from.first_name} ត្រូវបានរាំងខ្ទប់ (${reason}) (warn ${count}/${settings.max_warns})`
  );
  if (count >= settings.max_warns) {
    await ctx.telegram.banChatMember(chatId, userId);
    logAction(chatId, null, userId, 'auto_ban', `max warns reached (${action})`);
    await ctx.reply(`🚫 ${ctx.from.first_name} ត្រូវបាន ban (លើសចំនួន warn)`);
  }
}

async function enforcementMiddleware(ctx, next) {
  const msg = ctx.message;
  if (!ctx.chat || ctx.chat.type === 'private' || !ctx.from || !msg) return next();

  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  if (await isAdmin(ctx, userId)) return next();

  // ── Locks (cached single-query map) ──
  let locks = locksCache.get(chatId);
  if (!locks) { locks = getLocksMap(chatId); locksCache.set(chatId, locks); }

  // ── file_id blocklist (documents) ──
  if (msg.document && msg.document.file_id) {
    let bf = bfilesCache.get(chatId);
    if (!bf) { bf = new Set(getBlockedFiles(chatId).map((r) => r.file_id)); bfilesCache.set(chatId, bf); }
    if (bf.has(msg.document.file_id)) {
      await deleteAndWarn(ctx, chatId, userId, 'blocked file (file_id)', 'blocked_file');
      return;
    }
  }

  // ── domains (blocklist always; allowlist exempts links lock) ──
  const urls = collectUrls(msg);
  if (urls.length) {
    let bdom = bdomainsCache.get(chatId);
    if (!bdom) { bdom = new Set(getBlockedDomains(chatId).map((r) => r.domain)); bdomainsCache.set(chatId, bdom); }
    let adom = adomainsCache.get(chatId);
    if (!adom) { adom = new Set(getAllowedDomains(chatId).map((r) => r.domain)); adomainsCache.set(chatId, adom); }

    for (const u of urls) {
      const d = domainOf(u);
      if (d && bdom.has(d)) {
        await deleteAndWarn(ctx, chatId, userId, `blocked domain ${d}`, 'blocked_domain');
        return;
      }
    }
    if (locks.links) {
      const blocked = urls.some((u) => {
        const d = domainOf(u);
        return d && !adom.has(d);
      });
      if (blocked) {
        await deleteAndWarn(ctx, chatId, userId, 'links locked', 'lock_links');
        return;
      }
    }
  }

  // ── content locks ──
  if (locks.media && (msg.photo || msg.video || msg.audio || msg.voice || msg.video_note || msg.document)) {
    await deleteAndWarn(ctx, chatId, userId, 'media locked', 'lock_media');
    return;
  }
  if (locks.forwards && (msg.forward_origin || msg.forward_from)) {
    await deleteAndWarn(ctx, chatId, userId, 'forwards locked', 'lock_forwards');
    return;
  }
  if (locks.stickers && msg.sticker) {
    await deleteAndWarn(ctx, chatId, userId, 'stickers locked', 'lock_stickers');
    return;
  }
  if (locks.gifs && msg.animation) {
    await deleteAndWarn(ctx, chatId, userId, 'gifs locked', 'lock_gifs');
    return;
  }
  if (locks.inline_bots && msg.via_bot) {
    await deleteAndWarn(ctx, chatId, userId, 'inline bots locked', 'lock_inline_bots');
    return;
  }
  if (locks.polls && msg.poll) {
    await deleteAndWarn(ctx, chatId, userId, 'polls locked', 'lock_polls');
    return;
  }
  if (locks.games && msg.game) {
    await deleteAndWarn(ctx, chatId, userId, 'games locked', 'lock_games');
    return;
  }

  return next();
}

module.exports = { enforcementMiddleware, collectUrls, domainOf };
