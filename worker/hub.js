// Durable Object. 'meta' örneği bağlantı kodlarını ve bot ayarını, 'chat:<id>' örnekleri
// her kullanıcının plan aynasını, olay kuyruğunu ve hatırlatma alarmını tutar.
import { DurableObject } from 'cloudflare:workers';
import { jobsFor, cleanItem, cleanPrefs, dayAt, dayAdd, zonedMs, patchOccurrence, occurrence, uid } from '../web/js/core.js';
import { parse, toItem } from '../web/js/parse.js';
import { tg, send, buttons, esc, HELP, reminderMessage, addedMessage, dayList, inboxList, digestMessage } from './telegram.js';
import { transcribe, aiParse } from './ai.js';

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const randomCode = n => [...crypto.getRandomValues(new Uint8Array(n))].map(x => ABC[x % ABC.length]).join('');
export const webhookSecret = async env => (await sha('gp-hook:' + env.BOT_TOKEN)).slice(0, 48);

const KEYS = ['auth', 'profile', 'cal', 'events', 'seq', 'sent', 'snooze', 'paused', 'updates', 'lastList', 'digestDay', 'stat', 'tries'];
const EMPTY = () => ({ auth: [], profile: null, cal: { items: [], prefs: cleanPrefs() }, events: [], seq: 0, sent: {}, snooze: [], paused: false, updates: [], lastList: [], digestDay: '', stat: {}, tries: {} });

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
    s.cal = { items, prefs: cleanPrefs(body.prefs || s.cal.prefs) };
    s.events = [];
    s.stat.sync = Date.now();
    await this.save('cal', 'events', 'stat');
    await this.schedule();
    return { ok: true, cursor: s.seq, ...this.statusBody() };
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
      if (a?.title) { r = a; ai = true; }
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
    if (text.startsWith('/')) return this.command(text);
    return this.reply(text, false);
  }

  async reply(text, voice) {
    const today = dayAt(Date.now(), this.tz);
    const head = voice ? `🎙 <i>“${esc(text)}”</i>\n\n` : '';
    try {
      const res = await this.addText(text);
      if (res.note) {
        await send(this.env, this.chatId, `${head}📝 <b>Not eklendi</b>\n${esc(res.note.text)}`, buttons([[['↩︎ Geri al', `un:${res.note.id}`]]]));
        return;
      }
      const row = [['↩︎ Geri al', `u:${res.item.id}`]];
      if (!res.item.date) row.push(['📝 Nota çevir', `n:${res.item.id}`]);
      await send(this.env, this.chatId, head + addedMessage(res.item, today, res.ai), buttons([row]));
    } catch (e) {
      await send(this.env, this.chatId, `${head}${esc(e.message)}\n\nÖrnek: <i>Yarın 9'da spor</i>`);
    }
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
      return this.reply(text, true);
    } catch (e) {
      return send(this.env, this.chatId, `Sesli mesaj çözülemedi: ${esc(e.message)}`);
    }
  }

  async command(text) {
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
      const title = await this.markDone(ref[0], ref[1]);
      return send(this.env, this.chatId, title ? `✓ <s>${esc(title)}</s>` : 'Plan bulunamadı.');
    }
    if (cmd === '/not') return arg ? this.reply('not: ' + arg, false) : send(this.env, this.chatId, '/not ile birlikte notunu yaz.');
    if (cmd === '/duraklat') { s.paused = true; await this.save('paused'); await this.schedule(); return send(this.env, this.chatId, 'Hatırlatmalar durdu. Açmak için /devam'); }
    if (cmd === '/devam') { s.paused = false; await this.save('paused'); await this.schedule(); return send(this.env, this.chatId, 'Hatırlatmalar yeniden açık.'); }
    return send(this.env, this.chatId, HELP);
  }

  async markDone(itemId, origin) {
    const s = this.s;
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
    const answer = text => tg(this.env, 'answerCallbackQuery', { callback_query_id: cb.id, text }).catch(() => {});
    const edit = text => tg(this.env, 'editMessageText', { chat_id: this.chatId, message_id: cb.message.message_id, text, parse_mode: 'HTML' }).catch(() => {});
    if (k === 'd') {
      const title = await this.markDone(a, b);
      await answer(title ? 'Tamamlandı ✓' : 'Plan bulunamadı');
      if (title) await edit(`✓ <s>${esc(title)}</s>`);
      return;
    }
    if (k === 'z') {
      const item = s.cal.items.find(x => x.id === a);
      if (!item) return answer('Plan bulunamadı');
      const o = occurrence(item, b);
      const min = Math.min(Math.max(parseInt(c, 10) || 10, 1), 240);
      s.snooze.push({ id: uid(), itemId: a, origin: b, title: o.title, time: o.time, start: o.time ? zonedMs(o.date, o.time, this.tz) : null, due: Date.now() + min * 60000 });
      await this.save('snooze');
      await this.schedule();
      await answer(`${min} dk sonra tekrar hatırlatırım`);
      await tg(this.env, 'editMessageReplyMarkup', { chat_id: this.chatId, message_id: cb.message.message_id, reply_markup: buttons([[['✓ Tamamlandı', `d:${a}:${b}`]]]) }).catch(() => {});
      return;
    }
    if (k === 'u') {
      const item = s.cal.items.find(x => x.id === a);
      s.cal.items = s.cal.items.filter(x => x.id !== a);
      this.pushEvent({ type: 'remove', id: a });
      await this.save('cal', 'events', 'seq');
      await this.schedule();
      await answer('Geri alındı');
      return edit(`↩︎ <s>${esc(item?.title || 'Plan')}</s> geri alındı`);
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
    const deliver = async (key, text, markup) => {
      try {
        await send(this.env, chat, text, markup);
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
    const due = jobsFor(s.cal.items, s.cal.prefs, now, 1).filter(j => j.due <= now + 30000 && !s.sent[j.id]);
    for (const j of due.slice(0, 20)) {
      await deliver(j.id, reminderMessage(j, now), buttons([[['✓ Tamamlandı', `d:${j.itemId}:${j.origin}`], ['⏱ 10 dk', `z:${j.itemId}:${j.origin}:10`]]]));
    }
    const ready = s.snooze.filter(z => z.due <= now + 30000);
    for (const z of ready) {
      const text = z.test ? '🔔 <b>Deneme hatırlatması</b>\nUygulama kapalıyken de buraya gelir.' : reminderMessage({ title: z.title, time: z.time || '', start: z.start ?? now }, now);
      await deliver('z:' + z.id, text, z.itemId ? buttons([[['✓ Tamamlandı', `d:${z.itemId}:${z.origin}`], ['⏱ 10 dk', `z:${z.itemId}:${z.origin}:10`]]]) : undefined);
      if (s.sent['z:' + z.id]) s.snooze = s.snooze.filter(x => x.id !== z.id);
    }
    const dg = this.nextDigest(now);
    if (dg && dg <= now + 30000) {
      const today = dayAt(now, this.tz);
      await deliver('digest:' + today, digestMessage(s.cal.items, s.cal.prefs, now));
      if (s.sent['digest:' + today]) s.digestDay = today;
    }
    for (const [k, t] of Object.entries(s.sent)) if (t < now - 3 * 86400000) delete s.sent[k];
    await this.save('sent', 'snooze', 'digestDay', 'stat', 'tries');
    await this.schedule(failed ? 60000 : 1000);
  }
}
