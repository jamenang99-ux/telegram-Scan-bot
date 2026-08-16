const { getSettings, logAction } = require('../db');

const CAPTCHA_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

function registerWelcomeHandler(bot) {
  bot.on('new_chat_members', async (ctx) => {
    const settings = getSettings(ctx.chat.id);

    for (const member of ctx.message.new_chat_members) {
      if (member.is_bot) continue;

      const text = settings.welcome_template
        .replace('{name}', member.first_name)
        .replace('{chat}', ctx.chat.title);

      if (settings.captcha_enabled && ctx.chat.type === 'supergroup') {
        await ctx.telegram.restrictChatMember(ctx.chat.id, member.id, {
          permissions: { can_send_messages: false },
        });

        const sent = await ctx.reply(text + '\n\nសូមចុចប៊ូតុងខាងក្រោមក្នុងរយៈពេល 3 នាទី ដើម្បីបញ្ជាក់ថាអ្នកមិនមែន bot', {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ ខ្ញុំមិនមែន bot', callback_data: `captcha_${member.id}` },
            ]],
          },
        });

        setTimeout(async () => {
          try {
            const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, member.id);
            if (chatMember.status === 'restricted' || chatMember.status === 'kicked') {
              await ctx.telegram.banChatMember(ctx.chat.id, member.id);
              await ctx.telegram.unbanChatMember(ctx.chat.id, member.id); // kick, not permanent ban
              logAction(ctx.chat.id, null, member.id, 'captcha_timeout_kick', 'no captcha response');
              await ctx.telegram.deleteMessage(ctx.chat.id, sent.message_id).catch(() => {});
            }
          } catch (err) {
            console.error('captcha timeout check failed:', err.message);
          }
        }, CAPTCHA_TIMEOUT_MS);
      } else {
        await ctx.reply(text);
      }
    }
  });

  bot.action(/captcha_(\d+)/, async (ctx) => {
    const targetId = parseInt(ctx.match[1], 10);
    if (ctx.from.id !== targetId) {
      return ctx.answerCbQuery('នេះមិនមែនសម្រាប់អ្នកទេ', { show_alert: true });
    }
    await ctx.telegram.restrictChatMember(ctx.chat.id, targetId, {
      permissions: {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
      },
    });
    logAction(ctx.chat.id, null, targetId, 'captcha_passed', null);
    await ctx.answerCbQuery('✅ អនុម័ត!');
    await ctx.editMessageText(`✅ ${ctx.from.first_name} បានបញ្ជាក់ខ្លួនរួចរាល់`);
  });
}

module.exports = { registerWelcomeHandler };
