/**
 * test/auth-test-403.js — Real 403 admin-check verification
 *
 * Tests that a valid initData + valid existing chat + non-admin user
 * returns 403 via the getChatMember check.
 *
 * BEFORE RUNNING:
 *   1. Add @Tomneung_bot to a test group
 *   2. Promote it to admin (needed for it to call getChatMember)
 *   3. As a regular member (NON-admin), send ANY message to that group
 *      (so the bot knows your user_id exists in the chat)
 *   4. Set the two env vars below:
 *      TEST_CHAT_ID=<your test group id>   (e.g. -1001234567890)
 *      TEST_USER_ID=<your telegram user id> (the non-admin member)
 *   5. Run: node test/auth-test-403.js
 *
 * If you don't have these ids handy:
 *   - Get chat_id: add @getidsbot to your group and send /id
 *   - Get user_id: message @getidsbot in private
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('node:crypto');
const http = require('node:http');

const TOKEN = process.env.BOT_TOKEN;
const PORT = parseInt(process.env.API_PORT, 10) || 3001;
const BASE = `http://localhost:${PORT}`;
const CHAT_ID = parseInt(process.env.TEST_CHAT_ID, 10);
const USER_ID = parseInt(process.env.TEST_USER_ID, 10);

if (!TOKEN) { console.error('❌ BOT_TOKEN required'); process.exit(1); }
if (!CHAT_ID) { console.error('❌ Set TEST_CHAT_ID=<your test group id> in .env or as env var'); process.exit(1); }
if (!USER_ID) { console.error('❌ Set TEST_USER_ID=<your telegram user id> in .env or as env var'); process.exit(1); }

// ── Helpers ──────────────────────────────────────────────────────────────────

function createInitData(payload) {
  const pairs = [];
  for (const [k, v] of Object.entries(payload)) {
    if (k !== 'hash') pairs.push({ key: k, value: v });
  }
  pairs.sort((a, b) => a.key.localeCompare(b.key));
  const dataCheck = pairs.map(p => `${p.key}=${p.value}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheck).digest('hex');

  const qs = pairs.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&') + `&hash=${hash}`;
  return qs;
}

function apiPost(path, body) {
  return new Promise((resolve, reject) => {
    const j = JSON.stringify(body);
    const req = http.request(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(j) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(j);
    req.end();
  });
}

// ── Step 1: Verify the bot can see the chat ──────────────────────────────────

async function main() {
  console.log(`\n🔍 Test setup:`);
  console.log(`   Bot:     @Tomneung_bot`);
  console.log(`   Chat ID: ${CHAT_ID}`);
  console.log(`   User ID: ${USER_ID} (should NOT be admin in this chat)`);
  console.log(`   API:     ${BASE}`);

  // ── Step 2: Verify API is reachable ──────────────────────────────
  console.log('\n📡 Checking API server...');
  const health = await new Promise((resolve) => {
    http.get(`${BASE}/api/health`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', e => resolve({ error: e.message }));
  });
  if (health.error) {
    console.error(`   ❌ API server not reachable: ${health.error}`);
    console.error(`   Start it: node api-standalone.js`);
    process.exit(1);
  }
  console.log(`   ✅ API server reachable`);

  // ── Step 3: Create valid initData pointing to this chat ──────────
  console.log('\n🔐 Creating valid initData with non-admin user...');
  const payload = {
    query_id: 'AAHdF6IQAAAAAN0Xoh',
    user: JSON.stringify({
      id: USER_ID,
      first_name: 'NonAdminTest',
      username: 'nonadmintest',
      language_code: 'en',
    }),
    auth_date: String(Math.floor(Date.now() / 1000)),
    start_param: `chat_${CHAT_ID}`,
  };
  const initData = createInitData(payload);

  // ── Step 4: Send to auth endpoint ────────────────────────────────
  console.log(`\n📤 POST /api/auth/validate (user=${USER_ID}, chat=${CHAT_ID})`);
  const result = await apiPost('/api/auth/validate', { initData });

  console.log(`   Status: ${result.status}`);
  console.log(`   Body:   ${JSON.stringify(result.body, null, 2)}`);

  if (result.status === 403) {
    console.log(`\n✅  TEST PASSED — Non-admin user correctly rejected with 403`);
    console.log(`   Reason: "${result.body?.error}"`);
    console.log(`   User status in chat: "${result.body?.user_status}"`);
  } else if (result.status === 404) {
    console.log(`\n⚠️  Bot may not be in chat ${CHAT_ID}.`);
    console.log(`   Add @Tomneung_bot to your test group and promote to admin, then retry.`);
    process.exit(1);
  } else if (result.status === 200) {
    console.log(`\n❌  TEST FAILED — User WAS accepted as admin.`);
    console.log(`   If you ARE an admin in chat ${CHAT_ID}, use a NON-admin account for the test.`);
    console.log(`   Or set TEST_USER_ID to a different user who is NOT an admin.`);
    process.exit(1);
  } else {
    console.log(`\n❌  Unexpected response. Check the bot and chat setup.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('💥 Error:', err.message);
  process.exit(1);
});