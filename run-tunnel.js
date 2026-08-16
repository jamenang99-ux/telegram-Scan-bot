// run-tunnel.js — launch the ngrok tunnel detached so it survives the shell.
const { spawn } = require('child_process');
const fs = require('fs');
const out = fs.openSync('tunnel.log', 'a');
const child = spawn('node', ['start-tunnel.js'], {
  detached: true,
  stdio: ['ignore', out, out],
  windowsHide: true,
});
child.unref();
console.log('tunnel launched as pid', child.pid);
