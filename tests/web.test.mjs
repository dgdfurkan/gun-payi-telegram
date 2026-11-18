import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { applyEvent, parseBackup, fresh } from '../web/js/store.js';
import { itemsOn, jobsFor, remindersLabel, repeatLabel, cleanItem, patchOccurrence, zonedMs } from '../web/js/core.js';
import { VERSION } from '../web/js/version.js';

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
