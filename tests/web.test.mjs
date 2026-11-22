import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { applyEvent, parseBackup, fresh } from '../web/js/store.js';
import { itemsOn, jobsFor, remindersLabel, repeatLabel, cleanItem, patchOccurrence, zonedMs, dayAdd, dayAt, activeOn, occurrence, cycleDays, remDue } from '../web/js/core.js';
import { VERSION } from '../web/js/version.js';
import { readMove, checkLossless } from '../web/js/move.js';
import { stepValue, holdDelay } from '../web/js/pickers.js';

const item = (x = {}) => cleanItem({ id: 'a', title: 'Spor', date: '2026-11-18', time: '09:00', repeat: 'none', weekdays: [], ...x });

test('sunucu olayları yerel duruma uygulanır', () => {
  const s = fresh();
  applyEvent(s, { type: 'add', item: item({ repeat: 'weekly', weekdays: [3] }) });
  applyEvent(s, { type: 'patch', id: 'a', origin: '2026-11-18', patch: { status: 'done' } });
  assert.equal(s.items[0].exceptions['2026-11-18'].status, 'done');
  applyEvent(s, { type: 'note', note: { id: 'n', text: 'Fikir', createdAt: '2026-11-18T07:00:00Z' } });
  applyEvent(s, { type: 'note', note: { id: 'n', text: 'Fikir', createdAt: '2026-11-18T07:00:00Z' } });
  assert.equal(s.notes.length, 1, 'aynı not iki kez eklenmez');
  applyEvent(s, { type: 'removeNote', id: 'n' });
  applyEvent(s, { type: 'remove', id: 'a' });
  assert.equal(s.items.length + s.notes.length, 0);
  applyEvent(s, { type: 'add', item: { id: 'bozuk' } });
  assert.equal(s.items.length, 0, 'geçersiz kayıt atlanır');
});

test('eski uygulamanın (schema 1) yedeği içe aktarılır', () => {
  const legacy = {
    schema: 1, revision: 9,
    prefs: { name: 'Furkan', reminderDefaults: [1440, 60], plannerMode: 'list', reviewDay: 0, focus: ['english'] },
    items: [
      { id: 'work-shift', title: 'Depo vardiyası', kind: 'event', date: '2026-11-16', time: '16:00', endTime: '01:00', repeat: 'weekly', weekdays: [1, 2, 3, 4, 5, 6], area: 'work', optional: false, priority: false, status: 'pending', buffer: 0, exceptions: { '2026-11-17': { status: 'postponed' } }, history: [], createdAt: '2026-11-15T10:00:00Z', updatedAt: '2026-11-15T10:00:00Z' },
      { id: 'h1', title: 'Yürüyüş', kind: 'habit', date: '2026-11-15', time: '', repeat: 'daily', weekdays: [], status: 'pending', exceptions: {} },
      { id: 'bad', title: '', date: 'x' },
    ],
    notes: [{ id: 'n1', text: 'Kitap önerisi', tag: 'okuma', kind: 'idea', reviewDates: [], reviewedDates: [], createdAt: '2026-11-15T10:00:00Z', updatedAt: '2026-11-15T10:00:00Z' }],
    goals: [], days: {}, reviews: [{ week: '2026-11-09', answers: ['a', 'b', 'c', 'd', 'e'] }],
  };
  const r = parseBackup(JSON.stringify(legacy));
  assert.equal(r.legacy, true);
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.skipped, ['?']);
  const shift = r.items.find(i => i.id === 'work-shift');
  assert.equal(shift.endTime, '01:00');
  assert.equal(shift.exceptions['2026-11-17'].status, 'cancelled');
  assert.equal(r.items.find(i => i.id === 'h1').kind, 'task');
  assert.equal(r.prefs.plannerMode, 'day');
  assert.equal(r.prefs.name, 'Furkan');
  assert.match(r.notes[0].text, /#okuma/);
  assert.equal(r.reviews[0].answers.length, 5);
  assert.throws(() => parseBackup('{"foo":1}'), /Gün Payı yedeği değil/);
  assert.throws(() => parseBackup('merhaba'), /geçerli bir yedek değil/);
});

test('yeni yedek kendi kendine geri okunur', () => {
  const r = parseBackup(JSON.stringify({ app: 'gun-payi', schema: 2, prefs: fresh().prefs, items: [item()], notes: [], reviews: [] }));
  assert.equal(r.items[0].title, 'Spor');
  assert.equal(r.legacy, false);
});

test('aylık tekrar kısa aylarda son güne düşer', () => {
  const i = item({ date: '2026-01-31', time: '', repeat: 'monthly' });
  assert.equal(itemsOn([i], '2026-02-28').length, 1);
  assert.equal(itemsOn([i], '2026-03-31').length, 1);
  assert.equal(itemsOn([i], '2026-03-30').length, 0);
});

test('tamamlanan ve atlanan gerçekleşme hatırlatma üretmez', () => {
  const now = zonedMs('2026-11-18', '08:00', 'Europe/Istanbul');
  let i = item({ repeat: 'daily', reminders: [10, 0] });
  assert.equal(jobsFor([i], {}, now, 1).filter(j => j.origin === '2026-11-18').length, 2);
  i = patchOccurrence(i, '2026-11-18', { status: 'done' });
  assert.equal(jobsFor([i], {}, now, 1).filter(j => j.origin === '2026-11-18').length, 0);
  const moved = patchOccurrence(item({ repeat: 'daily' }), '2026-11-18', { date: '2026-11-19' });
  assert.equal(itemsOn([moved], '2026-11-19').length, 2, 'taşınan gün hedef günde görünür');
});

test('etiketler kısa ve Türkçe', () => {
  assert.equal(remindersLabel([15, 10]), '10, 15 dk önce');
  assert.equal(remindersLabel([0]), 'Vaktinde');
  assert.equal(remindersLabel([0, 10, 60, 1440]), 'Vaktinde · 10 dk · 1 saat · 1 gün önce');
  assert.equal(remindersLabel([]), 'Hatırlatma yok');
  assert.equal(repeatLabel(item({ repeat: 'weekly', weekdays: [6, 0] })), 'Hafta sonları');
  assert.equal(repeatLabel(item({ repeat: 'weekly', weekdays: [5] })), 'Her Cuma');
  assert.equal(repeatLabel(item({ date: '2026-12-05', repeat: 'monthly' })), "Her ayın 5'i");
});

test('service worker kabuk listesi ve sürüm tutarlı', () => {
  const sw = readFileSync(new URL('../web/sw.js', import.meta.url), 'utf8');
  assert.match(sw, new RegExp(`const VERSION = '${VERSION.replace(/\./g, '\\.')}'`));
  for (const f of readdirSync(new URL('../web/js/', import.meta.url))) assert.ok(sw.includes(`'/js/${f}'`), `${f} önbellek listesinde`);
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  for (const [, p] of html.matchAll(/(?:href|src)="\/([^"]+)"/g)) assert.ok(existsSync(new URL('../web/' + p, import.meta.url)), `${p} mevcut`);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, VERSION);
});

test('tekrar hatırlatma tamamlanana kadar iş üretir', () => {
  const start = zonedMs('2026-11-18', '20:00', 'Europe/Istanbul');
  let i = item({ time: '20:00', reminders: [10], nag: { every: 10, times: 5 } });
  assert.deepEqual(cleanItem(i).nag, { every: 10, times: 5 });
  assert.equal(cleanItem({ ...i, nag: { every: 0, times: 5 } }).nag, null);
  const jobs = jobsFor([i], {}, start - 15 * 60000, 1).filter(j => j.origin === '2026-11-18');
  assert.deepEqual(jobs.map(j => (j.due - start) / 60000).sort((a, b) => a - b), [-10, 0, 10, 20, 30, 40, 50]);
  assert.deepEqual(jobs.filter(j => j.nag).map(j => j.nag).sort(), [1, 2, 3, 4, 5]);
  assert.ok(jobsFor([i], {}, start + 35 * 60000, 1).some(j => j.nag === 4), 'saat geçse de tekrarlar sürer');
  i = patchOccurrence(i, '2026-11-18', { status: 'done' });
  assert.equal(jobsFor([i], {}, start + 5 * 60000, 1).filter(j => j.origin === '2026-11-18').length, 0, 'tamamlanınca durur');
});

test('aylık 31, aralıklı ve yıllık tekrar doğru güne düşer', () => {
  const m = item({ date: '2026-11-30', monthDay: 31, repeat: 'monthly' });
  assert.equal(itemsOn([m], '2026-12-31').length, 1);
  assert.equal(itemsOn([m], '2026-12-30').length, 0);
  const two = item({ date: '2026-11-18', repeat: 'weekly', interval: 2, weekdays: [3] });
  assert.deepEqual(['2026-11-25', '2026-12-02'].map(d => itemsOn([two], d).length), [0, 1]);
  const y = item({ date: '2028-02-29', repeat: 'yearly' });
  assert.deepEqual(['2029-02-28', '2029-03-28'].map(d => itemsOn([y], d).length), [1, 0]);
});

// Hızlı pencere hesabı, bütün günleri tek tek deneyen kaba hesapla aynı sonucu vermeli
test('zamanlama: rastgele 1500 planda kaba hesapla birebir', () => {
  const tz = 'Europe/Istanbul';
  let seed = 7;
  const rnd = n => { seed = (seed * 16807) % 2147483647; return seed % n; };
  const REMS = [0, 1, 15, 75, 1440, 10080, 40320, 'M1', 'M2', 'M12', 'M1+4320'];
  for (let n = 0; n < 1500; n++) {
    const date = dayAdd('2026-01-01', rnd(500));
    const repeat = ['none', 'daily', 'weekly', 'monthly', 'yearly'][rnd(5)];
    const bill = rnd(5) === 0 ? { type: 'su', from: 1 + rnd(31), to: 1 + rnd(31), before: rnd(2) ? [1 + rnd(10)] : [], after: rnd(2) ? [1 + rnd(40)] : [] } : null;
    const it = item({ date, time: ['00:05', '09:00', '20:10', '23:59'][rnd(4)], repeat, interval: 1 + rnd(3), weekdays: repeat === 'weekly' ? [rnd(7)] : [], reminders: [REMS[rnd(REMS.length)], REMS[rnd(REMS.length)]], bill });
    const now = zonedMs(dayAdd('2026-06-01', rnd(500)), '12:00', tz) + rnd(86400) * 1000;
    const lo = now - 30 * 60000, hi = now + 8 * 86400000, want = new Set();
    const base = dayAdd(dayAt(now, tz), it.bill ? -110 : -2);
    for (let i = 0; i < (it.bill ? 180 : 420); i++) {
      const day = dayAdd(base, i);
      if (!activeOn(it, day)) continue;
      const o = occurrence(it, day), start = zonedMs(o.date, o.time, tz);
      const dues = it.bill ? cycleDays(it.bill, day).map(d => zonedMs(d, o.time, tz)) : start >= now - 5 * 60000 ? it.reminders.map(v => remDue(v, o.date, o.time, tz)) : [];
      for (const due of dues) if (due >= lo && due <= hi) want.add(`${day}@${due}`);
    }
    const got = new Set(jobsFor([it], { timeZone: tz }, now, 8).map(j => `${j.origin}@${j.due}`));
    assert.deepEqual([...got].sort(), [...want].sort(), JSON.stringify(it) + ' @' + new Date(now).toISOString());
  }
});

test('taşıma: planlar, faturalar, uzun not, ödeme bilgisi ve bağlantı kayıpsız', () => {
  const bill = cleanItem({ id: 'b', title: 'Elektrik faturası', date: '2026-11-10', repeat: 'monthly', bill: { type: 'elektrik', from: 10, to: 15, before: [], after: [3] }, exceptions: { '2026-11-01': { status: 'done', doneOn: '2026-11-12' } } });
  const state = { ...fresh(), items: [item({ reminders: ['M1', 43200] }), bill], notes: [{ id: 'n', text: 'x'.repeat(9000), createdAt: '2026-11-22T10:00:00Z', updatedAt: '2026-11-22T10:00:00Z' }] };
  const link = { chatId: 42, secret: 'a'.repeat(64), name: 'Deneme', bot: 'TestBot', at: 5 };
  const avatar = { img: 'data:image/jpeg;base64,AAAA', frame: 'gold' };
  const text = JSON.stringify({ app: 'gun-payi', schema: 2, prefs: state.prefs, items: state.items, notes: state.notes, reviews: [], move: { v: 1, cursor: 17, link, avatar } });
  assert.ok(checkLossless(text, state));
  const back = parseBackup(text);
  assert.deepEqual(back.items, state.items);
  assert.equal(back.notes[0].text.length, 9000);
  assert.deepEqual(readMove(JSON.parse(text)), { cursor: 17, link, avatar });
  assert.equal(checkLossless(text, { ...state, items: [...state.items, bill] }), false, 'eksik veriyle taşıma başlamaz');
});

test('taşıma: panodan gelen zararlı alanlar alınmaz', () => {
  const r = readMove({ move: { v: 1, cursor: -4, link: { chatId: '1"><b>', secret: 'kısa' }, avatar: { img: 'x" onerror="alert(1)', frame: '<svg>' } } });
  assert.deepEqual(r, { cursor: 0, link: null, avatar: { frame: 'none' } });
  assert.equal(readMove({ schema: 2, items: [] }), null);
});

test('artı eksi birer birer, basılı tutunca hızlanır', () => {
  assert.deepEqual([1, 10, 20, 29, 999].map(v => stepValue(v, 1)), [2, 11, 21, 30, 1000]);
  assert.deepEqual([30, 11, 2, 1].map(v => stepValue(v, -1)), [29, 10, 1, 1]);
  assert.equal(stepValue(999, 1, 1, 999), 999);
  let total = 0, steps = 0;
  while (total < 2000) total += holdDelay(steps++);
  assert.ok(steps > 40, `2 saniyede ${steps} adım`);
  assert.ok(holdDelay(0) > holdDelay(10));
});
