/**
 * test/auth-test.js — Automated verification of Mini App auth flow
 *
 * Tests three cases:
 *   1. Valid initData (HMAC matches)     → 200 + JWT
 *   2. Tampered initData (hash changed)   → 401 "hash mismatch"
 *   3. Valid initData + non-existent chat → 404 (bot can't verify admin)
 *
 * Usage: node test/auth-test.js
 * Requires BOT_TOKEN in .env (loaded via dotenv).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('node:crypto');
const http = require('node:http');

const TOKEN = process.env.BOT_TOKEN;
const PORT = parseInt(process.env.API_PORT, 10) || 3001;
const BASE = `http://localhost:${PORT}`;

if (!TOKEN) {
  console.error('❌ BOT_TOKEN required in .env');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function createInitData(payload, secret) {
  // Sort keys alphabetically, join as key=value with \n, HMAC with WebAppData secret
  const pairs = [];
  for (const [k, v] of Object.entries(payload)) {
    if (k !== 'hash') pairs.push({ key: k, value: v });
  }
  pairs.sort((a, b) => a.key.localeCompare(b.key));
  const dataCheck = pairs.map(p => `${p.key}=${p.value}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(secret).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheck).digest('hex');

  // Build query string with hash appended
  const qs = pairs.map(p => `${p.key}=${encodeURIComponent(p.value)}`).join('&') + `&hash=${hash}`;
  return qs;
}

function apiPost(path, body, token) {
  return new Promise((resolve, reject) => {
    const j = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(j) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(`${BASE}${path}`, {
      method: 'POST',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.write(j);
    req.end();
  });
}

function apiGet(path, token) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    http.get(`${BASE}${path}`, { headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(name, ok, detail) {
    if (ok) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.log(`  ❌ ${name} — ${detail}`);
      failed++;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Health check
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n📡 Health check');
  const health = await apiGet('/api/health');
  assert('API server is reachable', health.status === 200, `${health.status} ${JSON.stringify(health.body)}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Valid initData (no chat_id) → should return 200 + JWT
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n🔐 CASE 1: Valid initData (HMAC matches, no chat)');
  const validPayload = {
    query_id: 'AAHdF6IQAAAAAN0Xoh',
    user: JSON.stringify({
      id: 123456789,
      first_name: 'TestUser',
      username: 'testuser',
      language_code: 'en',
    }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  };
  const validInitData = createInitData(validPayload, TOKEN);

  const r1 = await apiPost('/api/auth/validate', { initData: validInitData });
  assert('Returns 200', r1.status === 200, `got ${r1.status}: ${JSON.stringify(r1.body).slice(0, 80)}`);
  assert('Has token in response', r1.body?.ok === true && !!r1.body?.token, 'no token returned');
  assert('Has user info', r1.body?.user?.id === 123456789, 'wrong user id');

  const jwt = r1.body?.token;
  assert('JWT is a string', typeof jwt === 'string' && jwt.split('.').length === 3, 'invalid JWT format');

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Tampered initData → should return 401
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n🔐 CASE 2: Tampered initData (hash modified)');
  // Take the valid initData and corrupt the hash
  const tamperedInitData = validInitData.replace(/hash=[a-f0-9]+/, 'hash=0000000000000000000000000000000000000000000000000000000000000000');

  const r2 = await apiPost('/api/auth/validate', { initData: tamperedInitData });
  assert('Returns 401', r2.status === 401, `got ${r2.status}: ${JSON.stringify(r2.body)}`);
  assert('Error says hash mismatch', r2.body?.error?.toLowerCase().includes('hash'), `got: ${r2.body?.error}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Expired initData → should return 401
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n🔐 CASE 2b: Expired initData (auth_date > 24h old)');
  const expiredPayload = {
    ...validPayload,
    auth_date: String(Math.floor(Date.now() / 1000) - 90000), // 25 hours ago
  };
  const expiredInitData = createInitData(expiredPayload, TOKEN);

  const r2b = await apiPost('/api/auth/validate', { initData: expiredInitData });
  assert('Returns 401', r2b.status === 401, `got ${r2b.status}: ${JSON.stringify(r2b.body)}`);
  assert('Error says expired', r2b.body?.error?.toLowerCase().includes('expired'), `got: ${r2b.body?.error}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Valid initData + chat where bot is NOT a member → should return 404
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n🔐 CASE 3: Valid initData + chat where bot is NOT a member');
  const chatPayload = {
    ...validPayload,
    start_param: 'chat_-999999999999', // non-existent chat
  };
  const chatInitData = createInitData(chatPayload, TOKEN);

  const r3 = await apiPost('/api/auth/validate', { initData: chatInitData });
  assert('Returns 404', r3.status === 404, `got ${r3.status}: ${JSON.stringify(r3.body).slice(0, 120)}`);
  assert('Error mentions chat verification', r3.body?.error?.toLowerCase().includes('chat') || r3.body?.error?.toLowerCase().includes('verify'), `got: ${r3.body?.error}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Protected route without JWT → should return 401
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n🔐 CASE 4: Protected route without JWT');
  const r4 = await apiGet('/api/chat/1/settings');
  assert('Returns 401', r4.status === 401, `got ${r4.status}: ${JSON.stringify(r4.body)}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════
  const total = passed + failed;
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📊 RESULTS: ${passed}/${total} passed, ${failed} failed`);
  console.log(`${'═'.repeat(50)}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('💥 Test suite crashed:', err.message);
  process.exit(1);
});