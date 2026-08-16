const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.BOT_DB_PATH || path.join(__dirname, '..', 'bot.sqlite');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

const DEFAULT_EXT_BLOCKLIST = [
  '.exe', '.bat', '.cmd', '.scr', '.jar', '.apk',
  '.msi', '.vbs', '.ps1', '.com', '.dll', '.js'
];

function ensureChatSettings(chatId) {
  const row = db.prepare('SELECT chat_id FROM chat_settings WHERE chat_id = ?').get(chatId);
  if (!row) {
    db.prepare('INSERT INTO chat_settings (chat_id) VALUES (?)').run(chatId);
  }
}

function getSettings(chatId) {
  ensureChatSettings(chatId);
  return db.prepare('SELECT * FROM chat_settings WHERE chat_id = ?').get(chatId);
}

function recordFloodMessage(chatId, userId) {
  db.prepare('INSERT INTO flood_tracker (chat_id, user_id, msg_time) VALUES (?, ?, ?)')
    .run(chatId, userId, Date.now());
}

function countRecentMessages(chatId, userId, windowSeconds) {
  const since = Date.now() - windowSeconds * 1000;
  const row = db.prepare(
    'SELECT COUNT(*) as n FROM flood_tracker WHERE chat_id = ? AND user_id = ? AND msg_time >= ?'
  ).get(chatId, userId, since);
  return row.n;
}

function cleanupFloodTracker(olderThanMs = 5 * 60 * 1000) {
  db.prepare('DELETE FROM flood_tracker WHERE msg_time < ?').run(Date.now() - olderThanMs);
}

function addWarn(chatId, userId, reason) {
  db.prepare(`
    INSERT INTO warns (chat_id, user_id, count, last_reason, updated_at)
    VALUES (?, ?, 1, ?, datetime('now'))
    ON CONFLICT(chat_id, user_id) DO UPDATE SET
      count = count + 1,
      last_reason = excluded.last_reason,
      updated_at = datetime('now')
  `).run(chatId, userId, reason);
  const row = db.prepare('SELECT count FROM warns WHERE chat_id = ? AND user_id = ?')
    .get(chatId, userId);
  return row.count;
}

function resetWarns(chatId, userId) {
  db.prepare('DELETE FROM warns WHERE chat_id = ? AND user_id = ?').run(chatId, userId);
}

function getWarns(chatId, userId) {
  const row = db.prepare('SELECT count FROM warns WHERE chat_id = ? AND user_id = ?')
    .get(chatId, userId);
  return row ? row.count : 0;
}

function logAction(chatId, actorId, targetId, action, reason) {
  db.prepare(`
    INSERT INTO mod_logs (chat_id, actor_id, target_id, action, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(chatId, actorId, targetId, action, reason || null);
}

function getBlockedExtensions(chatId) {
  const rows = db.prepare(
    "SELECT value FROM blocklist WHERE chat_id = ? AND type = 'extension'"
  ).all(chatId);
  const custom = rows.map(r => r.value.toLowerCase());
  return custom.length ? custom : DEFAULT_EXT_BLOCKLIST;
}

// ── Locks ───────────────────────────────────────────────────────────────────

function ensureLocksRow(chatId, lockType) {
  const row = db.prepare('SELECT chat_id FROM locks WHERE chat_id = ? AND lock_type = ?').get(chatId, lockType);
  if (!row) {
    db.prepare('INSERT INTO locks (chat_id, lock_type, enabled) VALUES (?, ?, 0)').run(chatId, lockType);
  }
}

const LOCK_TYPES = ['links','media','forwards','stickers','gifs','inline_bots','polls','games'];

function getLocks(chatId) {
  for (const t of LOCK_TYPES) {
    ensureLocksRow(chatId, t);
  }
  return db.prepare('SELECT * FROM locks WHERE chat_id = ? ORDER BY lock_type').all(chatId);
}

// Single-query lock map for the hot path (no 8-row ensure on every message).
function getLocksMap(chatId) {
  const rows = db.prepare('SELECT lock_type, enabled FROM locks WHERE chat_id = ?').all(chatId);
  const map = {};
  for (const t of LOCK_TYPES) map[t] = false;
  for (const r of rows) map[r.lock_type] = !!r.enabled;
  return map;
}

function setLock(chatId, lockType, enabled) {
  ensureLocksRow(chatId, lockType);
  db.prepare('UPDATE locks SET enabled = ? WHERE chat_id = ? AND lock_type = ?').run(enabled ? 1 : 0, chatId, lockType);
}

// ── Blocked domains ──────────────────────────────────────────────────────────

function getBlockedDomains(chatId) {
  return db.prepare('SELECT * FROM blocked_domains WHERE chat_id = ? ORDER BY domain').all(chatId);
}

function addBlockedDomain(chatId, domain, addedBy) {
  try {
    db.prepare('INSERT INTO blocked_domains (chat_id, domain, added_by) VALUES (?, ?, ?)').run(chatId, domain.toLowerCase().trim(), addedBy || null);
    return true;
  } catch {
    return false; // duplicate
  }
}

function removeBlockedDomain(chatId, domain) {
  db.prepare('DELETE FROM blocked_domains WHERE chat_id = ? AND domain = ?').run(chatId, domain.toLowerCase().trim());
}

// ── Allowed domains ──────────────────────────────────────────────────────────

function getAllowedDomains(chatId) {
  return db.prepare('SELECT * FROM allowed_domains WHERE chat_id = ? ORDER BY domain').all(chatId);
}

function addAllowedDomain(chatId, domain, addedBy) {
  try {
    db.prepare('INSERT INTO allowed_domains (chat_id, domain, added_by) VALUES (?, ?, ?)').run(chatId, domain.toLowerCase().trim(), addedBy || null);
    return true;
  } catch {
    return false;
  }
}

function removeAllowedDomain(chatId, domain) {
  db.prepare('DELETE FROM allowed_domains WHERE chat_id = ? AND domain = ?').run(chatId, domain.toLowerCase().trim());
}

// ── Blocked files ────────────────────────────────────────────────────────────

function getBlockedFiles(chatId) {
  return db.prepare('SELECT * FROM blocked_files WHERE chat_id = ? ORDER BY created_at DESC').all(chatId);
}

function blockFile(chatId, fileId, fileName, fileHash, blockedBy) {
  try {
    db.prepare('INSERT INTO blocked_files (chat_id, file_id, file_name, file_hash, blocked_by) VALUES (?, ?, ?, ?, ?)')
      .run(chatId, fileId, fileName || null, fileHash || null, blockedBy || null);
    return true;
  } catch {
    return false;
  }
}

function unblockFile(chatId, fileId) {
  db.prepare('DELETE FROM blocked_files WHERE chat_id = ? AND file_id = ?').run(chatId, fileId);
}

// ── Mod logs ─────────────────────────────────────────────────────────────────

function getModLogs(chatId, limit = 50, offset = 0) {
  return db.prepare(
    'SELECT * FROM mod_logs WHERE chat_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(chatId, limit, offset);
}

function countModLogs(chatId) {
  const row = db.prepare('SELECT COUNT(*) as n FROM mod_logs WHERE chat_id = ?').get(chatId);
  return row.n;
}

module.exports = {
  db,
  getSettings,
  ensureChatSettings,
  recordFloodMessage,
  countRecentMessages,
  cleanupFloodTracker,
  addWarn,
  resetWarns,
  getWarns,
  logAction,
  getBlockedExtensions,
  DEFAULT_EXT_BLOCKLIST,
  // Locks
  getLocks,
  getLocksMap,
  setLock,
  // Blocked domains
  getBlockedDomains,
  addBlockedDomain,
  removeBlockedDomain,
  // Allowed domains
  getAllowedDomains,
  addAllowedDomain,
  removeAllowedDomain,
  // Blocked files
  getBlockedFiles,
  blockFile,
  unblockFile,
  // Mod logs
  getModLogs,
  countModLogs,
};