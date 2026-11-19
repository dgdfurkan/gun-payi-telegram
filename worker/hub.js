// Durable Object. 'meta' örneği bağlantı kodlarını ve bot ayarını, 'chat:<id>' örnekleri
// her kullanıcının plan aynasını, olay kuyruğunu ve hatırlatma alarmını tutar.
import { DurableObject } from 'cloudflare:workers';
import { jobsFor, cleanItem, cleanPrefs, dayAt, dayAdd, zonedMs, patchOccurrence, occurrence, statusOf, uid, weekday, toMin, fromMin } from '../web/js/core.js';
import { parse, toItem, parseDurations, parseClock, parseNag } from '../web/js/parse.js';
import { tg, send, buttons, esc, HELP, reminderMessage, reminderButtons, addedMessage, dayList, inboxList, digestMessage, draftView } from './telegram.js';
import { transcribe, aiParse } from './ai.js';

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const randomCode = n => [...crypto.getRandomValues(new Uint8Array(n))].map(x => ABC[x % ABC.length]).join('');
export const webhookSecret = async env => (await sha('gp-hook:' + env.BOT_TOKEN)).slice(0, 48);

const KEYS = ['auth', 'profile', 'cal', 'events', 'seq', 'sent', 'snooze', 'paused', 'updates', 'lastList', 'digestDay', 'stat', 'tries', 'drafts', 'msgs', 'snoozeAwait'];
const EMPTY = () => ({ auth: [], profile: null, cal: { items: [], prefs: cleanPrefs() }, events: [], seq: 0, sent: {}, snooze: [], paused: false, updates: [], lastList: [], digestDay: '', stat: {}, tries: {}, drafts: {}, msgs: {}, snoozeAwait: null });

export class ReminderHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.store = ctx.storage;
    this.env = env;
    this.s = null;
  }

  // ---------- meta: bağlantı kodları ----------
  async linkStart() {
    const now = Date.now();
    const links = (await this.store.get('links')) || {};
    for (const [c, l] of Object.entries(links)) if (l.exp < now) delete links[c];
    if (Object.keys(links).length > 300) throw Error('Çok fazla bekleyen bağlantı var, biraz sonra dene.');
    const code = randomCode(12);
    const secret = hex(crypto.getRandomValues(new Uint8Array(32)));
    links[code] = { h: await sha(secret), exp: now + 15 * 60000 };
    await this.store.put('links', links);
    return { code, secret };
  }
  async linkClaim(code, chat) {
    const links = (await this.store.get('links')) || {};
    const l = links[code];
    if (!l || l.exp < Date.now() || (l.chatId && l.chatId !== chat.id)) return null;
    l.chatId = chat.id;
    l.name = chat.first_name || '';
    await this.store.put('links', links);
    return { h: l.h };
  }
  async linkCheck(code, secret) {
    const links = (await this.store.get('links')) || {};
    const l = links[code];
    if (!l || l.h !== (await sha(secret))) return { status: 'expired' };
    if (!l.chatId) {
      if (l.exp < Date.now()) { delete links[code]; await this.store.put('links', links); return { status: 'expired' }; }
      return { status: 'pending' };
    }
    delete links[code];
    await this.store.put('links', links);
    return { status: 'linked', chatId: l.chatId, name: l.name };
  }
  async ensureBot(origin) {
    const th = (await sha('t:' + this.env.BOT_TOKEN)).slice(0, 16);
    let bot = await this.store.get('bot');
    if (!bot || bot.th !== th) {
      const me = await tg(this.env, 'getMe', {});
      bot = { th, username: me.username, name: me.first_name };
    }
    const want = `${th}|${origin}`;
    if (bot.hook !== want) {
      await tg(this.env, 'setWebhook', { url: origin + '/telegram/webhook', secret_token: await webhookSecret(this.env), allowed_updates: ['message', 'callback_query'], max_connections: 10 });
      await tg(this.env, 'setMyCommands', { commands: [
        { command: 'bugun', description: 'Bugünün planı' },
        { command: 'yarin', description: 'Yarının planı' },
        { command: 'hafta', description: 'Bu haftanın planı' },
        { command: 'yardim', description: 'Nasıl kullanılır' },
      ] });
      bot.hook = want;
    }
    await this.store.put('bot', bot);
    return { username: bot.username, name: bot.name };
  }

  // ---------- kullanıcı durumu ----------
  async load() {
    if (this.s) return this.s;
    const got = await this.store.get(KEYS);
    const s = EMPTY();
    for (const k of KEYS) if (got.get(k) !== undefined) s[k] = got.get(k);
    this.s = s;
    return s;
  }
  async save(...keys) {
    const s = this.s;
    await this.store.put(Object.fromEntries((keys.length ? keys : KEYS).map(k => [k, s[k]])));
  }
  get tz() { return this.s.cal.prefs.timeZone; }
  get chatId() { return this.s.profile?.chatId; }

  async link(h, chat) {
    const s = await this.load();
    s.auth = [...s.auth.filter(k => k.h !== h), { h, at: Date.now() }].slice(-5);
    s.profile = { chatId: chat.id, name: chat.first_name || '', username: chat.username || '' };
    await this.save('auth', 'profile');
    await send(this.env, chat.id, `✅ <b>Bağlandı!</b> Gün Payı'na dönebilirsin.\n\n${HELP}`);
    await this.schedule();
  }

  async api(secret, op, body = {}) {
    const s = await this.load();
    const h = await sha(String(secret));
    if (!s.auth.some(k => k.h === h)) throw Error('AUTH');
    switch (op) {
      case 'sync': return this.sync(body);
      case 'status': return this.status();
      case 'test': return this.test(Number(body.delay) || 0);
      case 'quick': return this.quick(String(body.text || ''));
      case 'parse': return this.aiOnly(String(body.text || ''), Number(body.now) || Date.now(), body.tz);
      case 'pause': s.paused = Boolean(body.paused); await this.save('paused'); await this.schedule(); return this.status();
      case 'unlink': return this.unlink(h);
      default: throw Error('Bilinmeyen işlem.');
    }
  }

  pushEvent(e) {
    const s = this.s;
    s.seq += 1;
    s.events.push({ ...e, seq: s.seq });
    if (s.events.length > 500) s.events = s.events.slice(-500);
    return s.seq;
  }

  async sync(body) {
    const s = this.s;
    const cursor = Math.min(Number(body.cursor) || 0, s.seq);
    const pending = s.events.filter(e => e.seq > cursor);
    if (pending.length) return { events: pending, cursor: s.seq };
    if (!Array.isArray(body.items) || body.items.length > 3000) throw Error('Plan listesi geçersiz.');
    const items = [];
    for (const raw of body.items) { try { items.push(cleanItem(raw)); } catch { /* geçersiz kayıt aynaya alınmaz */ } }
    const cleanup = this.finishedPlans(s.cal.items, items);
    s.cal = { items, prefs: cleanPrefs(body.prefs || s.cal.prefs) };
    s.events = [];
    s.stat.sync = Date.now();
    await this.save('cal', 'events', 'stat');
    await this.schedule();
    if (cleanup.length) {
      const job = (async () => { for (const [id, origin] of cleanup) await this.purge(id, origin); })();
      if (this.ctx?.waitUntil) this.ctx.waitUntil(job); else await job;
    }
    return { ok: true, cursor: s.seq, ...this.statusBody() };
  }

  // ---------- Sohbet temizliği ----------
  // msgs: { [planId | 'draft:<id>']: [[mesajId, zaman, origin]] }. Plan bitince/silinince mesajları silinir.
  track(key, mid, origin = '', kind = '') {
    if (!mid) return;
    const list = this.s.msgs[key] || (this.s.msgs[key] = []);
    if (!list.some(m => m[0] === mid)) list.push([mid, Date.now(), origin, kind]);
    const old = Date.now() - 7 * 86400000;
    for (const [k, v] of Object.entries(this.s.msgs)) { const keep = v.filter(m => m[1] > old); if (keep.length) this.s.msgs[k] = keep; else delete this.s.msgs[k]; }
  }
  // Telegram yalnız 48 saatten yeni mesajları sildirir; eskiyse düğmeleri kaldırır.
  async dropMessage(mid, key = '') {
    if (!mid || !this.chatId) return;
    if (key && this.s.msgs[key]) this.s.msgs[key] = this.s.msgs[key].filter(m => m[0] !== mid);
    try { await tg(this.env, 'deleteMessage', { chat_id: this.chatId, message_id: mid }); }
    catch { await tg(this.env, 'editMessageReplyMarkup', { chat_id: this.chatId, message_id: mid, reply_markup: { inline_keyboard: [] } }).catch(() => {}); }
  }
  // Aynı gerçekleşmenin önceki hatırlatmalarını kaldır: sohbette hep yalnız sonuncusu durur.
  async dropReminders(itemId, origin) {
    const list = this.s.msgs[itemId] || [];
    const old = list.filter(m => m[3] === 'r' && m[2] === origin);
    if (!old.length) return;
    this.s.msgs[itemId] = list.filter(m => !(m[3] === 'r' && m[2] === origin));
    for (const [mid] of old) await this.dropMessage(mid);
  }
  dueLabel(due) {
    const tz = this.tz, today = dayAt(Date.now(), tz), d = dayAt(due, tz);
    const hm = new Intl.DateTimeFormat('tr-TR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(due));
    if (d === today) return hm;
    if (d === dayAdd(today, 1)) return `Yarın ${hm}`;
    return new Intl.DateTimeFormat('tr-TR', { timeZone: tz, day: 'numeric', month: 'short' }).format(new Date(due)) + ' ' + hm;
  }
  async snoozeUntil(itemId, origin, due, prevMid) {
    const s = this.s, item = s.cal.items.find(x => x.id === itemId);
    if (!item) return null;
    const o = occurrence(item, origin);
    s.snooze = s.snooze.filter(z => !(z.itemId === itemId && z.origin === origin));
    s.snooze.push({ id: uid(), itemId, origin, title: o.title, icon: o.icon || '', date: o.date, time: o.time, start: o.time ? zonedMs(o.date, o.time, this.tz) : null, due, prevMid });
    await this.save('snooze');
    await this.schedule();
    const label = this.dueLabel(due);
    if (prevMid) await tg(this.env, 'editMessageReplyMarkup', { chat_id: this.chatId, message_id: prevMid, reply_markup: buttons([[['✓ Tamamlandı', `d:${itemId}:${origin}`], [`⏰ ${label}`, `e:${itemId}:${origin}`]]]) }).catch(() => {});
    return label;
  }
  // "42 dk", "1 gün 5 saat", "1g", "21:30", "yarın 9'da" → zaman damgası
  snoozeDue(text) {
    const now = Date.now(), tz = this.tz, today = dayAt(now, tz);
    const mins = parseDurations(text);
    if (mins?.length) { const m = Math.max(...mins); if (m > 0) return now + m * 60000; }
    const r = parse(text, { now, tz });
    if (r.found?.date) { const d = zonedMs(r.date, r.time || '09:00', tz); return d > now ? d : null; }
    const c = parseClock(text, { now, tz });
    if (c) { let d = zonedMs(today, c, tz); if (d <= now) d = zonedMs(dayAdd(today, 1), c, tz); return d; }
    return null;
  }

  async purge(key, origin = null) {
    const list = this.s.msgs[key] || [];
    const hit = origin == null ? list : list.filter(m => m[2] === origin);
    if (!hit.length) return;
    const rest = origin == null ? [] : list.filter(m => m[2] !== origin);
    if (rest.length) this.s.msgs[key] = rest; else delete this.s.msgs[key];
    await this.save('msgs');
    for (const [mid] of hit) await this.dropMessage(mid);
  }
  // Eski ve yeni plan listesini karşılaştırır: silinen, tamamlanan ya da atlanan gün → [id, origin|null]
  finishedPlans(before, after) {
    const out = [], next = new Map(after.map(i => [i.id, i]));
    for (const old of before) {
      if (!this.s.msgs[old.id]) continue;
      const now = next.get(old.id);
      if (!now) { out.push([old.id, null]); continue; }
      if (now.repeat === 'none') {
        if (now.status !== 'pending' && old.status === 'pending') out.push([old.id, null]);
        continue;
      }
      for (const [o, ex] of Object.entries(now.exceptions || {})) {
        if (ex.status && ex.status !== 'pending' && (old.exceptions?.[o]?.status || 'pending') === 'pending') out.push([old.id, o]);
      }
    }
    return out;
  }

  statusBody() {
    const s = this.s;
    return { name: s.profile?.name || '', paused: s.paused, next: s.stat.next || null, lastSend: s.stat.send || null, lastError: s.stat.error || '', ai: Boolean(this.env.AI) };
  }
  async status() { return { linked: true, ...this.statusBody() }; }

  async test(delay) {
    if (delay > 0) {
      this.s.snooze.push({ id: uid(), title: 'Deneme hatırlatması', time: '', due: Date.now() + Math.min(delay, 600) * 1000, test: true });
      await this.save('snooze');
      await this.schedule();
      return { ok: true, at: Date.now() + delay * 1000 };
    }
    await send(this.env, this.chatId, '🔔 Deneme mesajı. Hatırlatmaların buraya gelecek.');
    return { ok: true };
  }

  async unlink(h) {
    const s = this.s;
    s.auth = s.auth.filter(k => k.h !== h);
    if (!s.auth.length) {
      await this.store.deleteAlarm();
      await this.store.deleteAll();
      this.s = null;
      return { ok: true };
    }
    await this.save('auth');
    return { ok: true };
  }

  // Serbest metni plana çevirir: önce kurallar, şüphe kalırsa AI.
  async understand(text) {
    const now = Date.now(), tz = this.tz;
    let r = parse(text, { now, tz });
    let ai = false;
    if ((r.doubt.length || !r.title) && this.env.AI) {
      const a = await aiParse(this.env, text, { now, tz, fallback: r });
      if (a?.title) { r = { ...a, nag: a.nag ?? r.nag }; ai = true; }
    }
    return { r, ai };
  }
  async aiOnly(text, now, tz) {
    if (!this.env.AI) return { result: null };
    return { result: await aiParse(this.env, text.slice(0, 500), { now, tz: tz || this.tz }) };
  }

  async addText(text) {
    const s = this.s;
    const { r, ai } = await this.understand(text);
    if (r.kind === 'note') {
      const note = { id: uid(), text: (r.title || text).slice(0, 4000), createdAt: new Date().toISOString() };
      this.pushEvent({ type: 'note', note });
      await this.save('events', 'seq');
      return { note };
    }
    if (!r.title) throw Error('Ne ekleyeceğimi anlayamadım.');
    const item = cleanItem(toItem(r));
    s.cal.items.push(item);
    this.pushEvent({ type: 'add', item });
    await this.save('cal', 'events', 'seq');
    await this.schedule();
    return { item, ai };
  }

  async quick(text) {
    text = text.trim().slice(0, 500);
    if (!text) throw Error('Boş metin.');
    const today = dayAt(Date.now(), this.tz);
    const res = await this.addText(text);
    if (res.note) return { text: `📝 Not eklendi: ${res.note.text}` };
    const plain = addedMessage(res.item, today, res.ai).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    return { text: plain };
  }

  // ---------- Telegram ----------
  async telegram(update) {
    const s = await this.load();
    if (s.updates.includes(update.update_id)) return;
    s.updates = [...s.updates, update.update_id].slice(-60);
    await this.save('updates');
    const msg = update.message, cb = update.callback_query;
    const chatId = msg?.chat?.id ?? cb?.message?.chat?.id;
    if (!s.auth.length) {
      if (cb) await tg(this.env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Bağlantı yok.' }).catch(() => {});
      await send(this.env, chatId, "Önce Gün Payı uygulamasında <b>Ayarlar → Telegram'a bağlan</b>'a dokun.");
      return;
    }
    if (cb) return this.callback(cb);
    if (msg.voice || msg.audio) return this.voice(msg);
    const text = (msg.text || '').trim();
    if (!text) return;
    if (text.startsWith('/')) return this.command(text, msg.message_id);
    return this.reply(text, false, msg.message_id);
  }

  // Serbest metin/ses: hemen eklemez, düğmeli taslak gösterir. Notlar doğrudan kaydedilir.
  async reply(text, voice, userMid = 0) {
    const s = this.s, now = Date.now();
    const head = voice ? `🎙 <i>“${esc(text)}”</i>\n\n` : '';
    for (const [id, d] of Object.entries(s.drafts)) if (d.at < now - 86400000) { delete s.drafts[id]; await this.purge('draft:' + id); }
    const w = s.snoozeAwait;
    if (w && w.at > now - 15 * 60000) {
      const due = this.snoozeDue(text);
      if (!due) {
        const m = await send(this.env, this.chatId, 'Süreyi anlayamadım. Örnek: <i>42 dk</i>, <i>1 gün 5 saat</i>, <i>1g</i>, <i>21:30</i>');
        this.track(w.itemId, m?.message_id, w.tro ?? w.origin, 'x');
        this.track(w.itemId, userMid, w.tro ?? w.origin, 'x');
        await this.save('msgs');
        return;
      }
      s.snoozeAwait = null;
      await this.save('snoozeAwait');
      await this.dropMessage(userMid);
      if (w.prompt) await this.dropMessage(w.prompt, w.itemId);
      for (const [mid] of (s.msgs[w.itemId] || []).filter(m => m[3] === 'x' && m[2] === (w.tro ?? w.origin))) await this.dropMessage(mid, w.itemId);
      await this.snoozeUntil(w.itemId, w.origin, due, w.mid);
      return;
    }
    // Taslakta bir menü açıksa (Yazı, Gün, Saat, Hatırlat) yazılan metin o alana gider.
    const awaiting = Object.values(s.drafts).filter(d => d.await && d.at > now - 30 * 60000).sort((a, b) => b.at - a.at)[0];
    if (awaiting) return this.applyTyped(awaiting, text, voice, userMid);
    // Açık taslak varken yalnız zaman bilgisi yazılırsa ("yarın 10'da") taslağı düzelt.
    const rule = parse(text, { now, tz: this.tz });
    const open = Object.values(s.drafts).filter(d => d.at > now - 30 * 60000).sort((a, b) => b.at - a.at)[0];
    const f = rule.found || {};
    if (open && !rule.title && (f.date || f.time || f.repeat || f.reminders)) {
      const it = open.item;
      if (f.repeat) { it.repeat = rule.repeat; it.weekdays = rule.weekdays; it.date = rule.date || it.date || dayAt(now, this.tz); }
      else if (f.date) { it.date = rule.date; it.repeat = 'none'; it.weekdays = []; }
      if (f.time) { it.time = rule.time; it.endTime = rule.endTime; if (!it.date) it.date = rule.date || dayAt(now, this.tz); }
      if (f.reminders) it.reminders = rule.reminders;
      open.item = cleanItem(it);
      this.track('draft:' + open.id, userMid);
      await this.dropMessage(open.mid, 'draft:' + open.id);
      open.voice = voice ? text : open.voice;
      return this.showDraft(open, 'main', true);
    }
    try {
      const { r, ai } = await this.understand(text);
      if (r.kind === 'note') {
        const note = { id: uid(), text: (r.title || text).slice(0, 4000), createdAt: new Date().toISOString() };
        this.pushEvent({ type: 'note', note });
        await this.save('events', 'seq');
        await send(this.env, this.chatId, `${head}📝 <b>Not eklendi</b>\n${esc(note.text)}`, buttons([[['↩︎ Geri al', `un:${note.id}`]]]));
        return;
      }
      if (!r.title) throw Error('Ne ekleyeceğimi anlayamadım.');
      const draft = { id: uid(), item: cleanItem(toItem(r)), at: now, voice: voice ? text : '', ai, mid: 0 };
      s.drafts[draft.id] = draft;
      this.track('draft:' + draft.id, userMid);
      await this.showDraft(draft, 'main', true);
    } catch (e) {
      await send(this.env, this.chatId, `${head}${esc(e.message)}\n\nÖrnek: <i>Yarın 9'da spor</i>`);
    }
  }

  async applyTyped(d, text, voice, userMid = 0) {
    const it = { ...d.item }, now = Date.now(), tz = this.tz, today = dayAt(now, tz);
    this.track('draft:' + d.id, userMid);
    let err = '';
    if (d.await === 'title') {
      const t = text.trim().replace(/\s+/g, ' ').slice(0, 300);
      if (t) it.title = t[0].toLocaleUpperCase('tr') + t.slice(1); else err = 'Başlık boş olamaz.';
    } else if (d.await === 'rem' && parseNag(text) !== null) {
      const v = parseNag(text);
      it.nag = v || null;
      if (v && !it.time) err = 'Tekrar hatırlatma için önce saat seç.';
    } else if (d.await === 'rem') {
      const v = parseDurations(text);
      if (v === null) err = 'Süreyi anlayamadım. Örnek: <i>30 dk</i>, <i>1 sa 15 dk</i>, <i>10 ve 15 dk</i>';
      else it.reminders = v;
    } else if (d.await === 'time') {
      const c = parseClock(text, { now, tz });
      if (!c) err = 'Saati anlayamadım. Örnek: <i>17:34</i>';
      else { it.time = c; it.endTime = ''; if (!it.date) it.date = today; }
    } else if (d.await === 'day') {
      const r = parse(text, { now, tz });
      if (r.found?.repeat) { it.repeat = r.repeat; it.weekdays = r.weekdays; it.date = r.date || it.date || today; }
      else if (r.found?.date) { it.date = r.date; it.repeat = 'none'; it.weekdays = []; }
      else err = 'Tarihi anlayamadım. Örnek: <i>20 Aralık</i>, <i>20 Aralık 2027</i>, <i>haftaya cuma</i>';
      if (!err && r.found?.time) { it.time = r.time; it.endTime = r.endTime; }
    }
    if (err) {
      d.at = now;
      const m = await send(this.env, this.chatId, `${err}\n<i>Menüden çıkmak için taslaktaki ← Geri.</i>`);
      this.track('draft:' + d.id, m?.message_id);
      await this.save('drafts', 'msgs');
      return;
    }
    try { d.item = cleanItem(it); } catch (e) { return send(this.env, this.chatId, esc(e.message)); }
    d.await = null;
    d.at = now;
    if (voice) d.voice = text;
    await this.dropMessage(d.mid, 'draft:' + d.id);
    return this.showDraft(d, 'main', true);
  }

  async showDraft(draft, mode = 'main', fresh = false) {
    const view = draftView(draft, dayAt(Date.now(), this.tz), mode, this.s.cal.prefs.reminderDefaults);
    if (fresh || !draft.mid) {
      const m = await send(this.env, this.chatId, view.text, view.markup);
      draft.mid = m?.message_id || 0;
      this.track('draft:' + draft.id, draft.mid);
    } else {
      await tg(this.env, 'editMessageText', { chat_id: this.chatId, message_id: draft.mid, text: view.text, parse_mode: 'HTML', reply_markup: view.markup }).catch(() => {});
    }
    await this.save('drafts', 'msgs');
  }

  // Taslak düğmeleri: x:<id>:<işlem>:<değer>
  async draftAction(cb, id, op, arg) {
    const s = this.s, now = Date.now(), today = dayAt(now, this.tz);
    const answer = text => tg(this.env, 'answerCallbackQuery', { callback_query_id: cb.id, text }).catch(() => {});
    const d = s.drafts[id];
    if (!d) {
      await answer('Bu taslağın süresi doldu');
      return this.dropMessage(cb.message.message_id);
    }
    d.mid = cb.message.message_id;
    d.at = now;
    const it = d.item;
    if (op === 'ok') {
      const item = cleanItem({ ...it, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      s.cal.items.push(item);
      this.pushEvent({ type: 'add', item });
      delete s.drafts[id];
      // Sohbet sade kalsın: senin mesajın, düzeltmeler ve ara cevaplar silinir; plan başına tek kart kalır.
      const extra = (s.msgs['draft:' + id] || []).filter(m => m[0] !== d.mid);
      delete s.msgs['draft:' + id];
      this.track(item.id, d.mid);
      await this.save('cal', 'events', 'seq', 'drafts', 'msgs');
      await this.schedule();
      await answer('Eklendi ✓');
      await tg(this.env, 'editMessageText', { chat_id: this.chatId, message_id: d.mid, text: addedMessage(item, today, false), parse_mode: 'HTML', reply_markup: buttons([[['↩︎ Geri al', `u:${item.id}`]]]) }).catch(() => {});
      for (const [mid] of extra) await this.dropMessage(mid);
      return;
    }
    if (op === 'no') {
      delete s.drafts[id];
      this.track('draft:' + id, d.mid);
      await this.save('drafts');
      await answer('Vazgeçildi');
      return this.purge('draft:' + id);
    }
    let mode = 'main';
    d.await = null;
    if (['day', 'time', 'rem', 'rep', 'txt'].includes(op)) { mode = op; d.await = { day: 'day', time: 'time', rem: 'rem', txt: 'title' }[op] || null; }
    else if (op === 'd') {
      it.date = arg || ''; it.repeat = 'none'; it.weekdays = [];
      if (!it.date) { it.time = ''; it.endTime = ''; }
    } else if (op === 't') {
      if (arg === 'none') { it.time = ''; it.endTime = ''; }
      else { it.time = `${arg.slice(0, 2)}:${arg.slice(2, 4)}`; if (!it.date) it.date = today; }
    } else if (op === 's') {
      const base = it.time ? toMin(it.time) : 9 * 60;
      it.time = fromMin(base + Number(arg)); it.endTime = '';
      if (!it.date) it.date = today;
      mode = 'time'; d.await = 'time';
    } else if (op === 'g') {
      if (arg === 'none') it.nag = null;
      else { const [every, times] = arg.split('x').map(Number); it.nag = { every, times }; }
      mode = 'rem'; d.await = 'rem';
    } else if (op === 'r') {
      if (arg === 'none') it.reminders = [];
      else {
        const v = Number(arg), cur = it.reminders ?? s.cal.prefs.reminderDefaults;
        it.reminders = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
      }
      mode = 'rem'; d.await = 'rem';
    } else if (op === 'p') {
      const start = it.date || today;
      it.date = start;
      if (arg === 'none') { it.repeat = 'none'; it.weekdays = []; }
      else if (arg === 'daily') { it.repeat = 'daily'; it.weekdays = []; }
      else if (arg === 'monthly') { it.repeat = 'monthly'; it.weekdays = []; }
      else if (arg === 'weekdays') { it.repeat = 'weekly'; it.weekdays = [1, 2, 3, 4, 5]; }
      else if (arg === 'weekend') { it.repeat = 'weekly'; it.weekdays = [6, 0]; }
      else { it.repeat = 'weekly'; it.weekdays = [weekday(start)]; }
    }
    try { d.item = cleanItem(it); } catch (e) { return answer(e.message); }
    await answer('');
    return this.showDraft(d, mode);
  }

  async voice(msg) {
    const v = msg.voice || msg.audio;
    if (!this.env.AI) return send(this.env, this.chatId, 'Sesli mesajları şu an çözemiyorum, yazarak gönderebilirsin.');
    if (v.duration > 120 || v.file_size > 5e6) return send(this.env, this.chatId, 'Sesli mesaj en fazla 2 dakika olsun.');
    try {
      const file = await tg(this.env, 'getFile', { file_id: v.file_id });
      const res = await fetch(`https://api.telegram.org/file/bot${this.env.BOT_TOKEN}/${file.file_path}`);
      if (!res.ok) throw Error('Ses dosyası alınamadı.');
      const text = await transcribe(this.env, await res.arrayBuffer());
      if (!text) return send(this.env, this.chatId, 'Sesi anlayamadım, tekrar dener misin?');
      return this.reply(text, true, msg.message_id);
    } catch (e) {
      return send(this.env, this.chatId, `Sesli mesaj çözülemedi: ${esc(e.message)}`);
    }
  }

  async command(text, userMid = 0) {
    const s = this.s, now = Date.now(), today = dayAt(now, this.tz);
    const [raw, ...rest] = text.split(/\s+/);
    const cmd = raw.split('@')[0].toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
    const arg = rest.join(' ').trim();
    const items = s.cal.items;
    if (cmd === '/bugun' || cmd === '/yarin') {
      const day = cmd === '/yarin' ? dayAdd(today, 1) : today;
      const { text: body, list } = dayList(items, day, today);
      s.lastList = list.map(o => [o.id, o.origin]);
      await this.save('lastList');
      const inbox = cmd === '/bugun' ? inboxList(items) : '';
      return send(this.env, this.chatId, body + (inbox ? '\n\n' + inbox : '') + (list.some(o => o.status !== 'done') ? '\n\n<i>/tamam 1 ile işaretle</i>' : ''));
    }
    if (cmd === '/hafta') {
      const parts = [];
      s.lastList = [];
      for (let i = 0; i < 7; i++) {
        const { text: body, list } = dayList(items, dayAdd(today, i), today, s.lastList.length);
        if (list.length) { parts.push(body); s.lastList.push(...list.map(o => [o.id, o.origin])); }
      }
      await this.save('lastList');
      return send(this.env, this.chatId, parts.length ? parts.join('\n\n') : 'Önümüzdeki 7 gün boş.');
    }
    if (cmd === '/tamam') {
      const n = parseInt(arg, 10);
      const ref = s.lastList[n - 1];
      if (!ref) return send(this.env, this.chatId, 'Önce /bugun yaz, sonra /tamam 1 gibi numara ver.');
      const item = s.cal.items.find(x => x.id === ref[0]);
      const title = await this.markDone(ref[0], ref[1]);
      if (!title) return send(this.env, this.chatId, 'Plan bulunamadı.');
      await this.dropMessage(userMid);
      await this.purge(ref[0], item?.repeat === 'none' ? null : ref[1]);
      return tg(this.env, 'sendMessage', { chat_id: this.chatId, text: `✓ <s>${esc(title)}</s>`, parse_mode: 'HTML', disable_notification: true }).catch(() => {});
    }
    if (cmd === '/not') return arg ? this.reply('not: ' + arg, false) : send(this.env, this.chatId, '/not ile birlikte notunu yaz.');
    if (cmd === '/duraklat') { s.paused = true; await this.save('paused'); await this.schedule(); return send(this.env, this.chatId, 'Hatırlatmalar durdu. Açmak için /devam'); }
    if (cmd === '/devam') { s.paused = false; await this.save('paused'); await this.schedule(); return send(this.env, this.chatId, 'Hatırlatmalar yeniden açık.'); }
    return send(this.env, this.chatId, HELP);
  }

  async markDone(itemId, origin) {
    const s = this.s;
    s.snooze = s.snooze.filter(z => !(z.itemId === itemId && z.origin === origin));
    if (s.snoozeAwait?.itemId === itemId) s.snoozeAwait = null;
    const i = s.cal.items.findIndex(x => x.id === itemId);
    if (i < 0) return null;
    s.cal.items[i] = patchOccurrence(s.cal.items[i], origin, { status: 'done' });
    this.pushEvent({ type: 'patch', id: itemId, origin, patch: { status: 'done' } });
    await this.save('cal', 'events', 'seq');
    await this.schedule();
    return s.cal.items[i].title;
  }

  async callback(cb) {
    const s = this.s;
    const [k, a, b, c] = String(cb.data || '').split(':');
    if (k === 'x') return this.draftAction(cb, a, b, c || '');
    const answer = text => tg(this.env, 'answerCallbackQuery', { callback_query_id: cb.id, text }).catch(() => {});
    const edit = text => tg(this.env, 'editMessageText', { chat_id: this.chatId, message_id: cb.message.message_id, text, parse_mode: 'HTML' }).catch(() => {});
    if (k === 'd') {
      const item = s.cal.items.find(x => x.id === a);
      if (!item) { await answer('Bu plan artık yok'); return this.dropMessage(cb.message.message_id); }
      const already = statusOf(item, b) === 'done';
      if (!already) await this.markDone(a, b);
      await answer(already ? 'Zaten tamamlanmış' : 'Tamamlandı ✓');
      const origin = item.repeat === 'none' ? '' : b;
      this.track(a, cb.message.message_id, origin);
      return this.purge(a, item.repeat === 'none' ? null : b);
    }
    const markup = m => tg(this.env, 'editMessageReplyMarkup', { chat_id: this.chatId, message_id: cb.message.message_id, reply_markup: m }).catch(() => {});
    if (k === 'e' || k === 'b' || k === 'z' || k === 'w') {
      const item = s.cal.items.find(x => x.id === a);
      if (!item || statusOf(item, b) !== 'pending') { await answer(item ? 'Zaten tamamlanmış' : 'Bu plan artık yok'); return this.dropMessage(cb.message.message_id, a); }
      if (k === 'e') { await answer(''); return markup(reminderButtons(a, b, 'snooze')); }
      if (k === 'b') { if (s.snoozeAwait?.itemId === a) { s.snoozeAwait = null; await this.save('snoozeAwait'); } await answer(''); return markup(reminderButtons(a, b)); }
      if (k === 'z') {
        const min = Math.min(Math.max(parseInt(c, 10) || 10, 1), 40320);
        const label = await this.snoozeUntil(a, b, Date.now() + min * 60000, cb.message.message_id);
        return answer(`⏰ ${label} için ertelendi`);
      }
      // ✏️ Süre yaz: sıradaki mesaj süre olarak okunur
      await answer('Süreyi yaz');
      await markup(buttons([[['← Geri', `b:${a}:${b}`]]]));
      const m = await send(this.env, this.chatId, '⏰ Ne zaman tekrar hatırlatayım?\n<i>42 dk</i> · <i>1 gün 5 saat</i> · <i>1g</i> · <i>21:30</i> · <i>yarın 9\'da</i>');
      const origin = item.repeat === 'none' ? '' : b;
      this.track(a, m?.message_id, origin, 'x');
      s.snoozeAwait = { itemId: a, origin: b, tro: origin, mid: cb.message.message_id, prompt: m?.message_id, at: Date.now() };
      await this.save('snoozeAwait', 'msgs');
      return;
    }
    if (k === 'u') {
      const item = s.cal.items.find(x => x.id === a);
      s.cal.items = s.cal.items.filter(x => x.id !== a);
      this.pushEvent({ type: 'remove', id: a });
      await this.save('cal', 'events', 'seq');
      await this.schedule();
      await answer('Geri alındı');
      this.track(a, cb.message.message_id);
      return this.purge(a);
    }
    if (k === 'un') {
      this.pushEvent({ type: 'removeNote', id: a });
      await this.save('events', 'seq');
      await answer('Geri alındı');
      return edit('↩︎ Not geri alındı');
    }
    if (k === 'n') {
      const item = s.cal.items.find(x => x.id === a);
      if (!item) return answer('Plan bulunamadı');
      s.cal.items = s.cal.items.filter(x => x.id !== a);
      const note = { id: uid(), text: item.title, createdAt: new Date().toISOString() };
      this.pushEvent({ type: 'remove', id: a });
      this.pushEvent({ type: 'note', note });
      await this.save('cal', 'events', 'seq');
      await this.schedule();
      await answer('Nota çevrildi');
      return edit(`📝 <b>Not</b>\n${esc(note.text)}`);
    }
    return answer('');
  }

  // ---------- alarm ----------
  nextDigest(now) {
    const p = this.s.cal.prefs;
    if (!p.digest?.on) return null;
    const today = dayAt(now, p.timeZone);
    const t = zonedMs(today, p.digest.time, p.timeZone);
    if (this.s.digestDay !== today && t >= now - 30 * 60000) return t;
    return zonedMs(dayAdd(today, 1), p.digest.time, p.timeZone);
  }

  async schedule(minDelay = 1000) {
    const s = await this.load();
    const now = Date.now();
    if (s.paused || !s.auth.length || !s.profile) {
      await this.store.deleteAlarm();
      s.stat.next = null;
      await this.save('stat');
      return;
    }
    const jobs = jobsFor(s.cal.items, s.cal.prefs, now, 8).filter(j => !s.sent[j.id]);
    let next = jobs.length ? jobs[0].due : Infinity;
    for (const z of s.snooze) next = Math.min(next, z.due);
    const dg = this.nextDigest(now);
    if (dg) next = Math.min(next, dg);
    next = Math.min(next, now + 6 * 86400000);
    await this.store.setAlarm(Math.max(next, now + minDelay));
    s.stat.next = jobs.length ? jobs[0].due : null; // sıradaki hatırlatmanın gönderileceği an
    await this.save('stat');
  }

  async alarm() {
    const s = await this.load();
    const now = Date.now();
    if (s.paused || !s.profile) return;
    const chat = s.profile.chatId;
    let failed = false;
    const deliver = async (key, text, markup, itemId = '', origin = '', kind = '') => {
      try {
        if (itemId && kind === 'r') await this.dropReminders(itemId, origin);
        const m = await send(this.env, chat, text, markup);
        if (itemId) this.track(itemId, m?.message_id, origin, kind);
        s.sent[key] = now;
        s.stat.send = now;
        s.stat.error = '';
        delete s.tries[key];
      } catch (e) {
        failed = true;
        s.stat.error = String(e.message).slice(0, 200);
        s.tries[key] = (s.tries[key] || 0) + 1;
        if (s.tries[key] >= 3 || /403|blocked|chat not found/i.test(e.message)) { s.sent[key] = now; delete s.tries[key]; }
      }
    };
    const today = dayAt(now, this.tz);
    // Geç kalınmış birden fazla iş varsa (ör. tekrar hatırlatmalar) her gerçekleşme için yalnız sonuncusu gider.
    const due = jobsFor(s.cal.items, s.cal.prefs, now, 1).filter(j => j.due <= now + 5000 && !s.sent[j.id]);
    const latest = new Map();
    const snoozed = new Set(s.snooze.filter(z => z.itemId && z.due > now + 5000).map(z => `${z.itemId}:${z.origin}`));
    for (const j of due) {
      const k = `${j.itemId}:${j.origin}`, prev = latest.get(k);
      // Ertelenmiş gerçekleşmede ara hatırlatmalar susar; ertelenen zamanda tek mesaj gelir.
      if (snoozed.has(k)) { s.sent[j.id] = now; continue; }
      if (!prev || j.due >= prev.due) { if (prev) s.sent[prev.id] = now; latest.set(k, j); } else s.sent[j.id] = now;
    }
    for (const j of [...latest.values()].slice(0, 20)) {
      const rep = s.cal.items.find(i => i.id === j.itemId)?.repeat !== 'none';
      await deliver(j.id, reminderMessage(j, today), reminderButtons(j.itemId, j.origin), j.itemId, rep ? j.origin : '', 'r');
    }
    const ready = s.snooze.filter(z => z.due <= now + 5000);
    for (const z of ready) {
      const item = z.itemId && s.cal.items.find(i => i.id === z.itemId);
      if (z.itemId && (!item || statusOf(item, z.origin) !== 'pending')) { s.snooze = s.snooze.filter(x => x.id !== z.id); continue; }
      const text = z.test ? '🔔 <b>Deneme hatırlatması</b>\nUygulama kapalıyken de buraya gelir.' : reminderMessage({ title: z.title, icon: z.icon ?? item?.icon ?? '', date: z.date || today, time: z.time || '' }, today);
      const zr = item && item.repeat !== 'none';
      await deliver('z:' + z.id, text, z.itemId ? reminderButtons(z.itemId, z.origin) : undefined, z.itemId || '', zr ? z.origin : '', z.itemId ? 'r' : '');
      if (s.sent['z:' + z.id]) s.snooze = s.snooze.filter(x => x.id !== z.id);
    }
    const dg = this.nextDigest(now);
    if (dg && dg <= now + 5000) {
      const today = dayAt(now, this.tz);
      await deliver('digest:' + today, digestMessage(s.cal.items, s.cal.prefs, now));
      if (s.sent['digest:' + today]) s.digestDay = today;
    }
    for (const [k, t] of Object.entries(s.sent)) if (t < now - 3 * 86400000) delete s.sent[k];
    await this.save('sent', 'snooze', 'digestDay', 'stat', 'tries', 'msgs');
    await this.schedule(failed ? 60000 : 1000);
  }
}
