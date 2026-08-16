const { isAdmin } = require('../middlewares/flood');
const { addWarn, resetWarns, getWarns, getSettings, logAction } = require('../db');

function getReplyTargetId(ctx) {
  return ctx.message.reply_to_message ? ctx.message.reply_to_message.from.id : null;
}

function registerAdminCommands(bot) {
  bot.command('ban', async (ctx) => {
    if (!(await isAdmin(ctx, ctx.from.id))) return;
    const targetId = getReplyTargetId(ctx);
    if (!targetId) return ctx.reply('សូម reply message របស់អ្នកប្រើដែលចង់ ban');
    await ctx.telegram.banChatMember(ctx.chat.id, targetId);
    logAction(ctx.chat.id, ctx.from.id, targetId, 'ban', 'manual');
    await ctx.reply('✅ Banned');
  });

  bot.command('unban', async (ctx) => {
    if (!(await isAdmin(ctx, ctx.from.id))) return;
    const targetId = getReplyTargetId(ctx);
    if (!targetId) return ctx.reply('សូម reply message របស់អ្នកប្រើដែលចង់ unban');
    await ctx.telegram.unbanChatMember(ctx.chat.id, targetId);
    logAction(ctx.chat.id, ctx.from.id, targetId, 'unban', 'manual');
    await ctx.reply('✅ Unbanned');
  });

  bot.command('kick', async (ctx) => {
    if (!(await isAdmin(ctx, ctx.from.id))) return;
    const targetId = getReplyTargetId(ctx);
    if (!targetId) return ctx.reply('សូម reply message របស់អ្នកប្រើដែលចង់ kick');
    await ctx.telegram.banChatMember(ctx.chat.id, targetId);
    await ctx.telegram.unbanChatMember(ctx.chat.id, targetId); // ban+unban = kick (not permanent)
    logAction(ctx.chat.id, ctx.from.id, targetId, 'kick', 'manual');
    await ctx.reply('✅ Kicked');
  });

  bot.command('mute', async (ctx) => {
    if (!(await isAdmin(ctx, ctx.from.id))) return;
    const targetId = getReplyTargetId(ctx);
    if (!targetId) return ctx.reply('សូម reply message របស់អ្នកប្រើដែលចង់ mute');
    const parts = ctx.message.text.split(' ');
    const minutes = parts[1] ? parseInt(parts[1], 10) : 60;
    const untilDate = Math.floor(Date.now() / 1000) + minutes * 60;
    await ctx.telegram.restrictChatMember(ctx.chat.id, targetId, {
      permissions: { can_send_messages: false },
      until_date: untilDate,
    });
    logAction(ctx.chat.id, ctx.from.id, targetId, 'mute', `${minutes}min manual`);
    await ctx.reply(`✅ Muted ${minutes} នាទី`);
  });

  bot.command('unmute', async (ctx) => {
    if (!(await isAdmin(ctx, ctx.from.id))) return;
    const targetId = getReplyTargetId(ctx);
    if (!targetId) return ctx.reply('សូម reply message របស់អ្នកប្រើដែលចង់ unmute');
    await ctx.telegram.restrictChatMember(ctx.chat.id, targetId, {
      permissions: {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
      },
    });
    logAction(ctx.chat.id, ctx.from.id, targetId, 'unmute', 'manual');
    await ctx.reply('✅ Unmuted');
  });

  bot.command('warn', async (ctx) => {
    if (!(await isAdmin(ctx, ctx.from.id))) return;
    const targetId = getReplyTargetId(ctx);
    if (!targetId) return ctx.reply('សូម reply message របស់អ្នកប្រើដែលចង់ warn');
    const reason = ctx.message.text.split(' ').slice(1).join(' ') || 'manual warn';
    const settings = getSettings(ctx.chat.id);
    const count = addWarn(ctx.chat.id, targetId, reason);
    logAction(ctx.chat.id, ctx.from.id, targetId, 'warn', reason);
    await ctx.reply(`⚠️ Warn ${count}/${settings.max_warns} — ${reason}`);
    if (count >= settings.max_warns) {
      await ctx.telegram.banChatMember(ctx.chat.id, targetId);
      logAction(ctx.chat.id, ctx.from.id, targetId, 'auto_ban', 'max warns reached');
      await ctx.reply('🚫 Auto-banned (max warns reached)');
    }
  });

  bot.command('unwarn', async (ctx) => {
    if (!(await isAdmin(ctx, ctx.from.id))) return;
    const targetId = getReplyTargetId(ctx);
    if (!targetId) return ctx.reply('សូម reply message របស់អ្នកប្រើ');
    resetWarns(ctx.chat.id, targetId);
    logAction(ctx.chat.id, ctx.from.id, targetId, 'unwarn', 'manual reset');
    await ctx.reply('✅ Warns reset');
  });

  bot.command('warns', async (ctx) => {
    const targetId = getReplyTargetId(ctx) || ctx.from.id;
    const count = getWarns(ctx.chat.id, targetId);
    const settings = getSettings(ctx.chat.id);
    await ctx.reply(`Warns: ${count}/${settings.max_warns}`);
  });
}

module.exports = { registerAdminCommands };
