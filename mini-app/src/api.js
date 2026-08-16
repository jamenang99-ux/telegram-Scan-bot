/**
 * API client for the Mini App
 * Handles auth flow: initData → JWT → authorized requests
 */

const API_BASE = import.meta.env.PROD ? '/api' : '/api';

let authState = {
  token: null,
  user: null,
  chat: null,
  initialized: false,
};

/**
 * Initialize: validate initData with backend, get JWT.
 * Can optionally specify a chat_id if passed via start_param.
 */
export async function initialize(chatId) {
  const tw = window.Telegram?.WebApp;
  const initData = tw?.initData || '';

  if (!initData) {
    throw new Error('No Telegram initData available — open this app from Telegram');
  }

  const body = { initData };
  if (chatId) body.chat_id = chatId;

  const res = await fetch(`${API_BASE}/auth/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Auth failed (${res.status})`);
  }

  authState = {
    token: data.token,
    user: data.user,
    chat: data.chat,
    adminStatus: data.admin_status,
    initialized: true,
  };

  return authState;
}

/**
 * Make an authenticated API request.
 */
async function api(path, options = {}) {
  if (!authState.token) {
    throw new Error('Not authenticated — call initialize() first');
  }

  const url = `${API_BASE}${path}`;
  const headers = {
    'Authorization': `Bearer ${authState.token}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const res = await fetch(url, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

// ── Convenience wrappers ──────────────────────────────────────────────────

export function getSettings(chatId) {
  return api(`/chat/${chatId}/settings`);
}

export function updateSettings(chatId, fields) {
  return api(`/chat/${chatId}/settings`, { method: 'POST', body: fields });
}

export function getLocks(chatId) {
  return api(`/chat/${chatId}/locks`);
}

export function setLock(chatId, lockType, enabled) {
  return api(`/chat/${chatId}/locks`, { method: 'POST', body: { lock_type: lockType, enabled } });
}

export function getBlocklist(chatId) {
  return api(`/chat/${chatId}/blocklist`);
}

export function addToBlocklist(chatId, type, value, extra = {}) {
  return api(`/chat/${chatId}/blocklist`, { method: 'POST', body: { type, value, ...extra } });
}

export function removeFromBlocklist(chatId, type, value) {
  return api(`/chat/${chatId}/blocklist/${type}/${encodeURIComponent(value)}`, { method: 'DELETE' });
}

export function getModLogs(chatId, limit = 50, offset = 0) {
  return api(`/chat/${chatId}/modlogs?limit=${limit}&offset=${offset}`);
}

export function getAuthState() {
  return authState;
}