require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('node:crypto');
const TOKEN = process.env.BOT_TOKEN;

// Create a valid initData
const payload = {
  query_id: 'AAHdF6IQAAAAAN0Xoh',
  user: JSON.stringify({ id: 123456789, first_name: 'Test', username: 'test', language_code: 'en' }),
  auth_date: String(Math.floor(Date.now() / 1000)),
};
const pairs = [];
for (const [k, v] of Object.entries(payload)) pairs.push({ key: k, value: v });
pairs.sort((a, b) => a.key.localeCompare(b.key));
const dataCheck = pairs.map(p => p.key + '=' + p.value).join('\n');
const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
const hash = crypto.createHmac('sha256', secretKey).update(dataCheck).digest('hex');
const qs = pairs.map(p => encodeURIComponent(p.key) + '=' + encodeURIComponent(p.value)).join('&') + '&hash=' + hash;

// For curl commands, build a JSON body with the initData string
const body = JSON.stringify({ initData: qs });
const tamperedBody = JSON.stringify({ initData: qs.replace(/hash=[a-f0-9]+/, 'hash=' + '0'.repeat(64)) });

// Valid + chat_id
const chatPayload = { ...payload, start_param: 'chat_-999999999999' };
const chatPairs = [];
for (const [k, v] of Object.entries(chatPayload)) chatPairs.push({ key: k, value: v });
chatPairs.sort((a, b) => a.key.localeCompare(b.key));
const chatDataCheck = chatPairs.map(p => p.key + '=' + p.value).join('\n');
const chatHash = crypto.createHmac('sha256', secretKey).update(chatDataCheck).digest('hex');
const chatQs = chatPairs.map(p => encodeURIComponent(p.key) + '=' + encodeURIComponent(p.value)).join('&') + '&hash=' + chatHash;
const chatBody = JSON.stringify({ initData: chatQs });

const platform = process.platform === 'win32' ? 'Windows' : 'Linux/Mac';
const wrap = platform === 'Windows' ? '\"' : '\'';

console.log('═══ CURL COMMANDS FOR VERIFICATION ═══');
console.log('');
console.log('── CASE 1: Valid initData → 200 + JWT ──');
console.log('curl -s -X POST http://localhost:3001/api/auth/validate ^');
console.log('  -H "Content-Type: application/json" ^');
console.log('  -d ' + wrap + body + wrap);
console.log('');
console.log('── CASE 2: Tampered initData → 401 ──');
console.log('curl -s -X POST http://localhost:3001/api/auth/validate ^');
console.log('  -H "Content-Type: application/json" ^');
console.log('  -d ' + wrap + tamperedBody + wrap);
console.log('');
console.log('── CASE 3: Valid initData + non-existent chat → 404/403 ──');
console.log('curl -s -X POST http://localhost:3001/api/auth/validate ^');
console.log('  -H "Content-Type: application/json" ^');
console.log('  -d ' + wrap + chatBody + wrap);
console.log('');
console.log('═══ END ═══');