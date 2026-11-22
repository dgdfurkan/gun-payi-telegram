// Sunucu bağlantısı: Telegram'a bağlanma, plan aynası ve olay senkronu. Aynı adreste çalışır.
import { get, commit, applyEvent } from './store.js';

const LINK_KEY = 'gp-link';
export function link() {
  try { return JSON.parse(localStorage.getItem(LINK_KEY)) || null; } catch { return null; }
}
function setLink(v) {
  try { v ? localStorage.setItem(LINK_KEY, JSON.stringify(v)) : localStorage.removeItem(LINK_KEY); } catch { /* özel mod */ }
}
export const token = () => { const l = link(); return l ? `${l.chatId}.${l.secret}` : ''; };

async function call(path, { body, method = 'POST', auth = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (auth) headers.authorization = 'Bearer ' + token();
  const res = await fetch('/api/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && auth) { setLink(null); listeners.forEach(f => f()); }
  if (!res.ok) { const e = Error(data.error || 'Sunucuya ulaşılamadı.'); e.code = data.code; e.status = res.status; throw e; }
  return data;
}

const listeners = new Set();
export const onLinkChange = fn => listeners.add(fn);

// Telegram bağlantısı: kod al → t.me linki → kullanıcı Başlat'a basar → durum sorgulanır.
let pending = null;
export async function startLink() {
  const r = await call('link/start', { auth: false });
  pending = { code: r.code, secret: r.secret, bot: r.bot, until: Date.now() + 14 * 60000 };
  return { url: `https://t.me/${r.bot}?start=${r.code}`, bot: r.bot };
}
export async function checkLink() {
  if (!pending) return 'none';
  if (Date.now() > pending.until) { pending = null; return 'expired'; }
  const r = await call('link/check', { auth: false, body: { code: pending.code, secret: pending.secret } });
  if (r.status === 'linked') {
    setLink({ chatId: r.chatId, secret: pending.secret, name: r.name, bot: pending.bot, at: Date.now() });
    pending = null;
    listeners.forEach(f => f());
    sync(true);
  } else if (r.status === 'expired') pending = null;
  return r.status;
}
export const linking = () => Boolean(pending);

export async function unlink() {
  try { await call('unlink', { body: {} }); } catch { /* yerelde yine de kopar */ }
  setLink(null);
  listeners.forEach(f => f());
}
export const status = () => call('status', { method: 'GET' });
export const test = delay => call('test', { body: { delay } });
export const pause = paused => call('pause', { body: { paused } });
export const aiParse = (text, tz) => call('parse', { body: { text, now: Date.now(), tz } });

// Senkron: önce bekleyen olayları uygula, sonra yerel planları aynala.
let timer = null, waiting = false, running = null, last = 0, lastStatus = null;
export const lastSync = () => lastStatus;
export function sync(now = false) {
  if (!link()) return Promise.resolve(null);
  clearTimeout(timer);
  waiting = !now;
  if (!now) { timer = setTimeout(() => sync(true), 1500); return Promise.resolve(null); }
  if (running) return running.then(() => sync(true));
  running = (async () => {
    try {
      for (let i = 0; i < 6; i++) {
        const s = get();
        const r = await call('sync', { body: { proto: 2, cursor: s.sync.cursor || 0, items: s.items, prefs: s.prefs } });
        if (r.events?.length) {
          await commit(d => { for (const e of r.events) applyEvent(d, e); d.sync.cursor = r.cursor; });
          continue;
        }
        if (r.cursor !== s.sync.cursor) await commit(d => { d.sync.cursor = r.cursor; }, { silent: true });
        last = Date.now();
        lastStatus = { ...r, at: last };
        return r;
      }
    } catch (e) {
      lastStatus = { error: e.message, at: Date.now() };
    } finally {
      running = null;
    }
    return null;
  })();
  return running;
}
// Uygulama arka plana geçerken bekleyen değişikliği hemen gönder (iOS zamanlayıcıyı dondurur).
export const flush = () => { if (waiting) sync(true); };
// Uygulama öne gelince en fazla 20 saniyede bir.
export function syncIfStale() {
  if (Date.now() - last > 20000) sync(true);
}
