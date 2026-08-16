CREATE TABLE IF NOT EXISTS chats (
  chat_id     INTEGER PRIMARY KEY,
  title       TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users_in_chat (
  chat_id         INTEGER NOT NULL,
  user_id         INTEGER NOT NULL,
  username        TEXT,
  is_admin        INTEGER DEFAULT 0,
  joined_at       TEXT DEFAULT (datetime('now')),
  captcha_passed  INTEGER DEFAULT 0,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS warns (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id      INTEGER NOT NULL,
  user_id      INTEGER NOT NULL,
  count        INTEGER DEFAULT 0,
  last_reason  TEXT,
  updated_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_settings (
  chat_id            INTEGER PRIMARY KEY,
  flood_limit        INTEGER DEFAULT 5,
  flood_seconds      INTEGER DEFAULT 10,
  max_warns          INTEGER DEFAULT 3,
  mute_duration_min  INTEGER DEFAULT 60,
  captcha_enabled    INTEGER DEFAULT 1,
  welcome_template   TEXT DEFAULT 'សូមស្វាគមន៍ {name} មកកាន់ {chat}!'
);

CREATE TABLE IF NOT EXISTS mod_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id     INTEGER NOT NULL,
  actor_id    INTEGER,
  target_id   INTEGER,
  action      TEXT NOT NULL,
  reason      TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flood_tracker (
  chat_id   INTEGER NOT NULL,
  user_id   INTEGER NOT NULL,
  msg_time  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS blocklist (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id  INTEGER NOT NULL,
  type     TEXT NOT NULL CHECK(type IN ('extension','domain')),
  value    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flood_chat_user ON flood_tracker(chat_id, user_id, msg_time);
CREATE INDEX IF NOT EXISTS idx_blocklist_chat ON blocklist(chat_id, type);

-- ── Locks (link/media/forward/sticker/gif/inline/poll locks) ────────────────
CREATE TABLE IF NOT EXISTS locks (
  chat_id   INTEGER NOT NULL,
  lock_type TEXT    NOT NULL CHECK(lock_type IN ('links','media','forwards','stickers','gifs','inline_bots','polls','games')),
  enabled   INTEGER DEFAULT 0,
  created_at TEXT   DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, lock_type)
);

-- ── Blocked domains (t.me/joinchat handled by the invite-link regex) ────────
CREATE TABLE IF NOT EXISTS blocked_domains (
  chat_id   INTEGER NOT NULL,
  domain    TEXT    NOT NULL,
  added_by  INTEGER,
  created_at TEXT   DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, domain)
);

-- ── Allowed domains (exempt from link filter) ───────────────────────────────
CREATE TABLE IF NOT EXISTS allowed_domains (
  chat_id   INTEGER NOT NULL,
  domain    TEXT    NOT NULL,
  added_by  INTEGER,
  created_at TEXT   DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, domain)
);

-- ── Blocked files (by file_id for fingerprint blocking) ─────────────────────
CREATE TABLE IF NOT EXISTS blocked_files (
  chat_id    INTEGER NOT NULL,
  file_id    TEXT    NOT NULL,
  file_name  TEXT,
  file_hash  TEXT,
  blocked_by INTEGER,
  created_at TEXT    DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, file_id)
);
