/**
 * api-standalone.js — Standalone API server entry (for testing without the bot)
 * Uses the bot instance only for admin-check Telegram calls.
 */
require('dotenv').config();
const { Telegraf } = require('telegraf');
const { startApiServer } = require('./api/server');

if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN required in .env');
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const port = parseInt(process.env.API_PORT, 10) || 3001;

startApiServer(bot, port)
  .then(() => console.log(`✅ API server running on http://localhost:${port}`))
  .catch(err => { console.error('❌ Failed:', err.message); process.exit(1); });