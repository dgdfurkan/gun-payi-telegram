import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { ReminderHub } from '../worker/index.js';
import { webhookSecret } from '../worker/hub.js';
import { clockAt, fromMin, zonedMs, dayAt, hmAt, cleanItem, patchOccurrence, donePatch, makeSnooze } from '../web/js/core.js';
import { applyEvent } from '../web/js/store.js';
import { existsSync } from 'node:fs';

class Storage {
  constructor() { this.m = new Map(); this.alarm = null; }
  async get(k) {
    if (Array.isArray(k)) return new Map(k.filter(x => this.m.has(x)).map(x => [x, structuredClone(this.m.get(x))]));
    return structuredClone(this.m.get(k));
  }
  async put(k, v) {
    if (typeof k === 'object') for (const [a, b] of Object.entries(k)) this.m.set(a, structuredClone(b));
    else this.m.set(k, structuredClone(v));
  }
  async setAlarm(t) { this.alarm = t; }
  async deleteAlarm() { this.alarm = null; }
  async deleteAll() { this.m.clear(); }
}

function setup({ ai = true } = {}) {
  const hubs = new Map();
  const calls = [];
  const env = {
    BOT_TOKEN: '123456:TEST-TOKEN',
    HUB: {
      idFromName: n => n,
      get(id) {
        if (!hubs.has(id)) hubs.set(id, new ReminderHub({ storage: new Storage() }, env));
        return hubs.get(id);
      },
    },
    AI: ai ? {
      async run(model, input) {
        calls.push({ ai: model, input });
        if (model.includes('whisper')) return { text: "Her cuma saat 12'de babaannemi ara" };
        return { response: { kind: 'event', title: 'Saç kestir', date: '2026-11-20', time: '', repeat: 'weekly', weekdays: [5], reminders: [] } };
      },
    } : undefined,
  };
  let nextMid = 100;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/file/bot')) return new Response(new Uint8Array([1, 2, 3]));
    const method = u.split('/').pop();
    const body = init.body ? JSON.parse(init.body) : {};
    const id = method === 'sendMessage' ? ++nextMid : undefined;
    calls.push({ method, body, id });
    const result = { getMe: { username: 'GunPayiBot', first_name: 'Gün Payı' }, getFile: { file_path: 'voice/a.oga' }, sendMessage: { message_id: id } }[method] ?? true;
    return new Response(JSON.stringify({ ok: true, result }));
  };
  const call = (path, { method = 'POST', body, auth, headers = {} } = {}) => worker.fetch(new Request('https://gp.example.dev' + path, {
    method, headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ' + auth } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  }), env);
  const hook = async (update, secret) => worker.fetch(new Request('https://gp.example.dev/telegram/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret ?? await webhookSecret(env) }, body: JSON.stringify(update),
  }), env);
  return { env, hubs, calls, call, hook };
}

let updateId = 1;
const message = (text, extra = {}) => ({ update_id: updateId++, message: { message_id: updateId, chat: { id: 42, type: 'private' }, from: { id: 42, first_name: 'Furkan' }, text, ...extra } });

async function linked(t) {
  const start = await (await t.call('/api/link/start')).json();
  assert.equal(start.bot, 'GunPayiBot');
  assert.match(start.code, /^[A-Za-z0-9]{12}$/);
  assert.equal((await (await t.call('/api/link/check', { body: { code: start.code, secret: start.secret } })).json()).status, 'pending');
  await t.hook(message('/start ' + start.code));
  const check = await (await t.call('/api/link/check', { body: { code: start.code, secret: start.secret } })).json();
  assert.equal(check.status, 'linked');
  assert.equal(check.chatId, 42);
  return `${check.chatId}.${start.secret}`;
}

test('bağlantı linki: kod → /start → anahtar', async () => {
  const t = setup();
  const auth = await linked(t);
  assert.ok(t.calls.some(c => c.method === 'setWebhook' && c.body.url === 'https://gp.example.dev/telegram/webhook'));
  assert.ok(t.calls.some(c => c.method === 'sendMessage' && /Bağlandı/.test(c.body.text)));
  const status = await (await t.call('/api/status', { method: 'GET', auth })).json();
  assert.equal(status.linked, true);
  assert.equal(status.name, 'Furkan');
  const bad = await t.call('/api/status', { method: 'GET', auth: '42.' + 'a'.repeat(64) });
  assert.equal(bad.status, 401);
});

test('webhook gizli anahtarı yanlışsa reddedilir', async () => {
  const t = setup();
  const res = await t.hook(message('/bugun'), 'yanlis');
  assert.equal(res.status, 403);
});

test('bağlı olmayan sohbet yönlendirilir', async () => {
  const t = setup();
  await t.hook(message('merhaba'));
  assert.ok(t.calls.some(c => c.method === 'sendMessage' && /Telegram'a bağlan/.test(c.body.text)));
});

const press = async (t, data, mid) => t.hook({ update_id: updateId++, callback_query: { id: 'cb' + updateId, from: { id: 42 }, data, message: { message_id: mid ?? t.calls.filter(c => c.method === 'sendMessage').at(-1)?.id ?? 7, chat: { id: 42, type: 'private' } } } });
const deleted = t => t.calls.filter(c => c.method === 'deleteMessage').map(c => c.body.message_id);
const lastSent = t => t.calls.filter(c => c.method === 'sendMessage' || c.method === 'editMessageText').at(-1);
const btn = (msg, label) => msg.body.reply_markup.inline_keyboard.flat().find(b => b.text.includes(label))?.callback_data;

test('Telegram serbest metni önce taslak olur, Ekle ile plana girer', async () => {
  const t = setup();
  const auth = await linked(t);
  await t.hook(message("Her cuma saat 12'de babaannemi ara, 10 ve 15 dakika önce hatırlat"));
  const draft = lastSent(t);
  assert.match(draft.body.text, /Taslak/);
  assert.match(draft.body.text, /📞 <b>Babaannemi ara<\/b>/);
  assert.match(draft.body.text, /Her Cuma/);
  assert.match(draft.body.text, /10, 15 dk önce/);
  let sync = await (await t.call('/api/sync', { auth, body: { proto: 2, cursor: 0, items: [], prefs: {} } })).json();
  assert.equal(sync.ok, true, 'taslak onaylanmadan plan eklenmez');
  await press(t, btn(draft, 'Ekle'));
  assert.match(lastSent(t).body.text, /✅/);
  sync = await (await t.call('/api/sync', { auth, body: { proto: 2, cursor: 0, items: [], prefs: {} } })).json();
  assert.equal(sync.events.length, 1);
  const item = sync.events[0].item;
  assert.deepEqual(item.weekdays, [5]);
  assert.deepEqual(item.reminders, [15, 10]);
  const second = await (await t.call('/api/sync', { auth, body: { proto: 2, cursor: sync.cursor, items: [item], prefs: { timeZone: 'Europe/Istanbul' } } })).json();
  assert.equal(second.ok, true);
  assert.ok(t.hubs.get('chat:42').store.alarm > Date.now());
});

test('taslak düğmelerle ve yazarak düzeltilir', async () => {
  const t = setup();
  const auth = await linked(t);
  await t.hook(message('Spor'));
  const draft = lastSent(t);
  await press(t, btn(draft, 'Saat'));
  const timeMenu = lastSent(t);
  assert.ok(btn(timeMenu, '19:00'));
  await press(t, btn(timeMenu, '19:00'));
  assert.match(lastSent(t).body.text, /🕐 19:00/);
  await press(t, btn(lastSent(t), 'Hatırlat'));
  await press(t, btn(lastSent(t), '1 dk'));
  assert.match(lastSent(t).body.text, /1, 10 dk önce/);
  await press(t, btn(lastSent(t), 'Geri'));
  await press(t, btn(lastSent(t), 'Tekrar'));
  await press(t, btn(lastSent(t), 'Hafta içi'));
  assert.match(lastSent(t).body.text, /Hafta içi her gün/);
  await t.hook(message("yarın 10'da"));
  const fixed = lastSent(t);
  assert.match(fixed.body.text, /Yarın/);
  assert.match(fixed.body.text, /🕐 10:00/);
  await press(t, btn(fixed, 'Ekle'));
  const sync = await (await t.call('/api/sync', { auth, body: { proto: 2, cursor: 0, items: [], prefs: {} } })).json();
  assert.equal(sync.events[0].item.time, '10:00');
  assert.equal(sync.events[0].item.repeat, 'none');
  await t.hook(message('Kitap oku'));
  const card = t.calls.filter(c => c.method === 'sendMessage').at(-1).id;
  await press(t, btn(lastSent(t), 'Vazgeç'));
  assert.ok(deleted(t).includes(card), 'vazgeçilen taslak silinir');
});

test('taslakta menüye girince yazılan metin o alana uygulanır', async () => {
  const t = setup();
  const auth = await linked(t);
  await t.hook(message('Spor'));
  await press(t, btn(lastSent(t), 'Yazı'));
  assert.match(lastSent(t).body.text, /Yeni başlığı/);
  await t.hook(message('akşam koşusu'));
  assert.match(lastSent(t).body.text, /<b>Akşam koşusu<\/b>/);
  await press(t, btn(lastSent(t), 'Saat'));
  await t.hook(message('1734'));
  assert.match(lastSent(t).body.text, /🕐 17:34/);
  await press(t, btn(lastSent(t), 'Hatırlat'));
  await t.hook(message('1 sa 15 dk'));
  assert.match(lastSent(t).body.text, /1 sa 15 dk önce/);
  await press(t, btn(lastSent(t), 'Hatırlat'));
  await t.hook(message('saçma'));
  assert.match(lastSent(t).body.text, /Süreyi anlayamadım/);
  await t.hook(message('10 ve 30 dk'));
  assert.match(lastSent(t).body.text, /10, 30 dk önce/);
  await press(t, btn(lastSent(t), 'Gün'));
  await t.hook(message('20 Aralık 2027'));
  assert.match(lastSent(t).body.text, /20 Aralık/);
  await press(t, btn(lastSent(t), 'Ekle'));
  const sync = await (await t.call('/api/sync', { auth, body: { proto: 2, cursor: 0, items: [], prefs: {} } })).json();
  const it = sync.events[0].item;
  assert.equal(it.title, 'Akşam koşusu');
  assert.equal(it.date, '2027-12-20');
  assert.equal(it.time, '17:34');
  assert.deepEqual(it.reminders, [30, 10]);
});

test('gün menüsünde "haftaya cuma" yazılabilir', async () => {
  const t = setup();
  await linked(t);
  await t.hook(message('Toplantı'));
  await press(t, btn(lastSent(t), 'Gün'));
  await t.hook(message('haftaya cuma'));
  assert.match(lastSent(t).body.text, /📅/);
  assert.doesNotMatch(lastSent(t).body.text, /anlayamadım/);
});

test('sohbet temizliği: eklenince ara mesajlar, bitince plan kartı silinir', async () => {
  const t = setup();
  const auth = await linked(t);
  const userMsg = message('Spor');
  await t.hook(userMsg);
  const firstCard = t.calls.filter(c => c.method === 'sendMessage').at(-1).id;
  await press(t, btn(lastSent(t), 'Saat'));
  const typed = message('1734');
  await t.hook(typed);
  const card = t.calls.filter(c => c.method === 'sendMessage').at(-1).id;
  assert.ok(deleted(t).includes(firstCard), 'eski taslak kartı yenisi gelince silinir');
  await press(t, btn(lastSent(t), 'Ekle'));
  const gone = deleted(t);
  assert.ok(gone.includes(userMsg.message.message_id), 'kullanıcının mesajı silinir');
  assert.ok(gone.includes(typed.message.message_id), 'yazılan düzeltme silinir');
  assert.ok(!gone.includes(card), 'plan kartı kalır');
  const first = await (await t.call('/api/sync', { auth, body: { proto: 2, cursor: 0, items: [], prefs: {} } })).json();
  const item = first.events[0].item;
  await t.call('/api/sync', { auth, body: { proto: 2, cursor: first.cursor, items: [item], prefs: {} } });
  await t.call('/api/sync', { auth, body: { proto: 2, cursor: first.cursor, items: [{ ...item, status: 'done' }], prefs: {} } });
  assert.ok(deleted(t).includes(card), 'uygulamada tamamlanınca kart silinir');
});

test('hatırlatmadaki Tamamlandı mesajları siler, eskimiş düğme takılmaz', async () => {
  const t = setup();
  const auth = await linked(t);
  const { day, minutes } = clockAt(Date.now() + 2 * 60000, 'Europe/Istanbul');
  const item = { id: 'r1', title: 'İlaç', date: day, time: fromMin(minutes), repeat: 'none', weekdays: [], reminders: [5], status: 'pending', exceptions: {} };
  await t.call('/api/sync', { auth, body: { proto: 2, cursor: 0, items: [item], prefs: { timeZone: 'Europe/Istanbul' } } });
  await t.hubs.get('chat:42').alarm();
  const reminder = t.calls.filter(c => c.method === 'sendMessage').at(-1);
  await press(t, reminder.body.reply_markup.inline_keyboard[0][0].callback_data, reminder.id);
  assert.ok(deleted(t).includes(reminder.id), 'hatırlatma mesajı silinir');
  await press(t, 'd:yok:2026-01-01', 555);
  assert.ok(deleted(t).includes(555), 'artık olmayan planın düğmesi mesajı kaldırır');
});

test('saatsiz metin yapılacaklara düşer, not komutu not olur', async () => {
  const t = setup();
  const auth = await linked(t);
  await t.hook(message('Ekmek al'));
  await press(t, btn(lastSent(t), 'Ekle'));
  await t.hook(message('/not Widget fikri'));
  const sync = await (await t.call('/api/sync', { auth, body: { proto: 2, cursor: 0, items: [], prefs: {} } })).json();
  assert.equal(sync.events[0].item.date, '');
  assert.equal(sync.events[1].type, 'note');
  assert.equal(sync.events[1].note.text, 'Widget fikri');
});

test('Kısayol uç noktası düz metin döner', async () => {
  const t = setup();
  const auth = await linked(t);
  const res = await t.call('/api/quick', { auth, body: 'yarın 9da spor', headers: { 'content-type': 'text/plain' } });
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Spor/);
  assert.match(body, /Yarın · 09:00/);
  const json = await t.call('/api/quick', { auth, body: { text: 'Ekmek al' } });
  assert.match(await json.text(), /Ekmek al/);
  const noAuth = await t.call('/api/quick', { body: 'x' });
  assert.equal(noAuth.status, 401);
});

test('sesli mesaj Whisper ile yazıya çevrilir', async () => {
  const t = setup();
  await linked(t);
  await t.hook(message(undefined, { voice: { file_id: 'v1', duration: 3, file_size: 1000 } }));
  assert.ok(t.calls.some(c => c.ai?.includes('whisper') && c.input.language === 'tr'));
  const reply = lastSent(t);
  assert.match(reply.body.text, /🎙/);
  assert.match(reply.body.text, /Babaannemi ara/);
  assert.match(reply.body.text, /Taslak/);
});

test('kuralların anlamadığı cümle AI yedeğine gider', async () => {
  const t = setup();
  await linked(t);
  await t.hook(message('gelecek ayın ilk cumasında saç kestir'));
  assert.ok(t.calls.some(c => c.ai?.includes('llama')));
  const reply = t.calls.filter(c => c.method === 'sendMessage').at(-1);
  assert.match(reply.body.text, /Saç kestir/);
  assert.match(reply.body.text, /AI/);
});

test('alarm zamanı gelen hatırlatmayı gönderir, düğme tamamlar', async () => {
  const t = setup();
  const auth = await linked(t);
  const { day, minutes } = clockAt(Date.now() + 2 * 60000, 'Europe/Istanbul');
  const item = { id: 'i1', title: 'İlaç', date: day, time: fromMin(minutes), repeat: 'none', weekdays: [], reminders: [5], status: 'pending', exceptions: {} };
  await t.call('/api/sync', { auth, body: { proto: 2, cursor: 0, items: [item], prefs: { timeZone: 'Europe/Istanbul' } } });
  const hub = t.hubs.get('chat:42');
  await hub.alarm();
  const sent = t.calls.filter(c => c.method === 'sendMessage').at(-1);
  assert.match(sent.body.text, /💊 <b>İlaç<\/b>/);
  const done = sent.body.reply_markup.inline_keyboard[0][0].callback_data;
  assert.equal(done, `d:i1:${day}`);
  await hub.alarm();
  assert.equal(t.calls.filter(c => c.method === 'sendMessage' && /İlaç/.test(c.body.text)).length, 1, 'aynı hatırlatma iki kez gitmez');
  await press(t, done);
  const sync = await (await t.call('/api/sync', { auth, body: { proto: 2, cursor: 0, items: [item], prefs: {} } })).json();
  assert.equal(sync.events.at(-1).type, 'patch');
  assert.equal(sync.events.at(-1).patch.status, 'done');
});

test('bağlantıyı kesmek sunucu verisini siler', async () => {
  const t = setup();
  const auth = await linked(t);
  await (await t.call('/api/unlink', { auth, body: {} })).json();
  assert.equal((await t.call('/api/status', { method: 'GET', auth })).status, 401);
});

test('sağlık ve statik dosya yönlendirmesi', async () => {
  const t = setup();
  const h = await (await t.call('/health', { method: 'GET' })).json();
  assert.equal(h.service, 'gun-payi');
  assert.equal(h.bot, true);
  t.env.ASSETS = { fetch: () => new Response('index') };
  assert.equal(await (await t.call('/', { method: 'GET' })).text(), 'index');
});

const realNow = Date.now;
const at = ms => { Date.now = () => ms; };
const edits = t => t.calls.filter(c => c.method === 'editMessageReplyMarkup');

test('tamamlanmayan plan tekrar hatırlatılır, sohbette tek hatırlatma kalır', async () => {
  const t = setup();
  const auth = await linked(t);
  const base = realNow();
  try {
    const { day, minutes } = clockAt(base - 25 * 60000, 'Europe/Istanbul');
    const item = { id: 'n1', title: 'Balıkların suyu', date: day, time: fromMin(minutes), repeat: 'none', weekdays: [], reminders: [], nag: { every: 10, times: 5 }, status: 'pending', exceptions: {} };
    await t.call('/api/sync', { auth, body: { proto: 2, cursor: 0, items: [item], prefs: { timeZone: 'Europe/Istanbul' } } });
    const hub = t.hubs.get('chat:42');
    await hub.alarm();
    const nags = () => t.calls.filter(c => c.method === 'sendMessage' && /Balıkların/.test(c.body.text));
    assert.equal(nags().length, 1, 'kaçırılan tekrarlar tek mesajda toplanır');
    assert.equal(nags()[0].body.text, `🐾 <b>Balıkların suyu</b>\n${item.time}`, 'sade: yalnız iş ve saati');
    assert.ok(btn(nags()[0], 'Ertele'));
    at(base + 11 * 60000);
    await hub.alarm();
    assert.equal(nags().length, 2);
    assert.equal(nags()[1].body.text, nags()[0].body.text, 'kaçıncı tekrar olduğu yazmaz');
    assert.ok(deleted(t).includes(nags()[0].id), 'önceki hatırlatma silinir');
    await press(t, btn(nags()[1], 'Tamamlandı'), nags()[1].id);
    at(base + 40 * 60000);
    await hub.alarm();
    assert.equal(nags().length, 2, 'tamamlanınca tekrar durur');
  } finally { Date.now = realNow; }
});

test('taslakta tekrar hatırlatma düğmeyle ve yazarak seçilir', async () => {
  const t = setup();
  const auth = await linked(t);
  await t.hook(message("yarın 20'de balıkların suyunu değiştir"));
  await press(t, btn(lastSent(t), 'Hatırlat'));
  await press(t, btn(lastSent(t), '10dk×5'));
  assert.match(lastSent(t).body.text, /🔁 Tamamlanmazsa 10 dk'da bir · 5 kez/);
  await t.hook(message('yarım saat arayla 2 kez'));
  assert.match(lastSent(t).body.text, /30 dk'da bir · 2 kez/);
  await press(t, btn(lastSent(t), 'Ekle'));
  const sync = await (await t.call('/api/sync', { auth, body: { proto: 2, cursor: 0, items: [], prefs: {} } })).json();
  assert.deepEqual(sync.events[0].item.nag, { every: 30, times: 2 });
});

// ---------- 5.7: alarm zinciri sahte saatle, hub'ın kurduğu alarmlarla yürür ----------
const TZ = 'Europe/Istanbul';
const ist = (day, time) => zonedMs(day, time, TZ);
async function world(day, time, items = []) {
  const t = setup();
  at(ist(day, time));
  const auth = await linked(t);
  let cursor = 0, local = items.map(i => cleanItem({ repeat: 'none', weekdays: [], status: 'pending', exceptions: {}, ...i }));
  const w = { t, auth, log: [] };
  w.sync = async (change = x => x) => {
    for (let i = 0; i < 4; i++) {
      const r = await (await t.call('/api/sync', { auth, body: { proto: 2, cursor, items: local, prefs: { timeZone: TZ } } })).json();
      assert.equal(r.error, undefined, r.error);
      if (!r.events) { cursor = r.cursor; break; }
      const s = { items: local, notes: [] };
      for (const e of r.events) applyEvent(s, e);
      local = s.items; cursor = r.cursor;
    }
    const next = change(local);
    if (next !== local) { local = next; return w.sync(); }
    return local;
  };
  await w.sync();
  w.hub = t.hubs.get('chat:42');
  const sends = () => t.calls.filter(c => c.method === 'sendMessage');
  // Alarm zinciri: kurulan alarm ne zamansa o an çalışır (schedule() da sınanır)
  w.run = async (toDay, toTime) => {
    const end = ist(toDay, toTime);
    for (let n = 0; w.hub.store.alarm && w.hub.store.alarm <= end; n++) {
      assert.ok(n < 4000, 'alarm döngüye girmedi');
      at(w.hub.store.alarm);
      const before = sends().length;
      await w.hub.alarm();
      for (const c of sends().slice(before)) w.log.push({ at: `${dayAt(Date.now(), TZ)} ${hmAt(Date.now(), TZ)}`, text: c.body.text, id: c.id, body: c.body });
    }
    at(end);
  };
  w.last = () => w.log.at(-1);
  w.times = () => w.log.map(x => x.at);
  w.say = (text, extra) => t.hook(message(text, extra));
  w.drafts = () => sends().filter(c => /<b>Taslak/.test(c.body.text)).length;
  w.card = () => t.calls.filter(c => c.method === 'editMessageText').at(-1)?.body;
  return w;
}
const timed = (name, fn) => test(name, async () => { try { await fn(); } finally { Date.now = realNow; } });
const fish = (x = {}) => ({ id: 'p1', title: 'Balıkları besle', date: '2026-11-22', time: '20:10', reminders: [0], ...x });

timed('erteleme basılan andan sayılır, tekrarlar da o andan yürür', async () => {
  const w = await world('2026-11-22', '19:00', [fish({ nag: { every: 10, times: 3 } })]);
  await w.run('2026-11-22', '20:15');
  await press(w.t, btn(w.last(), 'Ertele'), w.last().id);
  assert.match(w.card().text, /sohbete yaz/);
  const labels = w.card().reply_markup.inline_keyboard.flat().map(b => b.text);
  assert.deepEqual(labels, ['10 dk', '20 dk', '30 dk', '1 saat', '2 saat', 'Yarın', '← Geri'], 'elle gir düğmesi yok');
  await press(w.t, 'z:p1:2026-11-22:20', w.last().id);
  assert.match(w.card().text, /Ertelendi: 20:35/);
  await w.run('2026-11-22', '23:00');
  assert.deepEqual(w.times(), ['10', '35', '45', '55'].map(m => `2026-11-22 20:${m}`).concat('2026-11-22 21:05'));
  assert.ok(w.log.slice(1).every(x => x.text === '🐾 <b>Balıkları besle</b>\n20:35'), 'mesajda yeni saat yazar');
  const item = (await w.sync())[0];
  assert.equal(item.snooze.until, ist('2026-11-22', '20:35'));
});

timed('menüde beklerken geçen süre de sayılır: an, düğmeye basılan andır', async () => {
  const w = await world('2026-11-22', '19:00', [fish()]);
  await w.run('2026-11-22', '20:15');
  await press(w.t, btn(w.last(), 'Ertele'), w.last().id);
  await w.run('2026-11-22', '20:22');
  await press(w.t, 'z:p1:2026-11-22:10', w.last().id);
  await w.run('2026-11-22', '23:00');
  assert.equal(w.last().at, '2026-11-22 20:32');
});

timed('Ertele açıkken sohbete yazılan süre plan olmaz', async () => {
  for (const [typed, expected] of [['15', '22 20:30'], ['42 dakika', '22 20:57'], ['1G', '23 20:15'], ['1 gün 5 dakika', '23 20:20'], ['1 gün ve 5 saat', '24 01:15'], ['21:30', '22 21:30'], ['2130', '22 21:30'], ['yarın 9\'da', '23 09:00'], ['bir buçuk saat sonra ertele', '22 21:45']]) {
    const w = await world('2026-11-22', '19:00', [fish()]);
    await w.run('2026-11-22', '20:15');
    await press(w.t, btn(w.last(), 'Ertele'), w.last().id);
    await w.say(typed);
    assert.equal(w.drafts(), 0, typed);
    await w.run('2026-11-25', '00:00');
    assert.equal(w.last().at, '2026-11-' + expected, typed);
  }
});

timed('Ertele\'ye basmadan da süre yazılır; yanıtlanan hatırlatma ertelenir', async () => {
  const w = await world('2026-11-22', '19:00', [fish(), fish({ id: 'p2', title: 'Fatura öde', time: '20:12' })]);
  await w.run('2026-11-22', '20:15');
  const [first] = w.log;
  await w.say('30 dakika');
  assert.equal(w.hub.s.cal.items[1].snooze.until, ist('2026-11-22', '20:45'), 'son hatırlatma');
  await w.say('5', { reply_to_message: { message_id: first.id } });
  assert.equal(w.hub.s.cal.items[0].snooze.until, ist('2026-11-22', '20:20'), 'yanıtlanan hatırlatma');
  assert.equal(w.drafts(), 0);
});

timed('anlamsız süre sorulur, açıkça yeni plan yazılırsa plan olur', async () => {
  const w = await world('2026-11-22', '19:00', [fish()]);
  await w.run('2026-11-22', '20:15');
  await press(w.t, btn(w.last(), 'Ertele'), w.last().id);
  await w.say('anlamsız');
  const asked = lastSent(w.t);
  assert.match(asked.body.text, /Süreyi anlayamadım/);
  await w.say('20 dakika');
  assert.ok(deleted(w.t).includes(asked.id), 'uyarı temizlenir');
  await press(w.t, btn({ body: w.card() }, 'Değiştir'), w.last().id);
  await w.say('yarın markete git');
  assert.equal(w.drafts(), 1);
  assert.equal(w.hub.s.snoozeAwait, null);
});

timed('hatırlatma yokken çıplak süre plan yapılmaz, yol gösterilir', async () => {
  const w = await world('2026-11-22', '19:00');
  await w.say('15 dakika');
  assert.equal(w.drafts(), 0);
  assert.match(lastSent(w.t).body.text, /Ertelenecek bir hatırlatma yok/);
});

timed('erken hatırlatmayı ertelemek plan saatini yutmaz, çift de çalmaz', async () => {
  let w = await world('2026-11-22', '19:00', [fish({ reminders: [10, 0] })]);
  await w.run('2026-11-22', '20:01');
  await w.say('5 dk');
  await w.run('2026-11-22', '21:00');
  assert.deepEqual(w.times(), ['2026-11-22 20:00', '2026-11-22 20:06', '2026-11-22 20:10']);
  assert.equal(w.log[1].text, '🐾 <b>Balıkları besle</b>\n20:10', 'plan saati değişmedi');
  w = await world('2026-11-22', '19:00', [fish({ reminders: [10, 0] })]);
  await w.run('2026-11-22', '20:00');
  await w.say('10 dk');
  await w.run('2026-11-22', '21:00');
  assert.deepEqual(w.times(), ['2026-11-22 20:00', '2026-11-22 20:10']);
});

timed('uygulamadan erteleme Telegram kartına ve alarma yansır', async () => {
  const w = await world('2026-11-22', '19:00', [fish()]);
  await w.run('2026-11-22', '20:15');
  await w.sync(list => list.map(i => patchOccurrence(i, i.date, { snooze: makeSnooze(i, Date.now() + 42 * 60000, Date.now()) })));
  assert.match(w.card().text, /Ertelendi: 20:57/);
  await w.run('2026-11-22', '23:00');
  assert.deepEqual(w.times(), ['2026-11-22 20:10', '2026-11-22 20:57']);
});

timed('tekrarlayan planda yalnız o gün ertelenir', async () => {
  const w = await world('2026-11-22', '19:00', [fish({ repeat: 'daily' })]);
  await w.run('2026-11-22', '20:15');
  await w.say('1 saat');
  await w.run('2026-11-23', '23:00');
  assert.deepEqual(w.times(), ['2026-11-22 20:10', '2026-11-22 21:15', '2026-11-23 20:10']);
});

timed('ertelenip tamamlanan plan susar', async () => {
  const w = await world('2026-11-22', '19:00', [fish()]);
  await w.run('2026-11-22', '20:15');
  await w.say('1 saat');
  await press(w.t, 'd:p1:2026-11-22', w.last().id);
  await w.run('2026-11-23', '23:00');
  assert.equal(w.log.length, 1);
});

timed('nişan: 1 ay ve 1 hafta önce, saatsiz planda da gelir', async () => {
  const w = await world('2026-11-22', '19:00');
  await w.t.call('/api/quick', { auth: w.auth, body: { text: "24 Nisan'da arkadaşımın nişanı var. Bana bunu bir ay önce hatırlat. Bir de bir hafta önce hatırlat" } });
  await w.sync();
  await w.run('2027-05-01', '00:00');
  assert.deepEqual(w.times(), ['2027-03-24 09:00', '2027-04-17 09:00']);
  assert.match(w.log[0].text, /^🎂 <b>Arkadaşımın nişanı<\/b>\n24 Nisan Cumartesi/);
});

timed('28 gün ve 1 yıl önce de gelir', async () => {
  const w = await world('2026-11-22', '19:00', [fish({ id: 'u', date: '2028-03-15', time: '14:00', reminders: ['M12', 40320] })]);
  await w.run('2028-03-16', '00:00');
  assert.deepEqual(w.times(), ['2027-03-15 14:00', '2028-02-16 14:00']);
});

timed('fatura: aralıkta her gün, bitince 3 gün sonra, ödenince susar, sonraki ay yeniden', async () => {
  const w = await world('2026-11-22', '19:00');
  await w.t.call('/api/quick', { auth: w.auth, body: { text: "Elektrik faturası her ayın 10'u ile 15'i arası" } });
  await w.sync();
  await w.run('2026-12-31', '23:00');
  assert.deepEqual(w.times(), [10, 11, 12, 13, 14, 15, 18].map(d => `2026-12-${d} 09:00`), 'ödenmezse');
  assert.equal(w.last().text, '💡 <b>Elektrik faturası</b>\n10–15 Aralık');
  w.log.length = 0;
  await w.run('2027-01-12', '10:00');
  assert.deepEqual(w.times(), [10, 11, 12].map(d => `2027-01-${d} 09:00`));
  assert.ok(btn(w.last(), 'Ödedim'));
  await press(w.t, btn(w.last(), 'Ödedim'), w.last().id);
  assert.equal((await w.sync())[0].exceptions['2027-01-01'].doneOn, '2027-01-12');
  await w.run('2027-02-09', '23:00');
  assert.equal(w.log.length, 3, 'ödenince ek hatırlatma da gelmez');
  await w.run('2027-02-10', '10:00');
  assert.equal(w.last().at, '2027-02-10 09:00', 'sonraki dönem yeniden başlar');
});

timed('uygulamada erken ödenen fatura o dönem hiç hatırlatmaz', async () => {
  const bill = { id: 'b', title: 'Su faturası', date: '2026-12-10', repeat: 'monthly', bill: { type: 'su', from: 10, to: 15, before: [], after: [3] } };
  const w = await world('2026-11-22', '19:00', [bill]);
  await w.sync(list => list.map(i => patchOccurrence(i, '2026-12-01', donePatch(i, 'done', '2026-11-22'))));
  await w.run('2026-12-31', '23:00');
  assert.equal(w.log.length, 0);
});

timed('fatura ertelenince o ana kadar susar, sonra günlük düzen sürer', async () => {
  const bill = { id: 'b', title: 'Doğalgaz faturası', date: '2026-12-10', repeat: 'monthly', bill: { type: 'dogalgaz', from: 10, to: 15, before: [], after: [3] } };
  const w = await world('2026-12-09', '19:00', [bill]);
  await w.run('2026-12-10', '10:00');
  await w.say('2 gün');
  await w.run('2026-12-31', '23:00');
  assert.deepEqual(w.times(), ['10 09:00', '12 10:00', '13 09:00', '14 09:00', '15 09:00', '18 09:00'].map(x => '2026-12-' + x));
});

timed('otomatik çekim: bir gün önce ve o gün', async () => {
  const w = await world('2026-11-22', '19:00');
  await w.t.call('/api/quick', { auth: w.auth, body: { text: "Claude faturası her ayın 8'inde çekiliyor" } });
  await w.sync();
  await w.run('2026-12-31', '23:00');
  assert.deepEqual(w.times(), ['2026-12-07 09:00', '2026-12-08 09:00']);
  assert.ok(btn(w.last(), 'Çekildi'));
});

timed('kısayola "20 dakika ertele" denince plan eklenmez', async () => {
  const w = await world('2026-11-22', '19:00', [fish()]);
  await w.run('2026-11-22', '20:15');
  const res = await (await w.t.call('/api/quick', { auth: w.auth, body: { text: '20 dakika ertele' } })).text();
  assert.match(res, /Ertelendi: 20:35/);
  assert.equal((await w.sync()).length, 1);
});

timed('5.6\'dan bekleyen erteleme kaybolmaz', async () => {
  const w = await world('2026-11-22', '19:00', [fish()]);
  await w.run('2026-11-22', '20:15');
  await w.hub.store.put('snooze', [{ id: 'old', itemId: 'p1', origin: '2026-11-22', title: 'Balıkları besle', time: '20:10', due: ist('2026-11-22', '21:40') }]);
  w.hub.s = null;
  await w.hub.load();
  await w.hub.schedule();
  await w.run('2026-11-22', '23:00');
  assert.equal(w.last().at, '2026-11-22 21:40');
});

timed('eski sürüm uygulama yeni alanları silemez', async () => {
  const bill = { id: 'b', title: 'Kira', date: '2026-12-01', repeat: 'monthly', bill: { type: 'kira', from: 1, to: 1 } };
  const w = await world('2026-11-22', '19:00', [bill]);
  const r = await (await w.t.call('/api/sync', { auth: w.auth, body: { cursor: w.hub.s.seq, items: [{ ...bill, bill: undefined }], prefs: {} } })).json();
  assert.match(r.error, /kapatıp yeniden aç/);
  assert.ok(w.hub.s.cal.items[0].bill);
});

timed('hatırlatma geldikten sonra tekrarlıya çevrilen plan bozulmaz', async () => {
  const w = await world('2026-11-22', '19:00', [fish()]);
  await w.run('2026-11-22', '20:15');
  await w.sync(list => list.map(i => cleanItem({ ...i, repeat: 'daily' })));
  await w.say('15 dakika');
  assert.ok(w.hub.s.cal.items.every(i => !('' in i.exceptions)), 'boş günlü istisna yazılmaz');
  assert.equal((await w.sync()).length, 1);
});

test('ekleme sayfası: önbelleğe girmez, güncel açılış görselini verir, anahtar istemez', async () => {
  const t = setup();
  const light = await t.call('/api/kur', { method: 'GET' });
  assert.equal(light.status, 200);
  assert.match(light.headers.get('cache-control'), /no-store/);
  const html = await light.text();
  assert.match(html, /href="\/manifest\.webmanifest"/);
  assert.match(html, /\/icons\/splash-750x1334\.png/);
  assert.doesNotMatch(html, /<script/, 'uygulama kodu çalışmaz, eşitleme yapmaz');
  const dark = await (await t.call('/api/kur?koyu=1', { method: 'GET' })).text();
  assert.match(dark, /\/icons\/splash-koyu-750x1334\.png/);
  for (const [, p] of (html + dark).matchAll(/href="\/(icons\/[^"]+)"/g)) assert.ok(existsSync(new URL('../web/' + p, import.meta.url)), p);
});
