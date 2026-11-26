import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, cleanTitle, parseDurations, parseClock, parseNag, nagLabel } from '../web/js/parse.js';

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
  assert.ok(p('gelecek ayın ilk cumasında saç kestir').doubt.length);
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

test('tamamlanmazsa tekrar hatırlat ifadeleri', () => {
  const r = p("Akşam 8'de balıkların suyu değiştirilecek. Tekrar hatırlat 10 dakika içinde 5 kere");
  assert.equal(r.title, 'Balıkların suyu değiştirilecek');
  assert.equal(r.time, '20:00');
  assert.deepEqual(r.nag, { every: 10, times: 5 });
  assert.deepEqual(p('yarın 9da spor, yarım saat içinde 2 kere hatırlat').nag, { every: 30, times: 2 });
  assert.deepEqual(p('her gün 22:00 ilaç 5 kere 10 dakikada bir hatırlat').nag, { every: 10, times: 5 });
  assert.deepEqual(p('yarın 10da toplantı 1 saat arayla 2 kez hatırlat').nag, { every: 60, times: 2 });
  assert.deepEqual(p("yarın 7'de kalk tekrar hatırlat").nag, { every: 10, times: 3 });
  const both = p("Her pazar akşam 8'de balıkların suyunu değiştir, 15 dakika önce hatırlat, tamamlamazsam 10 dakikada bir 5 kere hatırlat");
  assert.equal(both.title, 'Balıkların suyunu değiştir');
  assert.deepEqual([both.repeat, both.weekdays, both.time, both.reminders, both.nag], ['weekly', [0], '20:00', [15], { every: 10, times: 5 }]);
  assert.equal(p("yarın 9'da spor, yapmazsam 3 kere tekrar hatırlat").title, 'Spor');
  assert.equal(p("yarın 3'te dişçi, yarım saat önce hatırlat").nag, null, 'önceden hatırlatma tekrar sayılmaz');
  assert.deepEqual(p("yarın 3'te dişçi, yarım saat önce hatırlat").reminders, [30]);
  assert.deepEqual(parseNag('10 dk içinde 5 kere'), { every: 10, times: 5 });
  assert.deepEqual(parseNag('her 15 dakikada bir'), { every: 15, times: 3 });
  assert.deepEqual(parseNag('3 kere'), { every: 10, times: 3 });
  assert.equal(parseNag('yok'), false);
  assert.equal(parseNag('30 dk'), null, 'tek süre hatırlatmadır, tekrar değil');
  assert.equal(nagLabel({ every: 10, times: 5 }), "10 dk'da bir · 5 kez");
  assert.equal(nagLabel({ every: 60, times: 2 }), '1 saatte bir · 2 kez');
});

test('erteleme süreleri yazılabilir', () => {
  assert.deepEqual(parseDurations('1G'), [1440]);
  assert.deepEqual(parseDurations('1 gün 5 dakika'), [1445]);
  assert.deepEqual(parseDurations('1 gün 5 saat'), [1740]);
  assert.deepEqual(parseDurations('42 dakika'), [42]);
  assert.deepEqual(parseDurations('1 hafta'), [10080]);
});

test('sesle not: iki nokta söylemeden', () => {
  const n = t => { const r = p(t); return r.kind === 'note' ? r.title : `(${r.kind}) ${r.title}`; };
  assert.equal(n('Not balık yemi bitmek üzere'), 'Balık yemi bitmek üzere');
  assert.equal(n('Not. Balık yemi bitmek üzere.'), 'Balık yemi bitmek üzere.');
  assert.equal(n("Not, yarın 9'da Ahmet aradı"), "Yarın 9'da Ahmet aradı", 'not metnindeki zaman silinmez');
  assert.equal(n('Not al balık yemi bitti'), 'Balık yemi bitti');
  assert.equal(n('Akvaryum filtresi değişecek not olarak ekle'), 'Akvaryum filtresi değişecek');
  assert.equal(n('Not defteri al'), '(task) Not defteri al');
  assert.equal(n('Notları oku'), '(task) Notları oku');
});

test('göreli saat: "20 dakika sonra", "2 saat sonra"', () => {
  const r = p('20 dakika sonra balıkların suyunu değiştir'); // şimdi 10:00
  assert.deepEqual([r.title, r.date, r.time, r.reminders], ['Balıkların suyunu değiştir', '2026-11-18', '10:20', [0]]);
  assert.equal(p('Balıkların suyunu değiştir 2 saat sonra').time, '12:00');
  assert.equal(p('yarım saat sonra balıkları besle').time, '10:30');
  assert.equal(p('bir buçuk saat sonra çamaşırları as').time, '11:30');
  assert.equal(p('1 saat 15 dakika sonra fırını kapat').time, '11:15');
  const late = p('15 saat sonra uyan');
  assert.deepEqual([late.date, late.time], ['2026-11-19', '01:00'], 'gece yarısını geçince ertesi gün');
  assert.deepEqual(p('20 dakika sonra ilaç, 10 dakikada bir 3 kere hatırlat').nag, { every: 10, times: 3 });
  assert.deepEqual(p('20 dakika sonra toplantı, 5 dakika önce hatırlat').reminders, [5]);
});

test('iOS metni: ayrık harfler ve farklı kesme işaretleri', () => {
  const s = "Bugün saat 3'te Engin abilere Reels videosu yükleyeceğim 3 kere hatırlat";
  for (const t of [s, s.normalize('NFD'), s.replace("'", 'ʼ').normalize('NFD'), s.replace("'", '′')]) {
    const r = p(t);
    assert.deepEqual([r.title, r.date, r.time, r.nag], ['Engin abilere Reels videosu yükle', '2026-11-18', '15:00', { every: 10, times: 3 }], JSON.stringify(t));
  }
  assert.deepEqual(parseDurations('1 gün 5 saat'.normalize('NFD')), [1740]);
});

test('gelecek zaman ve "-meliyim" başlıkta emre döner', () => {
  assert.equal(p("Yarın akşam 8'de babaannemi arayacağım").title, 'Babaannemi ara');
  assert.equal(p('Cuma 10da faturayı ödemeliyim').title, 'Faturayı öde');
  assert.equal(p("Yarın 9'da okula gideceğim").title, 'Okula git');
  assert.equal(p('akşam 8de balıkların suyu değiştirilecek').title, 'Balıkların suyu değiştirilecek');
  assert.deepEqual(p("Yarın 3'te dişçi, 3 kere hatırlat").nag, { every: 10, times: 3 });
});

test('sınırsız hatırlatma: ay, hafta, yıl, 28 gün', () => {
  const r = p("24 Nisan'da arkadaşımın nişanı var bana bunu bir ay önce hatırlat bir de bir hafta önce hatırlat");
  assert.deepEqual([r.title, r.date, r.reminders], ['Arkadaşımın nişanı', '2027-04-24', ['M1', 10080]]);
  assert.deepEqual(p('15 Haziran tatil 1 yıl önce hatırlat').reminders, ['M12']);
  assert.deepEqual(p('15 Haziran tatil 28 gün önce hatırlat').reminders, [40320]);
  assert.deepEqual(parseDurations('1 ay ve 1 hafta'), ['M1', 10080]);
  assert.deepEqual(parseDurations('1 ay 3 gün'), ['M1+4320']);
});

test('fatura cümleleri', () => {
  const b = t => { const r = p(t); return r.bill ? [r.bill.type, r.bill.from, r.bill.to, r.interval, r.time] : null; };
  assert.deepEqual(b("Elektrik faturası her ayın 10'u ile 15'i arası"), ['elektrik', 10, 15, 1, '']);
  assert.deepEqual(b("Elektrik faturası her ayın 10'u ile 15'i arası saat 11'de hatırlat"), ['elektrik', 10, 15, 1, '11:00']);
  assert.deepEqual(b("Su faturası ayın 10'undan 15'ine kadar"), ['su', 10, 15, 1, '']);
  assert.deepEqual(b("Su faturası 2 ayda bir 10'u ile 20'si arası"), ['su', 10, 20, 2, '']);
  assert.deepEqual(b("Telefon faturası her ayın 25'i ile 5'i arası"), ['telefon', 25, 5, 1, '']);
  assert.deepEqual(b('Isınma bedeli her ayın onu ile on beşi arası'), ['isinma', 10, 15, 1, '']);
  assert.deepEqual(b('Aidat her ayın sonunda'), ['aidat', 31, 31, 1, '']);
  assert.deepEqual(p("Elektrik faturası 10'u ile 15'i arası, ödemezsem 5 gün sonra tekrar hatırlat").bill.after, [5]);
  for (const t of ['yarın elektrik faturasını öde', "araba kiralama ayın 5'inde", "ayın 5'inde kiraz topla", "bu ayın 25'inde kredi kartı ekstresi", 'Cumartesi 14-16 arası ders', 'akşam 8 ile 9 arası fatura öde']) assert.equal(b(t), null, t);
});

test('aralıklı ve yıllık tekrar', () => {
  const r = t => [p(t).repeat, p(t).interval];
  assert.deepEqual(r('iki haftada bir salı temizlik'), ['weekly', 2]);
  assert.deepEqual(r('3 günde bir çiçekleri sula'), ['daily', 3]);
  assert.deepEqual(r('6 ayda bir dişçi'), ['monthly', 6]);
  assert.deepEqual(r('her yıl 24 Nisan doğum günü'), ['yearly', 1]);
});

test('"20\'yi 10 geçe", "9\'a 10 kala"', () => {
  const r = t => [p(t).title, p(t).time, p(t).reminders];
  assert.deepEqual(r("20'yi 10 geçe balıkları besle"), ['Balıkları besle', '20:10', null]);
  assert.deepEqual(r("akşam 8'i çeyrek geçe ilaç"), ['İlaç', '20:15', null]);
  assert.deepEqual(r("9'a 10 kala toplantı"), ['Toplantı', '08:50', null]);
  assert.deepEqual(r("akşam sekize çeyrek kala film izle"), ['Film izle', '19:45', null]);
  assert.deepEqual(p('yarın 14:00 toplantı 10 dakika kala hatırlat').reminders, [10]);
  assert.deepEqual([p("Isınma bedeli ayın 10'uyla 15'i arası").bill.to, p("Elektriği her ayın 10'u ile 15'i arası öde").bill.type], [15, 'elektrik']);
});

// ---------- 5.9: ünlem, sürpriz zaman, yeni fatura türleri ----------
test('ünlem ve soru işareti başlıkta kalır', () => {
  assert.equal(p('Ekmek al!').title, 'Ekmek al!');
  assert.equal(p('Faturayı öde! Yarın 10da').title, 'Faturayı öde!');
  assert.equal(p('Kedi maması bitti!!!').title, 'Kedi maması bitti!!!');
  assert.equal(p('Yarın ekmek al, bana hatırlat!').title, 'Ekmek al!');
  assert.equal(p('Ali gelecek mi? Cuma 5te sor').title, 'Ali gelecek mi? Sor');
  assert.equal(p('Yarın 10da toplantı var, hatırlatabilir misin?').title, 'Toplantı');
  assert.equal(p('Not: sınav var, unutma!').title, 'Sınav var, unutma!');
});

test('"bu hafta hatırlat": en sakin günü ve plansız bir saati seçer', async () => {
  const { pickSlot } = await import('../web/js/parse.js');
  const r = p('Kedinin kumunu değiştir, bana bu hafta hatırlat');
  assert.equal(r.title, 'Kedinin kumunu değiştir');
  assert.equal(r.kind, 'event');
  assert.deepEqual(r.doubt, []);
  assert.deepEqual(r.reminders, [0]);
  assert.deepEqual(r.surprise, { day: true, from: '2026-11-18', to: '2026-11-22' });
  assert.ok(r.date >= '2026-11-19' && r.date <= '2026-11-22', 'bugün değil, haftanın kalanı: ' + r.date);
  assert.ok(r.time >= '10:00' && r.time <= '20:30', r.time);
  assert.deepEqual(pick(p('Kedinin kumunu değiştir, bana bu hafta hatırlat')), pick(r), 'aynı cümle aynı sonuç');
  // Dolu günler atlanır
  const busy = ['2026-11-19', '2026-11-20', '2026-11-21'].map((date, i) => ({ id: 'b' + i, title: 'Dolu', date, time: '', endTime: '', repeat: 'none', weekdays: [], interval: 1, status: 'pending' }));
  assert.equal(parse('Kedinin kumunu değiştir, bana bu hafta hatırlat', { now, tz: 'Europe/Istanbul', items: busy }).date, '2026-11-22');
  // O günün planlarına 45 dakikadan yakın saat seçilmez
  const day = [{ id: 'm', title: 'Toplantı', date: '2026-11-19', time: '11:00', endTime: '19:00', repeat: 'none', weekdays: [], interval: 1, status: 'pending' }];
  for (let i = 0; i < 20; i++) {
    const s = pickSlot({ from: '2026-11-19', to: '2026-11-19', start: 600, end: 1230 }, { items: day, now, tz: 'Europe/Istanbul', seed: 'x' + i });
    assert.ok(s.time < '10:15' || s.time > '19:45', s.time);
  }
  // Bugün vakit kalmadıysa ertesi gün
  const late = Date.parse('2026-11-18T20:30:00Z'); // 23:30
  assert.equal(parse('bugün ilacı al hatırlat', { now: late, tz: 'Europe/Istanbul' }).date, '2026-11-19');
});

test('sürpriz zaman: ay, gün, gün dilimi ve saat aralığı', () => {
  const month = p('Bana önümüzdeki ay hatırlat: kombi bakımı');
  assert.equal(month.title, 'Kombi bakımı');
  assert.ok(month.date >= '2026-12-01' && month.date <= '2026-12-31', month.date);
  const wed = p('Kedinin kumunu değiştir, haftaya çarşamba hatırlat');
  assert.equal(wed.date, '2026-11-25');
  assert.equal(wed.surprise.day, false);
  const eve = p('Bu hafta akşam 7 ile 9 arası kumu değiştir hatırlat');
  assert.equal(eve.title, 'Kumu değiştir');
  assert.ok(eve.time >= '19:00' && eve.time <= '21:00' && !eve.endTime, eve.time);
  const evening = p('Bu hafta akşam saatlerinde kumu değiştir hatırlat');
  assert.equal(evening.title, 'Kumu değiştir');
  assert.ok(evening.time >= '18:30' && evening.time <= '21:30', evening.time);
  const fixed = p("Bu hafta 15'te faturayı yatır hatırlat");
  assert.equal(fixed.time, '15:00');
  assert.ok(fixed.date > '2026-11-18' && fixed.date <= '2026-11-22');
  assert.equal(p('Bir ara annemi aramayı hatırlat').title, 'Annemi ara');
  assert.ok(p('Gelecek ayın başında sigortayı yenile hatırlat').date <= '2026-12-07');
  // Saati ya da önceden hatırlatması söylenmiş plan sürpriz değildir
  assert.equal(p("Yarın 9'da spor hatırlat").surprise, undefined);
  assert.equal(p('15 aralık doğum günü 1 gün önce hatırlat').surprise, undefined);
  assert.equal(p('Yarın ekmek al').surprise, undefined);
  // "bu hafta sonu" tek seferliktir; çıplak "hafta sonu" her hafta
  assert.deepEqual(pick(p('Bu hafta sonu pikniğe gidiyoruz')), { title: 'Pikniğe gidiyoruz', date: '2026-11-21', time: '', endTime: '', repeat: 'none', weekdays: [], reminders: null });
  assert.equal(p('Hafta sonu spor yap').repeat, 'weekly');
  assert.equal(p('Her hafta sonu temizlik').repeat, 'weekly');
});

test('yeni fatura türleri ve aynı türden ikinci kayıt', async () => {
  const { billTypeOf, freshBillTitle } = await import('../web/js/bills.js');
  for (const [text, type] of [['Apple iCloud', 'icloud'], ['ICLOUD', 'icloud'], ['YouTube Premium', 'youtube'], ['Spotify Premium', 'spotify'], ['NETFLIX', 'netflix'], ['Disney+', 'disney'], ['HBO Max', 'max'], ['Amazon Prime', 'prime'], ['beIN Connect', 'tod'], ['Google One', 'google'], ['Gemini', 'gemini'], ['PlayStation Plus', 'oyun'], ['kasko', 'sigorta'], ['kredi kartı', 'kart'], ['kredi taksiti', 'kredi'], ['ikinci hat', 'telefon'], ['premium', 'abonelik']]) assert.equal(billTypeOf(text), type, text);
  assert.equal(freshBillTitle('chatgpt', []), 'ChatGPT aboneliği');
  assert.equal(freshBillTitle('chatgpt', [{ title: 'ChatGPT aboneliği', bill: { type: 'chatgpt' } }]), 'ChatGPT aboneliği 2');
  assert.equal(freshBillTitle('telefon', [{ title: 'İş hattı', bill: { type: 'telefon' } }, { title: 'Telefon faturası 2', bill: { type: 'telefon' } }]), 'Telefon faturası 3');
  assert.equal(p("YouTube her ayın 5'inde çekiliyor").title, 'YouTube Premium');
  assert.equal(p("YouTube her ayın 5'inde çekiliyor").bill.type, 'youtube');
  assert.equal(p("Kasko her ayın 3'ü").title, 'Kasko');
  assert.equal(p("Netflixe her ayın 1'inde para gidiyor").title, 'Netflix aboneliği');
});
