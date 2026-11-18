// Gün Payı: aynı adreste PWA (statik dosyalar) + API + Telegram webhook.
import { ReminderHub, webhookSecret } from './hub.js';
import { send } from './telegram.js';
import { VERSION } from '../web/js/version.js';

// Giriş modülü yalnız işleyici ve Durable Object sınıfı dışa aktarabilir.
export { ReminderHub };

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const text = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
const hub = (env, name) => env.HUB.get(env.HUB.idFromName(name));

async function readJson(req) {
  const raw = await req.text();
  if (raw.length > 1_500_000) throw Error('Veri çok büyük.');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw Error('JSON okunamadı.'); }
}
// Kısayollar uygulaması JSON, form ya da düz metin gönderebilir.
async function readQuick(req) {
  const type = req.headers.get('content-type') || '';
  const raw = (await req.text()).slice(0, 4000);
  if (type.includes('json')) { try { const b = JSON.parse(raw); return { text: typeof b === 'string' ? b : b.text || b.metin || '' }; } catch { return { text: raw }; } }
  if (type.includes('form')) return { text: new URLSearchParams(raw).get('text') || '' };
  return { text: raw };
}

async function api(req, env, url) {
  const path = url.pathname.slice('/api/'.length);
  try {
    if (path === 'config') return json({ bot: Boolean(env.BOT_TOKEN), ai: Boolean(env.AI), version: VERSION });
    if (path === 'link/start' && req.method === 'POST') {
      if (!env.BOT_TOKEN) return json({ error: 'Telegram botu henüz ayarlanmadı.', code: 'no-bot' }, 503);
      if (env.SETUP_LIMITER) {
        const { success } = await env.SETUP_LIMITER.limit({ key: req.headers.get('cf-connecting-ip') || 'local' });
        if (!success) return json({ error: 'Çok fazla deneme. Bir dakika bekle.' }, 429);
      }
      const meta = hub(env, 'meta');
      const bot = await meta.ensureBot(url.origin);
      const link = await meta.linkStart();
      return json({ ...link, bot: bot.username });
    }
    if (path === 'link/check' && req.method === 'POST') {
      const b = await readJson(req);
      if (!/^[A-Za-z0-9]{6,64}$/.test(b.code || '') || !/^[a-f0-9]{64}$/.test(b.secret || '')) return json({ status: 'expired' });
      return json(await hub(env, 'meta').linkCheck(b.code, b.secret));
    }
    const m = /^Bearer\s+(\d{1,20})\.([a-f0-9]{64})$/i.exec(req.headers.get('authorization') || '');
    if (!m) return path === 'quick' ? text('Bağlantı anahtarı eksik.', 401) : json({ error: 'Bağlantı anahtarı eksik.' }, 401);
    const body = req.method === 'POST' ? (path === 'quick' ? await readQuick(req) : await readJson(req)) : {};
    const result = await hub(env, 'chat:' + m[1]).api(m[2], path, body);
    return path === 'quick' ? text(result.text) : json(result);
  } catch (e) {
    const msg = String(e?.message || e).replace(/^Error:\s*/, '');
    if (msg === 'AUTH') return path === 'quick' ? text('Bağlantı geçersiz. Uygulamadan yeniden bağlan.', 401) : json({ error: 'Bağlantı geçersiz. Yeniden bağlan.', code: 'auth' }, 401);
    return path === 'quick' ? text(msg, 400) : json({ error: msg }, 400);
  }
}

async function webhook(req, env) {
  if (!env.BOT_TOKEN) return text('bot yok', 503);
  if (req.headers.get('x-telegram-bot-api-secret-token') !== (await webhookSecret(env))) return text('yetkisiz', 403);
  const update = await req.json().catch(() => null);
  const msg = update?.message, cb = update?.callback_query;
  const chat = msg?.chat || cb?.message?.chat;
  const from = msg?.from || cb?.from;
  if (!chat || chat.type !== 'private' || (from && from.id !== chat.id)) return text('ok');
  try {
    const start = /^\/start(?:@\w+)?\s+([A-Za-z0-9]{6,64})$/.exec((msg?.text || '').trim());
    if (start) {
      const claim = await hub(env, 'meta').linkClaim(start[1], { id: chat.id, first_name: from?.first_name || '' });
      if (!claim) await send(env, chat.id, "Bu bağlantının süresi dolmuş. Uygulamada yeniden <b>Telegram'a bağlan</b>'a dokun.");
      else await hub(env, 'chat:' + chat.id).link(claim.h, { id: chat.id, first_name: from?.first_name || '', username: from?.username || '' });
    } else {
      await hub(env, 'chat:' + chat.id).telegram(update);
    }
  } catch (e) {
    console.log('webhook', e?.message);
  }
  return text('ok');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return json({ service: 'gun-payi', version: VERSION, alarm: Boolean(env.HUB), bot: Boolean(env.BOT_TOKEN), ai: Boolean(env.AI) });
    if (url.pathname === '/telegram/webhook' && req.method === 'POST') return webhook(req, env);
    if (url.pathname.startsWith('/api/')) return api(req, env, url);
    return env.ASSETS ? env.ASSETS.fetch(req) : text('Bulunamadı', 404);
  },
};
