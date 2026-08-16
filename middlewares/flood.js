const { getSettings, recordFloodMessage, countRecentMessages, logAction } = require('../db');
const { adminCache } = require('../lib/cache');

async function isAdmin(ctx, userId) {
  if (!ctx.chat) return false;
  const key = ctx.chat.id + ':' + userId;
  const cached = adminCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    const ok = ['administrator', 'creator'].includes(member.status);
    adminCache.set(key, ok); // cache only on success; never cache errors
    return ok;
  } catch {
    return false;
  }
}

async function floodMiddleware(ctx, next) {
  if (!ctx.chat || ctx.chat.type === 'private' || !ctx.from) return next();

  const chatId = ctx.chat.id;
  const userId = ctx.from.id;

  if (await isAdmin(ctx, userId)) return next();

  const settings = getSettings(chatId);
  recordFloodMessage(chatId, userId);

  const recent = countRecentMessages(chatId, userId, settings.flood_seconds);

  if (recent > settings.flood_limit) {
    try {
      const untilDate = Math.floor(Date.now() / 1000) + settings.mute_duration_min * 60;
      await ctx.telegram.restrictChatMember(chatId, userId, {
        permissions: { can_send_messages: false },
        until_date: untilDate,
      });
      await ctx.reply(
        `🔇 ${ctx.from.first_name} ត្រូវបាន mute រយៈពេល ${settings.mute_duration_min} នាទី (flood detected)`,
        { reply_to_message_id: ctx.message.message_id }
      );
      logAction(chatId, null, userId, 'auto_mute', `flood: ${recent} msgs in ${settings.flood_seconds}s`);
    } catch (err) {
      console.error('flood mute failed:', err.message);
    }
    return; // stop pipeline, don't pass flood message further
  }

  return next();
}

module.exports = { floodMiddleware, isAdmin };
