import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, cleanTitle, parseDurations, parseClock } from '../web/js/parse.js';

// 18 Kasım 2026 Çarşamba, İstanbul 10:00
const now = Date.parse('2026-11-18T07:00:00Z');
const p = text => parse(text, { now, tz: 'Europe/Istanbul' });
const pick = r => ({ title: r.title, date: r.date, time: r.time, endTime: r.endTime, repeat: r.repeat, weekdays: r.weekdays, reminders: r.reminders });

const cases = [
  ["Her cuma babaannemi aramam için gerekli olan şeyi ekle", { title: 'Babaannemi ara', date: '2026-11-20', time: '', endTime: '', repeat: 'weekly', weekdays: [5], reminders: null }],
  ["Her cuma saat 12'de babaannemi ara", { title: 'Babaannemi ara', date: '2026-11-20', time: '12:00', endTime: '', repeat: 'weekly', weekdays: [5], reminders: null }],
  ["Her cumartesi ve pazar günleri sabah saat 9'da yürüyüş ekle, hatırlatma olarak 10 dakika önce ve 15 dakika önceyi seç", { title: 'Yürüyüş', date: '2026-11-21', time: '09:00', endTime: '', repeat: 'weekly', weekdays: [6, 0], reminders: [10, 15] }],
  ["yarın sabah 9'da koşu", { title: 'Koşu', date: '2026-11-19', time: '09:00', endTime: '', repeat: 'none', weekdays: [], reminders: null }],
  ["bugün akşam 8'de film izle", { title: 'Film izle', date: '2026-11-18', time: '20:00', endTime: '', repeat: 'none', weekdays: [], reminders: null }],
  ["her gün 22:00 kitap oku 15 dk önce hatırlat", { title: 'Kitap oku', date: '2026-11-18', time: '22:00', endTime: '', repeat: 'daily', weekdays: [], reminders: [15] }],
  ["hafta içi her gün 07:30 ilaç", { title: 'İlaç', date: '2026-11-18', time: '07:30', endTime: '', repeat: 'weekly', weekdays: [1, 2, 3, 4, 5], reminders: null }],
  ["her ayın 5'inde kira öde", { title: 'Kira öde', date: '2026-12-05', time: '', endTime: '', repeat: 'monthly', weekdays: [], reminders: null }],
  ["pazartesi 10:00-11:30 diş randevusu", { title: 'Diş randevusu', date: '2026-11-23', time: '10:00', endTime: '11:30', repeat: 'none', weekdays: [], reminders: null }],
  ["18 kasım 14:00'te sunum", { title: 'Sunum', date: '2026-11-18', time: '14:00', endTime: '', repeat: 'none', weekdays: [], reminders: null }],
  ["yarın 3'te dişçi, yarım saat önce hatırlat", { title: 'Dişçi', date: '2026-11-19', time: '15:00', endTime: '', repeat: 'none', weekdays: [], reminders: [30] }],
  ["haftaya salı saat on ikide toplantı", { title: 'Toplantı', date: '2026-11-24', time: '12:00', endTime: '', repeat: 'none', weekdays: [], reminders: null }],
  ["salıları spor", { title: 'Spor', date: '2026-11-24', time: '', endTime: '', repeat: 'weekly', weekdays: [2], reminders: null }],
  ["Ahmet'i ara saat 5'te", { title: "Ahmet'i ara", date: '2026-11-18', time: '17:00', endTime: '', repeat: 'none', weekdays: [], reminders: null }],
  ["sabahları 7'de kalk", { title: 'Kalk', date: '2026-11-18', time: '07:00', endTime: '', repeat: 'daily', weekdays: [], reminders: null }],
  ["on dakika önce hatırlat yarın 14.30 toplantı", { title: 'Toplantı', date: '2026-11-19', time: '14:30', endTime: '', repeat: 'none', weekdays: [], reminders: [10] }],
  ["15 aralık doğum günü 1 gün önce hatırlat", { title: 'Doğum günü', date: '2026-12-15', time: '', endTime: '', repeat: 'none', weekdays: [], reminders: [1440] }],
  ["gece 12'de ilacı al", { title: 'İlacı al', date: '2026-11-19', time: '00:00', endTime: '', repeat: 'none', weekdays: [], reminders: null }],
  ["kira ödemeyi unutma her ayın 1'inde", { title: 'Kira öde', date: '2026-12-01', time: '', endTime: '', repeat: 'monthly', weekdays: [], reminders: null }],
  ["Cumartesi 14-16 arası ders", { title: 'Ders', date: '2026-11-21', time: '14:00', endTime: '16:00', repeat: 'none', weekdays: [], reminders: null }],
  ["her hafta sonu saat 10'da pazar alışverişi", { title: 'Pazar alışverişi', date: '2026-11-21', time: '10:00', endTime: '', repeat: 'weekly', weekdays: [6, 0], reminders: null }],
  ["Bugün 21:30'da annemle görüntülü konuş tam vaktinde hatırlat", { title: 'Annemle görüntülü konuş', date: '2026-11-18', time: '21:30', endTime: '', repeat: 'none', weekdays: [], reminders: [0] }],
  ["Hafta içi 16:00-01:00 depo vardiyası", { title: 'Depo vardiyası', date: '2026-11-18', time: '16:00', endTime: '01:00', repeat: 'weekly', weekdays: [1, 2, 3, 4, 5], reminders: null }],
  ["yarın 03:30 uçak", { title: 'Uçak', date: '2026-11-19', time: '03:30', endTime: '', repeat: 'none', weekdays: [], reminders: null }],
  ["Ekmek al", { title: 'Ekmek al', date: '', time: '', endTime: '', repeat: 'none', weekdays: [], reminders: null }],
  ["Öğle yemeği Mehmet ile", { title: 'Öğle yemeği Mehmet ile', date: '', time: '', endTime: '', repeat: 'none', weekdays: [], reminders: null }],
];

for (const [text, want] of cases) {
  test(`çözümler: ${text}`, () => assert.deepEqual(pick(p(text)), want));
}

test('gün dilimi tahmini işaretlenir', () => {
  const r = p('cuma akşamı annemi ara');
  assert.equal(r.time, '19:00');
  assert.equal(r.timeGuess, true);
  assert.equal(r.date, '2026-11-20');
});

test('saati geçmiş tek seferlik plan yarına kayar', () => {
  const r = p('saat 9:00 kahvaltı');
  assert.equal(r.date, '2026-11-19');
});

test('not ön eki not türü verir', () => {
  const r = p('not: Uygulamaya widget fikri');
  assert.equal(r.kind, 'note');
  assert.equal(r.title, 'Uygulamaya widget fikri');
  assert.equal(p('Not defteri al').kind, 'task');
});

test('anlaşılmayan zaman ifadesi şüphe bırakır', () => {
  assert.ok(p('her iki haftada bir saç kestir').doubt.length);
  assert.ok(p('her 2 saatte bir su iç').doubt.length);
  assert.equal(p('Ekmek al').doubt.length, 0);
});

test('başlık temizliği fiil kalıbını sadeleştirir', () => {
  assert.equal(cleanTitle('babaannemi aramam için gerekli olan şeyi ekle'), 'Babaannemi ara');
  assert.equal(cleanTitle('faturayı ödemeyi unutma'), 'Faturayı öde');
  assert.equal(cleanTitle('çöpü çıkar'), 'Çöpü çıkar');
});

test('yazılan süreler hatırlatma listesine çevrilir', () => {
  assert.deepEqual(parseDurations('30 dk'), [30]);
  assert.deepEqual(parseDurations('1 sa 15 dk'), [75]);
  assert.deepEqual(parseDurations('1 saat 15 dakika'), [75]);
  assert.deepEqual(parseDurations('10 ve 15 dk'), [15, 10]);
  assert.deepEqual(parseDurations('10, 15, 30 dk'), [30, 15, 10]);
  assert.deepEqual(parseDurations('yarım saat'), [30]);
  assert.deepEqual(parseDurations('15 sn'), [0.25]);
  assert.deepEqual(parseDurations('1,5 saat'), [90]);
  assert.deepEqual(parseDurations('vaktinde ve 10 dk'), [10, 0]);
  assert.deepEqual(parseDurations('on beş dakika'), [15]);
  assert.deepEqual(parseDurations('yok'), []);
  assert.equal(parseDurations('abc'), null);
});

test('yazılan saat esnek okunur', () => {
  assert.equal(parseClock('17:34'), '17:34');
  assert.equal(parseClock('17 34'), '17:34');
  assert.equal(parseClock('1734'), '17:34');
  assert.equal(parseClock('930'), '09:30');
  assert.equal(parseClock('17'), '17:00');
  assert.equal(parseClock('akşam 8', { now, tz: 'Europe/Istanbul' }), '20:00');
  assert.equal(parseClock('xyz'), '');
});
