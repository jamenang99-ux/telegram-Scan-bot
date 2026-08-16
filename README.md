# MME Moderation Bot (MVP)

Self-hosted Telegram anti-spam / anti-malware bot for MME work groups — a MissRose-style bot you host and control yourself.

## 1. Create the bot on Telegram

1. Open a chat with **@BotFather** on Telegram.
2. Send `/newbot`, follow the prompts, and copy the token it gives you.
3. Send `/setprivacy` to BotFather, select your bot, choose **Disable** — the bot must read all group messages (not just commands) for flood/file/link filtering to work.
4. Add the bot to your MME group, then promote it to **admin** with at least: delete messages, ban users, restrict members, invite users (for the invite-link filter to make sense).

## 2. Install and configure

```bash
cd mme-mod-bot
npm install
cp .env.example .env
# edit .env and paste your BOT_TOKEN
npm start
```

> **⚠️ Node.js 22.5+ required** — this bot uses the built-in `node:sqlite` module (no native compilation needed).  
> If you get a "409 Conflict" error, another instance is already polling that token — stop the other instance first.

The SQLite database file (`bot.sqlite`) is created automatically on first run — no separate DB server needed.

## 3. What works out of the box

- Flood control: >5 messages in 10 seconds → auto-mute (configurable per chat in `chat_settings` table)
- Malicious file extension filter (.exe, .apk, .bat, etc., including double-extension tricks)
- Telegram invite-link filter (t.me/joinchat, t.me/+)
- Warn system with auto-ban at 3 warns (default)
- Admin commands: /ban /unban /kick /mute /unmute /warn /unwarn /warns
- New-member welcome message + tap-to-confirm captcha
- All moderation actions logged to `mod_logs` table

## 4. Optional: VirusTotal file hash check

Get a free API key at https://www.virustotal.com/gui/join-us, add it to `.env` as `VT_API_KEY`.
If left empty, this check is silently skipped — everything else still works.

## 5. Next steps (not in this MVP)

- Per-chat settings editing via admin commands (currently defaults only, editable directly in `chat_settings` table)
- Federation/shared blacklist across multiple MME groups
- Admin log channel (`LOG_CHAT_ID` in .env — wire this into `logAction` to also post to a channel)
- Deploy as a systemd service or with `pm2` for 24/7 uptime on your server
