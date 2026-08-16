/**
 * test/filters.test.js — Integration tests for message filters + DB warn logic.
 *
 * Strategy:
 *  - Isolate the DB by pointing db/index.js at a temp file via BOT_DB_PATH
 *    (set BEFORE requiring any project module that opens SQLite).
 *  - Mock the Telegram ctx (no real network / no live bot required).
 *  - Drive each middleware end-to-end and assert side-effects.
 *
 * Usage: node test/filters.test.js
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('node:crypto');

// ── Isolate DB (MUST be set before requiring ../db via middlewares) ──
const TMP_DB = path.join(os.tmpdir(), `scanbot-test-${Date.now()}.sqlite`);
process.env.BOT_DB_PATH = TMP_DB;

const assert = require('node:assert');
const { floodMiddleware, isAdmin } = require('../middlewares/flood');
const { fileFilterMiddleware } = require('../middlewares/fileFilter');
const { linkFilterMiddleware } = require('../middlewares/linkFilter');
const { enforcementMiddleware } = require('../middlewares/enforcement');
const db = require('../db');
const { validateInitData } = require('../api/auth');
const cache = require('../lib/cache');

let passed = 0;
let failed = 0;
function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

// ── Mock Telegram ctx ────────────────────────────────────────────────
function makeCtx({
  chatId = -100123,
  userId = 555,
  status = 'member',
  message = {},
  isGroup = true,
} = {}) {
  const calls = {
    restrict: 0, ban: 0, unban: 0, delete: 0,
    reply: 0, replyWithMarkdown: 0, answerCbQuery: 0, editMessageText: 0,
  };
  const ctx = {
    chat: isGroup ? { id: chatId, type: 'supergroup' } : { id: userId, type: 'private' },
    from: { id: userId, first_name: 'Tester' },
    message: Object.assign({ message_id: 1 }, message),
    match: null,
    telegram: {
      getChatMember: async () => ({ status }),
      restrictChatMember: async () => { calls.restrict++; return true; },
      banChatMember: async () => { calls.ban++; return true; },
      unbanChatMember: async () => { calls.unban++; return true; },
      deleteMessage: async () => { calls.delete++; return true; },
      getFileLink: async () => ({ href: 'https://example.com/x' }),
    },
    reply: async () => { calls.reply++; return true; },
    // Telegraf shortcut: ctx.deleteMessage(msgId) — used by filters
    deleteMessage: async () => { calls.delete++; return true; },
    replyWithMarkdown: async () => { calls.replyWithMarkdown++; return true; },
    answerCbQuery: async () => { calls.answerCbQuery++; return true; },
    editMessageText: async () => { calls.editMessageText++; return true; },
    _calls: calls,
  };
  return ctx;
}

async function run() {
  // ── isAdmin ───────────────────────────────────────────────────────
  console.log('\n🔐 isAdmin');
  {
    cache.adminCache.clear();
    const admin = makeCtx({ status: 'administrator' });
    check('administrator → true', (await isAdmin(admin, 551)) === true);
    const member = makeCtx({ status: 'member' });
    check('member → false', (await isAdmin(member, 552)) === false);
    const creator = makeCtx({ status: 'creator' });
    check('creator → true', (await isAdmin(creator, 553)) === true);
  }

  // ── Flood filter ──────────────────────────────────────────────────
  console.log('\n🌊 Flood filter (limit 5 within 10s)');
  {
    cache.adminCache.clear();
    const chatId = -100200;
    const userId = 601;
    const trace = [];
    for (let i = 0; i < 6; i++) {
      const ctx = makeCtx({ chatId, userId, message: { text: `spam ${i}` } });
      let next = false;
      await floodMiddleware(ctx, async () => { next = true; });
      trace.push({ i, restrict: ctx._calls.restrict, reply: ctx._calls.reply, next });
    }
    const firstFiveOk = trace.slice(0, 5).every((c) => c.next === true && c.restrict === 0);
    check('first 5 messages pass through (no mute)', firstFiveOk);
    const sixth = trace[5];
    check('6th message triggers mute (restrict called)', sixth.restrict === 1, JSON.stringify(sixth));
    check('6th message is NOT passed downstream', sixth.next === false);
    check('mute reply sent on 6th', sixth.reply === 1);
  }

  // ── File filter ───────────────────────────────────────────────────
  console.log('\n📎 File filter');
  {
    cache.adminCache.clear();
    const ctx = makeCtx({ message: { document: { file_name: 'evil.exe', file_id: 'f1' } } });
    let next = false;
    await fileFilterMiddleware(ctx, async () => { next = true; });
    check('blocks .exe (deleted)', ctx._calls.delete === 1);
    check('blocks .exe (warned)', ctx._calls.reply === 1);
    check('blocks .exe (not passed downstream)', next === false);
    check('warn recorded in DB', db.getWarns(ctx.chat.id, ctx.from.id) === 1);

    const dbl = makeCtx({ userId: 602, message: { document: { file_name: 'invoice.pdf.exe', file_id: 'f2' } } });
    let next2 = false;
    await fileFilterMiddleware(dbl, async () => { next2 = true; });
    check('blocks double-extension invoice.pdf.exe', dbl._calls.delete === 1 && next2 === false);

    const safe = makeCtx({ userId: 603, message: { document: { file_name: 'report.pdf', file_id: 'f3' } } });
    let next3 = false;
    await fileFilterMiddleware(safe, async () => { next3 = true; });
    check('allows safe .pdf (passed downstream)', next3 === true && safe._calls.delete === 0);

    const admin = makeCtx({ userId: 604, status: 'administrator', message: { document: { file_name: 'admin_tool.exe', file_id: 'f4' } } });
    let next4 = false;
    await fileFilterMiddleware(admin, async () => { next4 = true; });
    check('admin bypasses file filter', next4 === true && admin._calls.delete === 0);
  }

  // ── Link filter ───────────────────────────────────────────────────
  console.log('\n🔗 Link filter');
  {
    cache.adminCache.clear();
    const ctx = makeCtx({ message: { text: 'join our group https://t.me/joinchat/ABC123' } });
    let next = false;
    await linkFilterMiddleware(ctx, async () => { next = true; });
    check('blocks telegram invite link (deleted)', ctx._calls.delete === 1);
    check('blocks invite link (warned)', ctx._calls.reply === 1);
    check('blocks invite link (not passed downstream)', next === false);

    const normal = makeCtx({ userId: 701, message: { text: 'see https://google.com for docs' } });
    let next2 = false;
    await linkFilterMiddleware(normal, async () => { next2 = true; });
    check('allows normal https link', next2 === true && normal._calls.delete === 0);

    const admin = makeCtx({ userId: 702, status: 'administrator', message: { text: 'https://t.me/joinchat/ADMIN' } });
    let next3 = false;
    await linkFilterMiddleware(admin, async () => { next3 = true; });
    check('admin bypasses link filter', next3 === true && admin._calls.delete === 0);
  }

  // ── Enforcement (Mini App locks / domain blocklist / file_id blocklist) ──
  console.log('\n🛡️  Enforcement (Mini App locks/blocklists)');
  {
    cache.locksCache.clear(); cache.bdomainsCache.clear(); cache.adomainsCache.clear();
    cache.bfilesCache.clear(); cache.adminCache.clear();

    const chatId = -100400;

    // links lock blocks a normal (non-allowed) URL
    db.setLock(chatId, 'links', true);
    const c1 = makeCtx({ chatId, userId: 901, message: { text: 'visit https://google.com now' } });
    let n1 = false; await enforcementMiddleware(c1, async () => { n1 = true; });
    check('links lock blocks non-allowed URL (deleted)', c1._calls.delete === 1);
    check('links lock does NOT pass downstream', n1 === false);

    // allowed domain is permitted under links lock
    db.addAllowedDomain(chatId, 'google.com', 901);
    cache.locksCache.clear(); cache.adomainsCache.clear();
    const c2 = makeCtx({ chatId, userId: 902, message: { text: 'https://google.com ok' } });
    let n2 = false; await enforcementMiddleware(c2, async () => { n2 = true; });
    check('allowed domain passes under links lock', n2 === true && c2._calls.delete === 0);

    // blocked domain is always deleted (regardless of links lock)
    db.addBlockedDomain(chatId, 'evil.com', 901);
    cache.bdomainsCache.clear();
    const c3 = makeCtx({ chatId, userId: 903, message: { text: 'http://evil.com/x' } });
    let n3 = false; await enforcementMiddleware(c3, async () => { n3 = true; });
    check('blocked domain deleted', c3._calls.delete === 1 && n3 === false);

    // media lock deletes a photo
    db.setLock(chatId, 'media', true);
    cache.locksCache.clear();
    const c4 = makeCtx({ chatId, userId: 904, message: { photo: [{ file_id: 'p1' }] } });
    let n4 = false; await enforcementMiddleware(c4, async () => { n4 = true; });
    check('media lock deletes photo', c4._calls.delete === 1 && n4 === false);

    // forwards lock deletes a forwarded message
    db.setLock(chatId, 'forwards', true);
    cache.locksCache.clear();
    const c5 = makeCtx({ chatId, userId: 905, message: { text: 'hi', forward_origin: { type: 'user' } } });
    let n5 = false; await enforcementMiddleware(c5, async () => { n5 = true; });
    check('forwards lock deletes forwarded msg', c5._calls.delete === 1 && n5 === false);

    // stickers lock deletes a sticker
    db.setLock(chatId, 'stickers', true);
    cache.locksCache.clear();
    const c6 = makeCtx({ chatId, userId: 906, message: { sticker: { file_id: 's1' } } });
    let n6 = false; await enforcementMiddleware(c6, async () => { n6 = true; });
    check('stickers lock deletes sticker', c6._calls.delete === 1 && n6 === false);

    // file_id blocklist deletes a document
    db.blockFile(chatId, 'BADF', 'malware.exe', 'hash', 901);
    cache.bfilesCache.clear();
    const c7 = makeCtx({ chatId, userId: 907, message: { document: { file_id: 'BADF', file_name: 'malware.exe' } } });
    let n7 = false; await enforcementMiddleware(c7, async () => { n7 = true; });
    check('file_id blocklist deletes document', c7._calls.delete === 1 && n7 === false);

    // admin bypasses all enforcement
    cache.adminCache.clear();
    const c8 = makeCtx({ chatId, userId: 908, status: 'administrator', message: { text: 'https://google.com admin' } });
    let n8 = false; await enforcementMiddleware(c8, async () => { n8 = true; });
    check('admin bypasses enforcement', n8 === true && c8._calls.delete === 0);
  }

  // ── Warn → reset ──────────────────────────────────────────────────
  console.log('\n⚠️  Warn / reset logic');
  {
    const chatId = -100300;
    const userId = 801;
    let count = 0;
    for (let i = 0; i < 3; i++) count = db.addWarn(chatId, userId, `reason ${i}`);
    check('warn count reaches 3', count === 3, `got ${count}`);
    check('getWarns returns 3', db.getWarns(chatId, userId) === 3);
    db.resetWarns(chatId, userId);
    check('resetWarns clears count', db.getWarns(chatId, userId) === 0);
  }

  // ── initData validation (local, exercises new timingSafeEqual) ─────
  console.log('\n🔐 initData validation (local, no server)');
  {
    const TOKEN = 'TEST_BOT_TOKEN_12345';
    function sign(payload) {
      const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
      const data = { ...payload };
      delete data.hash;
      const dcs = Object.keys(data).sort()
        .map((k) => `${k}=${data[k]}`).join('\n');
      const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
      return `${dcs}&hash=${hash}`;
    }
    const valid = sign({ user: JSON.stringify({ id: 1, first_name: 'X' }), auth_date: String(Math.floor(Date.now() / 1000)) });
    const r1 = validateInitData(valid, TOKEN);
    check('valid initData → valid', r1.valid === true);
    const tampered = valid.replace(/hash=[a-f0-9]+/, 'hash=' + '0'.repeat(64));
    const r2 = validateInitData(tampered, TOKEN);
    check('tampered initData → invalid', r2.valid === false);
    const expired = sign({ user: JSON.stringify({ id: 1 }), auth_date: String(Math.floor(Date.now() / 1000) - 999999) });
    const r3 = validateInitData(expired, TOKEN, 3600 * 1000);
    check('expired auth_date → invalid', r3.valid === false);
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`📊 FILTER TESTS: ${passed}/${passed + failed} passed, ${failed} failed`);
  console.log('═'.repeat(50));

  try {
    fs.unlinkSync(TMP_DB);
    fs.unlinkSync(TMP_DB + '-shm');
    fs.unlinkSync(TMP_DB + '-wal');
  } catch (_) { /* ignore */ }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('💥 test crashed:', err);
  process.exit(1);
});
