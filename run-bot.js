// run-bot.js — detach the bot from the parent shell so it keeps running
// after this script exits (avoids SIGHUP from the launching shell).
const { spawn } = require('child_process');
const fs = require('fs');
const out = fs.openSync('bot.startup.log', 'a');
const child = spawn('node', ['bot.js'], {
  detached: true,
  stdio: ['ignore', out, out],
  windowsHide: true,
});
child.unref();
console.log('bot launched as pid', child.pid);
