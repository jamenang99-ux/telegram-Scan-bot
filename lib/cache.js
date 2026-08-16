/**
 * lib/cache.js — tiny TTL in-memory cache.
 *
 * Used to avoid:
 *   - getChatMember (admin check) on every incoming message
 *   - re-reading locks / domain / file blocklists from SQLite on every message
 *
 * NOTE: caches are process-local. For a single self-hosted bot this is fine.
 * Admin status may be stale up to the TTL after a demotion/promotion.
 */

function makeCache(ttlMs) {
  const store = new Map();
  return {
    get(key) {
      const e = store.get(key);
      if (!e) return undefined;
      if (e.expires <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      return e.value;
    },
    set(key, value) {
      store.set(key, { value, expires: Date.now() + ttlMs });
    },
    clear() {
      store.clear();
    },
  };
}

module.exports = {
  makeCache,
  adminCache: makeCache(3 * 60 * 1000),   // admin status: 3 min
  locksCache: makeCache(60 * 1000),       // lock toggles: 1 min
  bdomainsCache: makeCache(60 * 1000),     // blocked domains: 1 min
  adomainsCache: makeCache(60 * 1000),     // allowed domains: 1 min
  bfilesCache: makeCache(60 * 1000),       // blocked file_ids: 1 min
};
