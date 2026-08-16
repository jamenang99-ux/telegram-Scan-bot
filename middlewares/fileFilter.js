const { getBlockedExtensions, addWarn, logAction, getSettings } = require('../db');
const { isAdmin } = require('./flood');
const { checkHashVirusTotal } = require('./virustotal');

function extractExtensions(filename) {
  // handles double-extension tricks like "invoice.pdf.exe"
  const parts = filename.toLowerCase().split('.');
  return parts.slice(1).map(p => '.' + p);
}

async function fileFilterMiddleware(ctx, next) {
  const doc = ctx.message && ctx.message.document;
  if (!doc || !ctx.chat || ctx.chat.type === 'private') return next();

  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  if (await isAdmin(ctx, userId)) return next();

  const blocked = getBlockedExtensions(chatId);
  const fileExts = extractExtensions(doc.file_name || '');
  const hit = fileExts.find(ext => blocked.includes(ext));

  if (hit) {
    try {
      await ctx.deleteMessage();
    } catch (err) {
      console.error('delete file msg failed:', err.message);
    }
    const settings = getSettings(chatId);
    const count = addWarn(chatId, userId, `blocked file type ${hit}`);
    logAction(chatId, null, userId, 'delete_file', `blocked extension ${hit}`);
    await ctx.reply(
      `⚠️ ${ctx.from.first_name} ការផ្ញើ file ប្រភេទ ${hit} មិនត្រូវបានអនុញ្ញាតទេ (warn ${count}/${settings.max_warns})`
    );
    if (count >= settings.max_warns) {
      await ctx.telegram.banChatMember(chatId, userId);
      logAction(chatId, null, userId, 'auto_ban', 'max warns reached (file filter)');
      await ctx.reply(`🚫 ${ctx.from.first_name} ត្រូវបាន ban (លើសចំនួន warn)`);
    }
    return; // stop pipeline
  }

  // Optional: VirusTotal hash check (skips gracefully if no API key configured).
  // Fire-and-forget: do NOT await. VT downloads the entire file + makes a network
  // call, so awaiting here would stall every document the bot processes. The check
  // runs in the background and deletes the message itself if it detects malware.
  checkHashVirusTotal(ctx, doc).catch(err =>
    console.error('[fileFilter] VT background check error:', err.message)
  );

  return next();
}

module.exports = { fileFilterMiddleware };
