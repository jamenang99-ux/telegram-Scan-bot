require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

const { floodMiddleware } = require('./middlewares/flood');
const { enforcementMiddleware } = require('./middlewares/enforcement');
const { fileFilterMiddleware } = require('./middlewares/fileFilter');
const { linkFilterMiddleware } = require('./middlewares/linkFilter');
const { registerAdminCommands } = require('./commands/admin');
const { registerWelcomeHandler } = require('./commands/welcome');
const { cleanupFloodTracker, db } = require('./db');
const { startApiServer } = require('./api/server');

// ── Boot checks ──────────────────────────────────────────────────────────────

if (!process.env.BOT_TOKEN) {
  console.error('❌ Missing BOT_TOKEN in .env — copy .env.example to .env and fill it in.');
  process.exit(1);
}

const tokenPreview = process.env.BOT_TOKEN.slice(0, 10) + '...';
console.log(`[boot] BOT_TOKEN found (${tokenPreview})`);

// ── Bot init ─────────────────────────────────────────────────────────────────

const bot = new Telegraf(process.env.BOT_TOKEN);

// ── Middleware pipeline (order: flood → file filter → link filter) ───────────

bot.on('message', floodMiddleware);
bot.on('message', enforcementMiddleware);
bot.on('message', fileFilterMiddleware);
bot.on('message', linkFilterMiddleware);

// ── Commands ─────────────────────────────────────────────────────────────────

/**
 * /start — show welcome + command overview (works in both private & group)
 */
bot.command('start', async (ctx) => {
  const isGroup = ctx.chat && ctx.chat.type !== 'private';
  const botInfo = ctx.botInfo || await ctx.telegram.getMe();

  const welcome = isGroup
    ? `👋 *${botInfo.first_name} កំពុងដំណើរការ!*\n\n` +
      `ខ្ញុំជា bot សម្រាប់គ្រប់គ្រងក្រុម — ច្រោះ flood, file គ្រោះថ្នាក់, និង invite link ។\n` +
      `សូមប្រាកដថាខ្ញុំជា admin ដើម្បីដំណើរការបានពេញលេញ។`
    : `👋 សួស្តី! ខ្ញុំជា *${botInfo.first_name}* — ម៉ូឌែលបូតសម្រាប់ក្រុម MME\n\n` +
      `ខ្ញុំអាច៖\n` +
      `🛡 ច្រោះ flood (spam)\n` +
      `🔞 ច្រោះ file គ្រោះថ្នាក់ (.exe, .apk, .bat...)\n` +
      `🔗 ច្រោះ Telegram invite link\n` +
      `⚠️ ព្រមាន + បណ្តេញដោយស្វ័យប្រវត្តិ\n` +
      `👋 ស្វាគមន៍សមាជិកថ្មី + CAPTCHA\n\n` +
      `បន្ថែមខ្ញុំទៅក្រុមរបស់អ្នក ហើយតែងតាំងជា admin ដើម្បីចាប់ផ្តើម!`;

  // ⚙️ Manage button opens the Mini App. A `web_app` button URL MUST be a
  // Telegram Web App registered to this bot (configured in @BotFather). Until
  // APP_URL is set, fall back to the "Add to Group" link instead of sending an
  // invalid web_app button (which Telegram rejects with BUTTON_URL_INVALID).
  const appUrl = process.env.APP_URL;
  const manageBtn = appUrl
    ? [{ text: '⚙️ Open Panel', url: appUrl }]
    : [{ text: '➕ Add to Group', url: `https://t.me/${botInfo.username}?startgroup=true` }];

  const keyboard = isGroup
    ? [manageBtn, [{ text: '❓ Help', callback_data: 'help' }]]
    : [
        manageBtn,
        [{ text: '❓ Help', callback_data: 'help' }],
        [{ text: '➕ Add to Group', url: `https://t.me/${botInfo.username}?startgroup=true` }],
      ];

  try {
    await ctx.replyWithMarkdown(welcome, {
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch (err) {
    if (/BUTTON_(TYPE|URL)_INVALID/.test(err?.message || '')) {
      // Web App URL not registered yet — deliver welcome without the button
      await ctx.replyWithMarkdown(welcome, {
        reply_markup: { inline_keyboard: [[{ text: '❓ Help', callback_data: 'help' }]] },
      });
    } else {
      throw err;
    }
  }
});

/**
 * /manage — open Mini App (works in groups to scope to current chat)
 */
bot.command('manage', async (ctx) => {
  const isGroup = ctx.chat && ctx.chat.type !== 'private';
  const botInfo = ctx.botInfo || await ctx.telegram.getMe();

  // The Mini App must be reachable at a public HTTPS URL that is registered as
  // this bot's Web App in @BotFather. Without APP_URL we cannot open it.
  const baseUrl = process.env.APP_URL;
  if (!baseUrl) {
    await ctx.reply(
      '⚙️ Mini App URL is not configured yet.\n' +
      'Set APP_URL in .env to your public Mini App URL (e.g. the ngrok HTTPS URL) ' +
      'and register it as a Web App via @BotFather.',
    );
    return;
  }

  const appUrl = isGroup ? `${baseUrl}?start_param=chat_${ctx.chat.id}` : baseUrl;
  const label = isGroup ? '⚙️ Manage This Group' : '⚙️ Open Management Panel';

  try {
    await ctx.reply('⚙️ Open management panel:', {
      reply_markup: {
        inline_keyboard: [[{ text: label, url: appUrl }]],
      },
    });
  } catch (err) {
    if (/BUTTON_(TYPE|URL)_INVALID/.test(err?.message || '')) {
      await ctx.reply(
        '⚙️ The configured APP_URL is not a registered Telegram Web App.\n' +
        'Configure it in @BotFather → /newapp (or /setmenubutton) using the same URL.',
      );
    } else {
      throw err;
    }
  }
});

/**
 * /help — show full command list
 */
bot.command('help', async (ctx) => {
  const helpText =
    `📋 *បញ្ជីពាក្យបញ្ជា*\n\n` +
    `*/start* — បង្ហាញព័ត៌មានស្វាគមន៍\n` +
    `*/help* — បញ្ជីពាក្យបញ្ជានេះ\n\n` +
    `*ពាក្យបញ្ជាគ្រប់គ្រង (ត្រូវការ admin):*\n` +
    `*/ban* (reply) — បណ្តេញចេញពីក្រុម\n` +
    `*/unban* (reply) — លុបការបណ្តេញចេញ\n` +
    `*/kick* (reply) — បណ្តេញចេញ (អាចចូលវិញ)\n` +
    `*/mute* (reply) [នាទី] — បិទសំឡេង\n` +
    `*/unmute* (reply) — បើកសំឡេងវិញ\n` +
    `*/warn* (reply) [មូលហេតុ] — ព្រមាន\n` +
    `*/unwarn* (reply) — លុបព្រមាន\n` +
    `*/warns* (reply) — មើលចំនួនព្រមាន`;

  await ctx.replyWithMarkdown(helpText);
});

// ── Inline button handler ────────────────────────────────────────────────────

bot.action('help', async (ctx) => {
  await ctx.answerCbQuery();
  const helpText =
    `📋 *បញ្ជីពាក្យបញ្ជា*\n\n` +
    `*/start* — បង្ហាញព័ត៌មានស្វាគមន៍\n` +
    `*/help* — បញ្ជីពាក្យបញ្ជា\n\n` +
    `*ពាក្យបញ្ជាគ្រប់គ្រង (admin តែប៉ុណ្ណោះ):*\n` +
    `*/ban* (reply) — បណ្តេញចេញពីក្រុម\n` +
    `*/unban* (reply) — លុបការបណ្តេញចេញ\n` +
    `*/kick* (reply) — បណ្តេញចេញ (អាចចូលវិញ)\n` +
    `*/mute* (reply) [នាទី] — បិទសំឡេង\n` +
    `*/unmute* (reply) — បើកសំឡេងវិញ\n` +
    `*/warn* (reply) [មូលហេតុ] — ព្រមាន\n` +
    `*/unwarn* (reply) — លុបព្រមាន\n` +
    `*/warns* (reply) — មើលចំនួនព្រមាន`;
  await ctx.replyWithMarkdown(helpText);
});

// ── Admin commands ───────────────────────────────────────────────────────────

registerAdminCommands(bot);
registerWelcomeHandler(bot);

// ── Global error handler ─────────────────────────────────────────────────────

bot.catch((err, ctx) => {
  const desc = ctx.updateType || 'unknown';
  console.error(`[error] unhandled in ${desc}:`, err?.message || err);
  if (err?.stack) console.error(err.stack);
});

// ── Periodic cleanup ─────────────────────────────────────────────────────────

setInterval(() => {
  try {
    cleanupFloodTracker();
  } catch (err) {
    console.error('[cleanup] flood tracker error:', err.message);
  }
}, 5 * 60 * 1000);

// ── Launch ───────────────────────────────────────────────────────────────────

let apiServer = null;
const fs = require('fs');
function logApi(msg) { try { fs.appendFileSync('api-status.log', msg + '\n'); } catch (e) {} }

// Start the API server for the Mini App backend INDEPENDENTLY of bot.launch()
// resolving. A long-poll cycle or a slow/blocking update handler can delay
// launch()'s promise and starve the API startup, leaving the Mini App unreachable
// even though the bot is polling fine. The server only needs the `bot` reference
// for per-request admin checks, so it is safe to start it immediately.
const apiPort = parseInt(process.env.API_PORT, 10) || 3001;
logApi('starting API server on ' + apiPort);
startApiServer(bot, apiPort)
  .then((server) => {
    apiServer = server;
    logApi('API UP on ' + apiPort);
    console.log(`   Mini App API: http://localhost:${apiPort}`);
    console.log(`   Manage via:  /manage or ⚙️ Manage button in chat`);
  })
  .catch((err) => {
    logApi('API FAIL: ' + (err && err.stack || err));
    console.error('❌ Failed to start API server:', err.message);
    // Bot still runs without the API — non-fatal
  });

bot.launch()
  .then(() => {
    console.log('✅ MME moderation bot started (long-polling).');
    console.log(`   Database: ${db ? 'connected' : 'MISSING'}`);
  })
  .catch((err) => {
    console.error('❌ Failed to launch bot:', err.message);
    process.exit(1);
  });

process.once('SIGINT', () => {
  bot.stop('SIGINT');
  if (apiServer) apiServer.close();
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  if (apiServer) apiServer.close();
});