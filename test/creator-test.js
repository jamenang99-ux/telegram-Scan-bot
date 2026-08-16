/**
 * test/creator-test.js — Manual diagnostic.
 *
 * Proves whether a given user_id is recognized as the chat creator/admin by
 * POSTing a validly-signed Telegram initData to /api/auth/validate.
 *
 * Usage:
 *   node test/creator-test.js <CHAT_ID> <USER_ID>
 *   (or set CHAT_ID / CREATOR_ID env vars)
 *
 * No real chat or user IDs are hardcoded here — pass them on the command line.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('node:crypto');
const http = require('node:http');

const TOKEN = process.env.BOT_TOKEN;
const PORT = parseInt(process.env.API_PORT, 10) || 3001;

const CHAT_ID = process.argv[2] || process.env.CHAT_ID;
const CREATOR_ID = process.argv[3] || process.env.CREATOR_ID;

function createInitData(payload) {
  const pairs = [];
  for (const [k, v] of Object.entries(payload)) pairs.push({ key: k, value: v });
  pairs.sort((a, b) => a.key.localeCompare(b.key));
  const dataCheck = pairs.map(p => p.key + '=' + p.value).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheck).digest('hex');
  return pairs.map(p => encodeURIComponent(p.key) + '=' + encodeURIComponent(p.value)).join('&') + '&hash=' + hash;
}

function apiPost(path, body) {
  return new Promise((resolve, reject) => {
    const j = JSON.stringify(body);
    const r = http.request('http://127.0.0.1:' + PORT + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(j) },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    r.on('error', reject);
    r.write(j);
    r.end();
  });
}

(async () => {
  if (!TOKEN) {
    console.error('BOT_TOKEN not found in .env');
    process.exit(1);
  }
  if (!CHAT_ID || !CREATOR_ID) {
    console.error('Usage: node test/creator-test.js <CHAT_ID> <USER_ID>');
    process.exit(1);
  }

  const payload = {
    query_id: 'AAHdF6IQAAAAAN0Xoh',
    user: JSON.stringify({ id: Number(CREATOR_ID), first_name: 'TestUser', username: 'testuser', language_code: 'en' }),
    auth_date: String(Math.floor(Date.now() / 1000)),
    start_param: 'chat_' + CHAT_ID,
  };
  const initData = createInitData(payload);
  const response = await apiPost('/api/auth/validate', { initData });
  console.log('HTTP ' + response.status);
  console.log(JSON.stringify(response.body, null, 2));
  if (response.status === 200) {
    console.log('\nThis user IS recognized as creator/admin — returns 200 (not 403).');
  } else if (response.status === 403) {
    console.log('\nThis user is NOT an admin/creator in the chat — returns 403.');
  }
})();
