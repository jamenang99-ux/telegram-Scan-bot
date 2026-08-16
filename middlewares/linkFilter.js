const { isAdmin } = require('./flood');
const { addWarn, getSettings, logAction } = require('../db');

const INVITE_LINK_RE = /t\.me\/(joinchat\/|\+)/i;

async function linkFilterMiddleware(ctx, next) {
  const text = ctx.message && (ctx.message.text || ctx.message.caption);
  if (!text || !ctx.chat || ctx.chat.type === 'private') return next();

  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  if (await isAdmin(ctx, userId)) return next();

  if (INVITE_LINK_RE.test(text)) {
    try {
      await ctx.deleteMessage();
    } catch (err) {
      console.error('delete invite link failed:', err.message);
    }
    const settings = getSettings(chatId);
    const count = addWarn(chatId, userId, 'posted telegram invite link');
    logAction(chatId, null, userId, 'delete_link', 'telegram invite link');
    await ctx.reply(
      `⚠️ ${ctx.from.first_name} ការចែក invite link មិនត្រូវបានអនុញ្ញាតទេ (warn ${count}/${settings.max_warns})`
    );
    if (count >= settings.max_warns) {
      await ctx.telegram.banChatMember(chatId, userId);
      logAction(chatId, null, userId, 'auto_ban', 'max warns reached (link filter)');
    }
    return;
  }

  return next();
}

module.exports = { linkFilterMiddleware };
