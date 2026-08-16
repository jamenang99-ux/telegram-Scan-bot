const crypto = require('crypto');
const https = require('https');
const { addWarn, logAction, getSettings } = require('../db');

// ── Result caches (avoid re-scanning the same file) ───────────────────────────
// file_id is stable per Telegram file (ideal for forwarded duplicates); sha256
// covers the same bytes arriving from different sources. Both are bounded.
const fileIdCache = new Map(); // file_id -> result
const shaCache = new Map();    // sha256  -> { ...result, ts }
const SHA_CACHE_TTL = 24 * 60 * 60 * 1000;

function cacheGet(fileId, sha256) {
  if (fileId != null) {
    const a = fileIdCache.get(fileId);
    if (a) return a;
  }
  if (sha256 != null) {
    const b = shaCache.get(sha256);
    if (b && Date.now() - b.ts < SHA_CACHE_TTL) return b;
    if (b) shaCache.delete(sha256);
  }
  return null;
}
function cachePut(fileId, sha256, result) {
  fileIdCache.set(fileId, result);
  if (fileIdCache.size > 2000) fileIdCache.delete(fileIdCache.keys().next().value);
  shaCache.set(sha256, { ...result, ts: Date.now() });
  if (shaCache.size > 5000) shaCache.delete(shaCache.keys().next().value);
}

// ── Serialized, rate-limited VT API call ───────────────────────────────────────
// ONE call at a time, >=16s apart → never exceeds the free-tier 4/min limit no
// matter how many groups/files hit the bot. This is what keeps the bot from
// stalling under heavy load: calls just queue; the message pipeline is untouched.
const MIN_CALL_MS = 16000;
let lastCallTs = 0;
let apiChain = Promise.resolve();
function vtCall(fn) {
  const run = apiChain.then(async () => {
    const wait = Math.max(0, lastCallTs + MIN_CALL_MS - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastCallTs = Date.now();
    return fn();
  });
  apiChain = run.catch(() => {}); // keep the chain alive on rejection
  return run;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Daily cap on file UPLOADS (hash lookups are cheap & uncapped). Protects the
// free-tier daily quota. Set VT_MAX_UPLOADS_PER_DAY=0 to disable uploads entirely.
const uploadsToday = { date: new Date().toDateString(), count: 0 };
function canUpload() {
  const today = new Date().toDateString();
  if (uploadsToday.date !== today) { uploadsToday.date = today; uploadsToday.count = 0; }
  const limit = parseInt(process.env.VT_MAX_UPLOADS_PER_DAY || '100', 10);
  if (limit <= 0) return false;
  return uploadsToday.count < limit;
}

// ── Public entry point (called fire-and-forget from fileFilter) ───────────────
async function checkHashVirusTotal(ctx, doc) {
  const apiKey = process.env.VT_API_KEY;
  if (!apiKey) return; // feature disabled until a key is configured
  // Do NOT await — the caller (fileFilter) must not block on scanning.
  scanFile(ctx, doc, apiKey).catch((err) =>
    console.error('[VT] scan error:', err && err.message)
  );
}

async function scanFile(ctx, doc, apiKey) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const fileName = doc.file_name || '(unnamed)';

  try {
    // 0) Cache hit by file_id (forwarded duplicates) → instant, no download/API
    const cached0 = cacheGet(doc.file_id, null);
    if (cached0) { await deliverVerdict(ctx, doc, cached0); return; }

    // Download + hash
    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    const buf = await downloadBuffer(fileLink.href);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

    // 1) Cache hit by hash → instant, no API call
    const cached = cacheGet(null, sha256);
    if (cached) { cachePut(doc.file_id, sha256, cached); await deliverVerdict(ctx, doc, cached); return; }

    // 2) Cheap hash reputation lookup (rate-limited)
    const lookup = await vtCall(() => vtRequest({ method: 'GET', path: `/api/v3/files/${sha256}` }, apiKey));
    if (lookup.kind === 'rate') {
      await ctx.reply('⏳ VirusTotal កំពុងរក្សាកម្រិតល្បឿន (rate limit) — សូមរង់ចាះបន្តិច។');
      return;
    }
    if (lookup.kind === 'error') return; // 401 / network — skip silently

    let result = lookup.stats; // null when hash is unknown to VT (404)
    let analysisId = null;

    // 3) Unknown to VT → upload the file for a fresh scan (rate-limit aware)
    if (!result) {
      if (!canUpload()) {
        await ctx.reply(
          `🔍 ឯកសារ "${fileName}" មិនមានក្នុង VirusTotal ទេ (SHA256 ${sha256.slice(0, 16)}…) ហុុឣើងមិនបាន upload ពីព្រោះអស់ quota ថ្ងៃនេះ។`
        );
        return;
      }
      uploadsToday.count++;
      analysisId = await vtCall(() => vtUpload(buf, apiKey));
      if (!analysisId) {
        await ctx.reply(`⚠️ មិនអាច upload ឯកសារ "${fileName}" ទៅ VirusTotal បានទេ (ប្រហែញ rate limit)។`);
        return;
      }
      result = await pollAnalysis(analysisId, apiKey, 5, 10000);
    }

    // 4) Got a result? Deliver it (and cache it). Else VT still working — re-check later.
    if (result) {
      cachePut(doc.file_id, sha256, result);
      await deliverVerdict(ctx, doc, result);
      return;
    }
    if (analysisId) scheduleRecheck(ctx, doc, analysisId, apiKey, sha256);
  } catch (err) {
    // Best-effort: never break the message pipeline on a VT failure
    console.error('VirusTotal scan error:', err && err.message);
  }
}

// Poll an uploaded-file analysis until VT finishes (calls are rate-limited).
async function pollAnalysis(id, apiKey, maxPolls = 5, gapMs = 10000) {
  for (let i = 0; i < maxPolls; i++) {
    await sleep(gapMs);
    const res = await vtCall(() =>
      httpsReq({ hostname: 'www.virustotal.com', path: `/api/v3/analyses/${id}`, method: 'GET' }, apiKey)
    );
    if (res.status === 200) {
      try {
        const json = JSON.parse(res.body);
        const attr = json.data && json.data.attributes;
        if (attr && attr.status === 'completed') {
          const s = attr.stats || attr.last_analysis_stats;
          if (s)
            return {
              malicious: s.malicious || 0,
              suspicious: s.suspicious || 0,
              harmless: s.harmless || 0,
              total: s.total || s.malicious + s.suspicious + s.harmless,
            };
          return { malicious: 0, suspicious: 0, harmless: 0, total: 0 };
        }
      } catch {}
    }
    if (res.status === 429) await sleep(20000); // back off, keep polling
  }
  return null; // still queued/in-progress
}

// Delayed second pass so the user gets the verdict without re-sending the file.
function scheduleRecheck(ctx, doc, analysisId, apiKey, sha256) {
  setTimeout(async () => {
    try {
      const r = await pollAnalysis(analysisId, apiKey, 6, 15000);
      if (r) { cachePut(doc.file_id, sha256, r); await deliverVerdict(ctx, doc, r); }
      // If still pending, stay silent — no spam in the group.
    } catch (e) {
      console.error('[VT] recheck failed:', e && e.message);
    }
  }, 60000);
}

// Build the verdict. CLEAN => silent (no message). MALWARE => delete + warn + kick.
async function deliverVerdict(ctx, doc, result) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const fileName = doc.file_name || '(unnamed)';
  const malicious = result.malicious || 0;
  const suspicious = result.suspicious || 0;
  const total = result.total || malicious + suspicious + (result.harmless || 0);

  if (malicious > 0) {
    try { await ctx.deleteMessage(); } catch {}
    const settings = getSettings(chatId);
    const count = addWarn(chatId, userId, `malware: ${fileName}`);
    logAction(chatId, null, userId, 'vt_malware', `${fileName} sha256=${result.sha256 || ''} engines=${malicious}`);
    await ctx.reply(
      `🚫 ឯកសារ "${fileName}" ពី ${ctx.from.first_name} ត្រូវបានរកឃើញថា MALWARE!\n` +
      `VirusTotal: ${malicious} engines flagged${suspicious ? `, ${suspicious} suspicious` : ''} / ${total} សរុទ\n` +
      `SHA256: ${result.sha256 || ''}\n` +
      `ឯកសារត្រូវបានលុប Tomneung warn ${count}/${settings ? settings.max_warns : 3}។`
    );
    // Kick the poster (ban + unban = removable, reversible). For a permanent ban
    // instead, just delete the unbanChatMember line below.
    try {
      await ctx.telegram.banChatMember(chatId, userId);
      await ctx.telegram.unbanChatMember(chatId, userId);
      logAction(chatId, null, userId, 'vt_kick', 'malware poster');
      await ctx.reply(`👢 ${ctx.from.first_name} ត្រូវបាន kick ចេញពីក្រុម (ផ្ញើ malware)`);
    } catch (e) {
      console.error('[VT] kick failed:', e && e.message);
    }
    return;
  }

  // CLEAN — stay silent in the group (avoid spamming on every shared file).
  console.log(`[VT] clean: ${fileName} ${result.sha256 || ''}`);
}

// ── VT HTTP helpers ────────────────────────────────────────────────────────────
function httpsReq(options, apiKey, body) {
  return new Promise((resolve, reject) => {
    options.headers = Object.assign({ 'x-apikey': apiKey }, options.headers || {});
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function vtRequest(opts, apiKey) {
  const res = await httpsReq(
    { hostname: 'www.virustotal.com', path: opts.path, method: opts.method || 'GET' },
    apiKey
  );
  if (res.status === 429) return { kind: 'rate' };
  if (res.status === 401) { console.error('[VT] 401 Unauthorized — check VT_API_KEY'); return { kind: 'error' }; }
  if (res.status === 404) return { kind: 'ok', stats: null };
  if (res.status !== 200) { console.error('[VT] unexpected status', res.status); return { kind: 'error' }; }
  try {
    const json = JSON.parse(res.body);
    const s = json.data && json.data.attributes && json.data.attributes.last_analysis_stats;
    const stats = s
      ? { malicious: s.malicious || 0, suspicious: s.suspicious || 0, harmless: s.harmless || 0,
          total: s.total || s.malicious + s.suspicious + s.harmless, sha256: json.data.id }
      : null;
    return { kind: 'ok', stats };
  } catch (e) {
    return { kind: 'error' };
  }
}

async function vtUpload(buf, apiKey) {
  const boundary = '----vtboundary' + crypto.randomBytes(6).toString('hex');
  const head =
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="upload.bin"\r\n` +
    'Content-Type: application/octet-stream\r\n\r\n';
  const tail = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([Buffer.from(head, 'utf8'), buf, Buffer.from(tail, 'utf8')]);
  const res = await httpsReq(
    {
      hostname: 'www.virustotal.com',
      path: '/api/v3/files',
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
    },
    apiKey,
    body
  );
  if (res.status === 429) return null;
  if (res.status !== 200) return null;
  try {
    const json = JSON.parse(res.body);
    return json.data && json.data.id;
  } catch {
    return null;
  }
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error('download status ' + res.statusCode));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

module.exports = { checkHashVirusTotal };
