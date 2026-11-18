import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { ReminderHub } from '../worker/index.js';
import { webhookSecret } from '../worker/hub.js';
import { clockAt, fromMin } from '../web/js/core.js';

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
  let sync = await (await t.call('/api/sync', { auth, body: { cursor: 0, items: [], prefs: {} } })).json();
  assert.equal(sync.ok, true, 'taslak onaylanmadan plan eklenmez');
  await press(t, btn(draft, 'Ekle'));
  assert.match(lastSent(t).body.text, /✅/);
  sync = await (await t.call('/api/sync', { auth, body: { cursor: 0, items: [], prefs: {} } })).json();
  assert.equal(sync.events.length, 1);
  const item = sync.events[0].item;
  assert.deepEqual(item.weekdays, [5]);
  assert.deepEqual(item.reminders, [15, 10]);
  const second = await (await t.call('/api/sync', { auth, body: { cursor: sync.cursor, items: [item], prefs: { timeZone: 'Europe/Istanbul' } } })).json();
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
  const sync = await (await t.call('/api/sync', { auth, body: { cursor: 0, items: [], prefs: {} } })).json();
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
  const sync = await (await t.call('/api/sync', { auth, body: { cursor: 0, items: [], prefs: {} } })).json();
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
  const first = await (await t.call('/api/sync', { auth, body: { cursor: 0, items: [], prefs: {} } })).json();
  const item = first.events[0].item;
  await t.call('/api/sync', { auth, body: { cursor: first.cursor, items: [item], prefs: {} } });
  await t.call('/api/sync', { auth, body: { cursor: first.cursor, items: [{ ...item, status: 'done' }], prefs: {} } });
  assert.ok(deleted(t).includes(card), 'uygulamada tamamlanınca kart silinir');
});

test('hatırlatmadaki Tamamlandı mesajları siler, eskimiş düğme takılmaz', async () => {
  const t = setup();
  const auth = await linked(t);
  const { day, minutes } = clockAt(Date.now() + 2 * 60000, 'Europe/Istanbul');
  const item = { id: 'r1', title: 'İlaç', date: day, time: fromMin(minutes), repeat: 'none', weekdays: [], reminders: [5], status: 'pending', exceptions: {} };
  await t.call('/api/sync', { auth, body: { cursor: 0, items: [item], prefs: { timeZone: 'Europe/Istanbul' } } });
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
  const sync = await (await t.call('/api/sync', { auth, body: { cursor: 0, items: [], prefs: {} } })).json();
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
  await t.hook(message('her iki haftada bir saç kestir'));
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
  await t.call('/api/sync', { auth, body: { cursor: 0, items: [item], prefs: { timeZone: 'Europe/Istanbul' } } });
  const hub = t.hubs.get('chat:42');
  await hub.alarm();
  const sent = t.calls.filter(c => c.method === 'sendMessage').at(-1);
  assert.match(sent.body.text, /💊 <b>İlaç<\/b>/);
  const done = sent.body.reply_markup.inline_keyboard[0][0].callback_data;
  assert.equal(done, `d:i1:${day}`);
  await hub.alarm();
  assert.equal(t.calls.filter(c => c.method === 'sendMessage' && /İlaç/.test(c.body.text)).length, 1, 'aynı hatırlatma iki kez gitmez');
  await press(t, done);
  const sync = await (await t.call('/api/sync', { auth, body: { cursor: 0, items: [item], prefs: {} } })).json();
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
