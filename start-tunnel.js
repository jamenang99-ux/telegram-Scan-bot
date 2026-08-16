/**
 * start-tunnel.js — Start ngrok tunnel to expose the API server
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const NGROK_BIN = path.join(
  process.env.APPDATA || path.join(process.env.HOME, 'AppData', 'Roaming'),
  'npm', 'ngrok.cmd'
);

const ngrokAuthToken = process.env.NGROK_AUTH_TOKEN || '';
const port = parseInt(process.env.API_PORT, 10) || 3001;

if (!fs.existsSync(NGROK_BIN)) {
  console.error('ngrok not found. Install: npm install -g ngrok');
  process.exit(1);
}
if (ngrokAuthToken) {
  execSync(NGROK_BIN + ' config add-authtoken ' + ngrokAuthToken, { stdio: 'pipe' });
  console.log('ngrok authtoken configured');
}
console.log('Starting ngrok tunnel -> http://localhost:' + port);
const ngrok = spawn(NGROK_BIN, ['http', String(port), '--log=stdout'], {
  stdio: ['ignore', 'pipe', 'pipe'], shell: true,
});
ngrok.stdout.on('data', (data) => {
  const txt = data.toString();
  const m = txt.match(/https?:\/\/[a-zA-Z0-9_-]+\.ngrok[^\s]*/);
  if (m) {
    const url = m[0];
    console.log('\nTUNNEL ACTIVE: ' + url);
    console.log('Mini App: ' + url + '/admin/');
    console.log('Set APP_URL=' + url + ' in .env\n');
  }
  process.stdout.write(txt);
});
ngrok.stderr.on('data', (d) => process.stderr.write(d.toString()));
ngrok.on('close', (c) => { console.log('tunnel exited code ' + c); process.exit(c); });
process.on('SIGINT', () => { ngrok.kill('SIGTERM'); process.exit(0); });
process.on('SIGTERM', () => { ngrok.kill('SIGTERM'); process.exit(0); });
