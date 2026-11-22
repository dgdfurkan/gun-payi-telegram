// Türkçe doğal dil çözümleyici: "her cuma 12'de babaannemi ara, 10 ve 15 dk önce hatırlat"
// Kural tabanlıdır, ağ kullanmaz. Anlamadığı zamansal kelime kalırsa `doubt` doldurur.
import { dayAt, clockAt, zonedMs, dayAdd, daysBetween, weekday, mondayOf, monthDays, addMonths, pad, makeRem, sortRems, readRem, MAX_MINUTES, MINUTE, DAY_MS, TZ_DEFAULT, BILL_TYPES, billTypeOf, newBill, billSpan, firstCycle } from './core.js';

const B = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';
const UNITS = ['bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
const NUMW = `(?:(?:${TENS.join('|')})(?:\\s?(?:${UNITS.join('|')}))?|${UNITS.join('|')})`;
const NUM = `(?:\\d{1,6}|${NUMW})`;
const DAYS = { pazar: 0, pazartesi: 1, salı: 2, sali: 2, çarşamba: 3, carsamba: 3, perşembe: 4, persembe: 4, cuma: 5, cumartesi: 6 };
const DAY = '(cumartesi|pazartesi|çarşamba|carsamba|perşembe|persembe|cuma|salı|sali|pazar)';
const DAYSUF = "('?(?:ları|leri|lari|ya|ye|yı|yi|a|e|ı|i|da|de|ta|te|dan|den|nın|nin|ki))?";
const MONTHS = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
const MONTH = `(${MONTHS.join('|')}|subat|mayis|agustos|eylul|kasim|aralik)`;
const LOC = "(?:'?(?:de|da|te|ta|den|dan|ten|tan|e|a|ye|ya))?";
const SEP = '\\s*(?:,|ve|veya|ile|ya da|yada)\\s*';
const PERIOD = '(sabah|öğleden sonra|öğlen|öğle|ikindi|akşam üstü|akşamüstü|akşam|gece)';
const PERIOD_SUF = '(?:ı|i|leyin|ları|leri|dan|den|a|e|ya|ye)?';

export function wordNum(w) {
  if (/^\d+$/.test(w)) return +w;
  w = w.replace(/\s+/g, '');
  if (w === 'yarım') return 0.5;
  let n = 0;
  for (let t = TENS.length - 1; t >= 0; t--) if (w.startsWith(TENS[t])) { n = (t + 1) * 10; w = w.slice(TENS[t].length); break; }
  if (w) { const u = UNITS.indexOf(w); if (u < 0) return NaN; n += u + 1; }
  return n;
}
// iOS dikte/Kısayollar metni ayrık harflerle (u + ¨) ve farklı kesme işaretleriyle (ʼ ′ ＇) gelebilir.
export const normText = v => String(v || '').normalize('NFC').replace(/[\u2018\u2019\u201B\u02BC\u02B9\u2032\uFF07`´]/gu, "'");
const mapMonth = w => { const n = MONTHS.indexOf(w); return n >= 0 ? n : { subat: 1, mayis: 4, agustos: 7, eylul: 8, kasim: 10, aralik: 11 }[w]; };

class Text {
  constructor(raw) {
    this.raw = raw;
    this.s = raw.replace(/[’‘`´]/g, "'").toLocaleLowerCase('tr');
    if (this.s.length !== raw.length) this.s = raw.toLowerCase(); // nadir durumda konumlar kaymasın
    this.taken = new Array(raw.length).fill(null);
  }
  // Örtüşmeyen eşleşmeleri sırayla işler; fn false dönerse eşleşme alınmaz.
  each(pattern, tag, fn) {
    const re = new RegExp(B + '(?:' + pattern + ')' + E, 'gu');
    let m;
    while ((m = re.exec(this.s))) {
      const a = m.index, b = a + m[0].length;
      if (!m[0].length) { re.lastIndex++; continue; }
      if (this.taken.slice(a, b).some(Boolean)) { re.lastIndex = a + 1; continue; }
      if (fn(m, a, b) === false) { re.lastIndex = a + 1; continue; }
      this.take(a, b, tag);
    }
  }
  take(a, b, tag) { for (let i = a; i < b; i++) this.taken[i] = tag; }
  before(a) { let i = a - 1; while (i >= 0 && /\s/.test(this.s[i])) i--; return i >= 0 ? this.taken[i] : null; }
  rest() {
    let out = '';
    for (let i = 0; i < this.raw.length; i++) out += this.taken[i] ? ' ' : this.raw[i];
    return out;
  }
}

const isHour = u => /^(saat|sa)$/.test(u);
const MONTHS_IN = { ay: 1, yıl: 12, sene: 12 };
function reminderValue(numStr, half, unit) {
  if (numStr === 'çeyrek' && !unit) return 15;
  let n = numStr === 'çeyrek' ? 0.25 : wordNum(numStr);
  if (numStr === 'yarım' && !unit) return 30;
  if (half) n += 0.5;
  if (!Number.isFinite(n)) return null;
  const u = unit || 'dakika';
  if (MONTHS_IN[u]) {
    const months = n * MONTHS_IN[u];
    return Number.isInteger(months) ? makeRem(months) : makeRem(Math.floor(months), (months - Math.floor(months)) * 43200);
  }
  if (isHour(u)) return readRem(Math.round(n * 60));
  if (u === 'gün') return readRem(Math.round(n * 1440));
  if (u === 'hafta') return readRem(Math.round(n * 10080));
  if (u === 'saniye' || u === 'sn') return n >= 1 ? readRem(Math.round(n) / 60) : null;
  return readRem(Math.round(n));
}

// ---------- Fatura cümlesi ----------
const BILL_WORD = new RegExp(B + "(?:fatura\\p{L}*|kira(?![lz])\\p{L}*|aidat\\p{L}*|abone\\p{L}*|taksit\\p{L}*|ekstre\\p{L}*|ısınma\\p{L}*|doğal\\s?gaz\\p{L}*|kredi\\s+kartı\\p{L}*|netflix|spotify|icloud|chat\\s?gpt|çet\\s?gpt|claude|klod|clod|premium)" + E, 'u');
const BILL_D = `(\\d{1,2}|${NUMW}|dörd)`;
// Sıra ve hâl ekleri: 10'u, 15'ine, 8'inde, 6'sı, 2'sinde, onuna, beşinde
const BILL_SUF = "((?:'?(?:(?:s?[iıuü])(?:n(?:de|da|den|dan|e|a|i|ı|u|ü)?)?|de|da|te|ta|den|dan|ten|tan|[iıuü]?nc[iıuü]))?)";
function findBill(t) {
  if (!BILL_WORD.test(t.s) && !(/(?<![\p{L}])her\s+ay/u.test(t.s) && /(?<![\p{L}])öde/u.test(t.s))) return null;
  let days = null, auto = null;
  const after = [];
  const day = w => (w === 'dörd' ? 4 : wordNum(w));
  const valid = (...v) => v.every(n => n >= 1 && n <= 31);
  // "10'undan 15'ine kadar"
  t.each(`(?:(?:her\\s+)?ay(?:ın)?\\s+)?${BILL_D}\\s?'?(?:s?[iıuü]n)?(?:den|dan|ten|tan)\\s+(?:ayın\\s+)?${BILL_D}\\s?${BILL_SUF}\\s*kadar\\p{L}*`, 'bill', m => {
    if (days || !valid(day(m[1]), day(m[2]))) return false;
    days = [day(m[1]), day(m[2])];
  });
  // "her ayın 10'u ile 15'i arası", "10-15 arası"
  t.each(`(?:(her\\s+ay(?:ın)?|ayın)\\s+)?${BILL_D}\\s?${BILL_SUF}\\s*(-|–|ile|ila|ve|y?l[ae](?=\\s))\\s*(?:ayın\\s+)?${BILL_D}\\s?${BILL_SUF}(\\s*(?:aras\\p{L}*|aralığ\\p{L}*))?`, 'bill', (m, a, b) => {
    const [, prefix, d1, s1, sep, d2, s2, between] = m;
    if (days || !valid(day(d1), day(d2))) return false;
    if (/(saat|sabah|akşam|öğlen?|gece|[:.]\d*)\s*$/u.test(t.s.slice(0, a)) || (!between && /^\s*(?:[:.]\d|dakika|dk|saat|kere|kez|gün\s)/u.test(t.s.slice(b)))) return false;
    if (sep === 've' && !between) return false;
    const ordinal = x => /^'?s?[iıuü]/u.test(x);
    if (!prefix && !between && !(ordinal(s1) && ordinal(s2))) return false;
    days = [day(d1), day(d2)];
  });
  t.each('(?<!bu\\s)(?:her\\s+ay(?:ın)?|ayın)\\s+son(?:u|unda|\\s+günü(?:nde)?)', 'bill', () => {
    if (days) return false;
    days = [31, 31];
  });
  // "her ayın 8'inde"; "bu ayın 5'inde" tek seferliktir
  t.each(`(?<!bu\\s)(her\\s+ay(?:ın)?|ayın)\\s+${BILL_D}\\s?${BILL_SUF}`, 'bill', m => {
    if (days || !valid(day(m[2]))) return false;
    if (!m[3] && !m[1].endsWith('ın')) return false;
    days = [day(m[2]), day(m[2])];
  });
  if (!days) return null;
  t.each(`(${NUM})\\s*gün\\s+sonra(?:sında|sı|dan)?`, 'bill', m => {
    const n = wordNum(m[1]); if (!(n >= 1 && n <= 3650)) return false;
    after.push(n);
  });
  t.each('(?:kendiliğinden|otomatik(?:\\s+olarak)?|otomatik\\s+ödeme\\p{L}*)(?:\\s+(?:çekiliyor|çekiyor|çekilir|çekilecek|ödeniyor|alınıyor))?|çekiliyor|çekiyor|çekilir|çekilecek|alınıyor', 'bill', () => { auto = true; });
  t.each('ödemez\\p{L}*|ödemediy\\p{L}*|ödemedim\\p{L}*|ödenmez\\p{L}*|bitince|bittikten', 'bill', () => {});
  t.each('arası\\p{L}*|aralığ\\p{L}*|tarihleri\\p{L}*|tarihinde|günleri|ödeniyor|ödüyorum|geliyor|oluyor|var', 'bill', () => {});
  return { from: days[0], to: days[1], auto, after, type: billTypeOf(t.s) };
}

export function parse(input, opts = {}) {
  const tz = opts.tz || TZ_DEFAULT;
  const now = opts.now ?? Date.now();
  const { day: today, minutes: nowMin } = clockAt(now, tz);
  const raw = normText(input).replace(/\s+/g, ' ').trim().slice(0, 4000);
  const t = new Text(raw);
  const out = { kind: 'task', title: '', date: '', time: '', endTime: '', repeat: 'none', interval: 1, monthDay: 0, weekdays: [], reminders: null, nag: null, bill: null, timeGuess: false, doubt: [] };
  const found = { date: false, time: false, repeat: false, reminders: false, nag: false };
  let relative = false, period = null, hour = null, minute = 0, endHour = null, endMinute = 0, ownPeriod = null, monthDay = null, dateShift = 0, exact = false, endExact = false;

  // 1) Not mu? Başta "Not", "Not:", "Not al", "Not olarak ekle"; sonda "… not olarak ekle". Not metni olduğu gibi kalır.
  const head = t.s.match(NOTE_HEAD), tail = head ? null : t.s.match(NOTE_TAIL);
  if (head || tail) {
    const text = head ? raw.slice(head[0].length) : raw.slice(0, tail.index);
    const body = text.replace(/^[\s:.,;!\-–]+/u, '').replace(/[\s,;:\-–]+$/u, '');
    return { ...out, kind: 'note', title: body ? body[0].toLocaleUpperCase('tr') + body.slice(1) : '', found };
  }

  // 1a) "20'yi 10 geçe", "akşam 8'i çeyrek geçe", "9'a 10 kala": "10 kala" hatırlatma sanılmadan önce
  t.each(`(?:${PERIOD}${PERIOD_SUF}\\s*)?(?:saat\\s*)?(\\d{1,2}|${NUMW}|dörd)'?(?:(y?[ıiuü])\\s+(\\d{1,2}|${NUMW}|çeyrek)\\s*geç(?:e|iyor)|(y?[ae])\\s+(\\d{1,2}|${NUMW}|çeyrek)\\s*kala)`, 'time', m => {
    if (found.time) return false;
    const past = Boolean(m[3]), word = past ? m[4] : m[6];
    let h = m[2] === 'dörd' ? 4 : wordNum(m[2]);
    const mi = word === 'çeyrek' ? 15 : wordNum(word);
    if (!(h >= 0 && h <= 24 && mi >= 1 && mi <= 59)) return false;
    if (!past) h = h === 1 ? 12 : (h + 23) % 24; // "1'e 10 kala" = 12:50
    hour = h === 24 ? 0 : h; minute = past ? mi : 60 - mi; ownPeriod = m[1] || null; found.time = true;
  });

  // 1b) Tamamlanmazsa tekrar hatırlat: "10 dakika içinde 5 kere", "yarım saat arayla 2 kez", "tekrar hatırlat"
  for (const [pattern, pick] of NAG_PATTERNS) t.each(pattern, 'nag', m => { const v = pick(m); if (!v) return false; out.nag = v; found.nag = true; });
  // "tamamlamazsam", "yapmazsam", "unutursam" tekrar isteğinin parçasıdır, başlığa girmez
  if (found.nag) t.each('(?:tamamla|tamamlan|yap|yapıl|bitir|hallet)m[ae]zs[ae]\\p{L}*|unutursa\\p{L}*', 'nag', () => {});

  // 2) Hatırlatmalar: "10 ve 15 dakika önce", "yarım saat önce", "bir ay ve bir hafta önceden", "1 yıl önce"
  const UNIT = '(saniye|sn|dakika|dakka|dk|dak|saat|sa|gün|hafta|ay|yıl|sene)';
  const COUNT = `(?:${NUM}|yarım|çeyrek)(?:\\s*buçuk)?`;
  const ITEM = `${COUNT}(?:\\s*${UNIT})?`;
  t.each(`((?:${ITEM})(?:${SEP}(?:${ITEM}))*)\\s*${UNIT}?\\s*(?:önce(?:si|sinde|sinden|den|ye|yi|sini|siyle)?|öncesinden|önden|kala|evvel\\p{L}*)`, 'rem', m => {
    const tail = m[m.length - 1];
    const chunks = m[1].split(new RegExp(SEP, 'u')).map(x => x.trim()).filter(Boolean);
    const lastUnit = tail || (chunks.at(-1).match(new RegExp(UNIT + '$', 'u')) || [])[1];
    const list = [];
    for (const c of chunks) {
      const mm = c.match(new RegExp(`^(${NUM}|yarım|çeyrek)(\\s*buçuk)?\\s*${UNIT}?$`, 'u'));
      if (!mm) return false;
      const v = reminderValue(mm[1].trim(), mm[2], mm[3] || lastUnit);
      if (v === null) return false;
      list.push(v);
    }
    out.reminders = [...new Set([...(out.reminders || []), ...list])];
    found.reminders = true;
  });
  t.each('(?:tam\\s+)?(?:vaktinde|zamanında|saatinde|başlarken)', 'rem', () => { out.reminders = [...new Set([...(out.reminders || []), 0])]; found.reminders = true; });
  t.each('hatırlatma(?:\\s+(?:yok|olmasın|istemiyorum)|sız)', 'rem', () => { out.reminders = []; found.reminders = true; });

  // 2b) Dönemsel fatura: gün aralığı saat aralığı sanılmadan önce okunur
  const bill = findBill(t);

  // 3) Tekrarlar
  const setWeekly = days => { out.repeat = 'weekly'; out.weekdays = [...new Set([...out.weekdays, ...days])]; found.repeat = true; };
  // "3 günde bir", "iki haftada bir", "6 ayda bir", "yılda bir"
  t.each(`(?:her\\s+)?(?:(${NUM})\\s*)?(gün|hafta|ay|yıl|sene)(?:de|da)\\s+bir`, 'rep', m => {
    const n = m[1] ? wordNum(m[1]) : 1;
    if (!(n >= 1 && n <= 999) || found.repeat) return false;
    out.repeat = { gün: 'daily', hafta: 'weekly', ay: 'monthly', yıl: 'yearly', sene: 'yearly' }[m[2]];
    out.interval = n;
    found.repeat = true;
  });
  t.each('her\\s+(?:yıl|sene)', 'rep', () => { out.repeat = 'yearly'; found.repeat = true; });
  t.each(`(?:her\\s+)?hafta\\s*(?:içi|içleri)(?:\\s+her\\s+gün)?`, 'rep', () => setWeekly([1, 2, 3, 4, 5]));
  t.each(`(?:her\\s+)?hafta\\s*(?:sonu|sonları)(?:\\s+her\\s+gün)?`, 'rep', () => setWeekly([6, 0]));
  t.each(`(?:her\\s+(?:hafta\\s+)?)?${DAY}${DAYSUF}(?:${SEP}${DAY}${DAYSUF})*(?:\\s+(?:günleri|günü|günler))?`, 'rep', (m, a) => {
    const text = m[0];
    const plural = /(ları|leri|lari)(?![\p{L}])/u.test(text) || /günleri/.test(text);
    if (!/^her\s/.test(text) && !plural) return false;
    const names = [...text.matchAll(new RegExp(DAY, 'gu'))].map(x => DAYS[x[1]]);
    setWeekly(names);
  });
  t.each(`(?:her\\s+gün|hergün|günlük|her\\s+${PERIOD}|${PERIOD}(?:ları|leri))`, 'rep', m => {
    if (out.repeat !== 'weekly') out.repeat = 'daily';
    found.repeat = true;
    const p = m[0].match(new RegExp(PERIOD, 'u'));
    if (p) period = p[1];
  });
  t.each(`her\\s+ay(?:ın)?(?:\\s+(\\d{1,2}|${NUMW})\\s*'?(?:i|ı|u|ü|si|sı|sü|su|nci|ncı|inci|ıncı|uncu|üncü)?(?:nde|nda|inde|ında|unda|ünde|sinde|sında|sünde|sunda)?)?`, 'rep', m => {
    if (out.repeat === 'yearly') return false;
    out.repeat = 'monthly'; found.repeat = true;
    if (m[1]) { const n = wordNum(m[1]); if (n >= 1 && n <= 31) monthDay = n; else return false; }
  });
  t.each('her\\s+hafta', 'rep', () => { if (out.repeat === 'none') { out.repeat = 'weekly'; found.repeat = true; } });

  // 4) Tarihler
  const setDate = d => { out.date = d; found.date = true; };
  const nextDay = (dow, strict = false) => {
    let diff = (dow - weekday(today) + 7) % 7;
    if (strict && diff === 0) diff = 7;
    return dayAdd(today, diff);
  };
  t.each('(\\d{1,2})[./](\\d{1,2})[./](\\d{2,4})', 'date', m => {
    let y = +m[3]; if (y < 100) y += 2000;
    const mo = +m[2], d = +m[1];
    if (mo < 1 || mo > 12 || d < 1 || d > monthDays(y, mo - 1)) return false;
    setDate(`${y}-${pad(mo)}-${pad(d)}`);
  });
  t.each(`(\\d{1,2}|${NUMW})\\s+${MONTH}(?:'?(?:ta|da|te|de|ın|in|un|ün|nda|nde|ında|inde|unda|ünde|a|e|ya|ye))?(?:\\s+(\\d{4}))?`, 'date', m => {
    const d = wordNum(m[1]), mo = mapMonth(m[2]);
    let y = m[3] ? +m[3] : +today.slice(0, 4);
    if (!(d >= 1 && d <= monthDays(y, mo))) return false;
    let date = `${y}-${pad(mo + 1)}-${pad(d)}`;
    if (!m[3] && date < today) date = `${y + 1}-${pad(mo + 1)}-${pad(Math.min(d, monthDays(y + 1, mo)))}`;
    setDate(date);
  });
  t.each(`(?:bu\\s+)?ayın\\s+(\\d{1,2}|${NUMW})\\s*'?(?:i|ı|u|ü|si|sı|sü|su)?(?:nde|nda|inde|ında|unda|ünde|sinde|sında|sünde|sunda)?`, 'date', m => {
    const n = wordNum(m[1]); if (!(n >= 1 && n <= 31)) return false;
    if (out.repeat === 'monthly') { monthDay = n; return; }
    let y = +today.slice(0, 4), mo = +today.slice(5, 7) - 1;
    let date = `${y}-${pad(mo + 1)}-${pad(Math.min(n, monthDays(y, mo)))}`;
    if (date < today) { mo++; if (mo > 11) { mo = 0; y++; } date = `${y}-${pad(mo + 1)}-${pad(Math.min(n, monthDays(y, mo)))}`; }
    setDate(date);
  });
  t.each(`bu\\s*${PERIOD}${PERIOD_SUF}`, 'date', m => { setDate(today); period = m[1]; });
  t.each("bugün(?:'?(?:de|den|e|ü))?|bu\\s+gün", 'date', () => setDate(today));
  t.each("yarından\\s+sonra|öbür\\s*gün|ertesi\\s+gün", 'date', () => setDate(dayAdd(today, 2)));
  t.each("yarın(?:'?(?:a|da|dan|ki))?", 'date', () => setDate(dayAdd(today, 1)));
  t.each(`(${NUM})\\s*(gün|hafta|ay)\\s*sonra(?:ya|sı)?`, 'date', m => {
    const n = wordNum(m[1]); if (!Number.isFinite(n) || n < 1 || n > 3650) return false;
    if (m[2] === 'gün') setDate(dayAdd(today, n));
    else if (m[2] === 'hafta') setDate(dayAdd(today, 7 * n));
    else {
      let y = +today.slice(0, 4), mo = +today.slice(5, 7) - 1 + n;
      y += Math.floor(mo / 12); mo %= 12;
      setDate(`${y}-${pad(mo + 1)}-${pad(Math.min(+today.slice(8, 10), monthDays(y, mo)))}`);
    }
  });
  t.each(`(?:(haftaya|gelecek\\s+hafta(?:nın)?|önümüzdeki\\s+hafta(?:nın)?)|(gelecek|önümüzdeki|bu|bu\\s+hafta(?:nın)?|bu\\s+haftaki))\\s+${DAY}${DAYSUF}(?:\\s+günü)?`, 'date', m => {
    const dow = DAYS[m[3]];
    if (m[1]) setDate(dayAdd(mondayOf(today), 7 + ((dow + 6) % 7)));
    else setDate(nextDay(dow, /gelecek|önümüzdeki/.test(m[2])));
  });
  t.each(`${DAY}${DAYSUF}(?:\\s+günü)?`, 'date', m => {
    if (out.repeat === 'weekly' && !out.weekdays.length) { out.weekdays = [DAYS[m[1]]]; return; }
    if (out.repeat !== 'none' || found.date) return false; // "hafta sonu pazar alışverişi": başlığın parçası
    setDate(nextDay(DAYS[m[1]]));
    out._weekdayDate = true;
  });
  t.each('haftaya|gelecek\\s+hafta|önümüzdeki\\s+hafta', 'date', () => setDate(dayAdd(today, 7)));

  // 5) Saatler
  const H = `(\\d{1,2}|${NUMW})`;
  // exact: "01:00" gibi iki haneli 24 saat yazımı; öğleden sonra tahmini yapılmaz.
  const setTime = (h, mi, p, ex = false) => {
    if (!(h >= 0 && h <= 24) || !(mi >= 0 && mi <= 59)) return false;
    hour = h === 24 ? 0 : h; minute = mi; ownPeriod = p || null; exact = ex; found.time = true;
  };
  // Göreli: "20 dakika sonra", "bir buçuk saat sonra", "1 saat 15 dakika sonra", "1 gün 5 saat sonra"
  t.each(`(?:(${NUM})\\s*gün\\s+(?:ve\\s+)?)?(\\d{1,6}(?:[.,]\\d)?|yarım|çeyrek|${NUMW})(\\s*buçuk)?\\s*(dakika|dakka|dk|saat|sa)(?:\\s+(?:ve\\s+)?(\\d{1,2}|${NUMW})\\s*(?:dakika|dakka|dk))?\\s+sonra(?:ya|sı|sına)?`, 'time', m => {
    if (found.time || found.date || found.repeat) return false;
    let n = m[2] === 'yarım' ? 0.5 : m[2] === 'çeyrek' ? 0.25 : /\d/.test(m[2]) ? parseFloat(m[2].replace(',', '.')) : wordNum(m[2]);
    if (!Number.isFinite(n)) return false;
    if (m[3]) n += 0.5;
    let mins = isHour(m[4]) ? n * 60 : n;
    if (m[1]) mins += wordNum(m[1]) * 1440;
    if (m[5]) mins += wordNum(m[5]);
    mins = Math.round(mins);
    if (!(mins >= 1 && mins <= MAX_MINUTES)) return false;
    const at = clockAt(now + mins * MINUTE, tz);
    setDate(at.day);
    setTime(Math.floor(at.minutes / 60), at.minutes % 60, null, true);
    relative = true;
  });
  // Aralık: "14:00-15:30", "2'den 4'e kadar", "14 ile 16 arası"
  t.each(`(?:${PERIOD}${PERIOD_SUF}\\s*)?(?:saat\\s*)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:-|–|'?(?:den|dan|ten|tan)|\\s+ile)\\s*(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:'?(?:e|a|ye|ya)\\s*kadar|arası(?:nda)?|'?(?:e|a|ye|ya)(?=\\s|$))?`, 'time', m => {
    const h1 = +m[2], h2 = +m[4];
    if (h1 > 23 || h2 > 23) return false;
    if (!m[3] && !m[5] && !/kadar|arası|den|dan|ten|tan/.test(m[0])) return false;
    if (setTime(h1, +(m[3] || 0), m[1], m[2].length === 2 && Boolean(m[3])) === false) return false;
    endHour = h2; endMinute = +(m[5] || 0); endExact = m[4].length === 2 && Boolean(m[5]);
  });
  t.each(`(?:${PERIOD}${PERIOD_SUF}\\s*)?(?:saat\\s*)?(\\d{1,2})[:.](\\d{2})${LOC}`, 'time', m => setTime(+m[2], +m[3], m[1], m[2].length === 2));
  t.each(`${PERIOD}${PERIOD_SUF}\\s*(?:saat\\s*)?${H}(\\s*buçuk)?(?:'?(?:de|da|te|ta|e|a|ye|ya))?`, 'time', m => {
    const h = wordNum(m[2]); if (!(h >= 1 && h <= 12)) return false;
    return setTime(h, m[3] ? 30 : 0, m[1]);
  });
  t.each(`saat\\s*${H}(\\s*buçuk)?${LOC}`, 'time', m => {
    const h = wordNum(m[1]); if (!(h >= 0 && h <= 24)) return false;
    return setTime(h, m[2] ? 30 : 0);
  });
  t.each(`(\\d{1,2})(?:(\\s*buçuk)(?:ta)?|'(?:de|da|te|ta)|(?:de|da|te|ta))`, 'time', m => {
    const h = +m[1]; if (h > 24) return false;
    return setTime(h, m[2] ? 30 : 0);
  });
  t.each(`(on\\s?bir|on\\s?iki|${UNITS.slice(1).join('|')})(\\s*buçuk)?(?:de|da|te|ta)`, 'time', m => {
    const h = wordNum(m[1]); if (!(h >= 1 && h <= 12)) return false;
    return setTime(h, m[2] ? 30 : 0);
  });

  // 6) Yalnız gün dilimi: "yarın akşam", "cuma akşamı", "her sabah"
  t.each(`${PERIOD}${PERIOD_SUF}`, 'period', (m, a) => {
    const prev = t.before(a);
    if (!prev || !['date', 'rep', 'time'].includes(prev)) return false;
    period = period || m[1];
  });

  // 7) Saatleri gün dilimine göre ayarla
  if (hour !== null) {
    const p = ownPeriod || period;
    const adj = (h, p, ex) => {
      if (ex || h > 12) return h;
      if (!p) {
        if (h >= 1 && h <= 6 && !/(kalk|uyan|sahur|namaz|sabah)/.test(t.s)) return h + 12;
        return h;
      }
      if (p === 'sabah') return h === 12 ? 0 : h;
      if (p === 'öğle' || p === 'öğlen') return h < 6 ? h + 12 : h;
      if (p === 'gece') { if (h === 12) { dateShift = 1; return 0; } return h >= 6 ? h + 12 : h; }
      return h < 12 ? h + 12 : h; // öğleden sonra, ikindi, akşam
    };
    const h = adj(hour, p, exact);
    out.time = `${pad(h % 24)}:${pad(minute)}`;
    if (endHour !== null) {
      let e = adj(endHour, p, endExact);
      if (!endExact && e < h && !p && e + 12 > h && e + 12 < 24) e += 12;
      out.endTime = `${pad(e % 24)}:${pad(endMinute)}`;
    }
  } else if (period && (found.date || found.repeat || bill)) {
    out.time = { sabah: '09:00', öğle: '12:00', öğlen: '12:00', 'öğleden sonra': '15:00', ikindi: '16:00', akşamüstü: '17:00', 'akşam üstü': '17:00', akşam: '19:00', gece: '22:00' }[period] || '';
    out.timeGuess = Boolean(out.time);
  }

  // 8) Tarihi tamamla
  if (out.repeat === 'weekly') {
    if (!out.weekdays.length) out.weekdays = [weekday(out.date || today)];
    if (!found.date || out._weekdayDate) {
      let d = today;
      for (let i = 0; i < 7; i++) { const c = dayAdd(today, i); if (out.weekdays.includes(weekday(c))) { d = c; break; } }
      out.date = d;
    }
  } else if (out.repeat === 'monthly') {
    if (monthDay) {
      let y = +today.slice(0, 4), mo = +today.slice(5, 7) - 1;
      let d = `${y}-${pad(mo + 1)}-${pad(Math.min(monthDay, monthDays(y, mo)))}`;
      if (d < today) { mo++; if (mo > 11) { mo = 0; y++; } d = `${y}-${pad(mo + 1)}-${pad(Math.min(monthDay, monthDays(y, mo)))}`; }
      out.date = d;
      out.monthDay = monthDay;
    } else if (!out.date) out.date = today;
  } else if (out.repeat === 'daily' || out.repeat === 'yearly') {
    if (!out.date) out.date = today;
  } else if (out.time && !out.date) {
    // Saat verildi, gün yok: geçtiyse yarın.
    out.date = toMinutes(out.time) > nowMin - 1 ? today : dayAdd(today, 1);
  } else if (out._weekdayDate && out.time && out.date === today && toMinutes(out.time) < nowMin) {
    out.date = dayAdd(today, 7);
  }
  if (dateShift && found.date) out.date = dayAdd(out.date, dateShift);
  delete out._weekdayDate;

  // 9) Başlık
  out.title = cleanTitle(t.rest());
  // "arkadaşımın nişanı var" → "Arkadaşımın nişanı"
  if (found.date || found.time || found.repeat) out.title = out.title.replace(/(\S)\s+(?:var|olacak)$/iu, '$1');
  out.doubt = doubts(out.title, found);
  out.found = found;
  if (bill) applyBill(out, bill, today);
  if (relative && out.reminders == null) out.reminders = [0]; // "20 dakika sonra": tam o anda haber ver
  if (out.kind !== 'note') out.kind = out.time ? 'event' : 'task';
  return out;
}

const toMinutes = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
function applyBill(out, found, today) {
  const type = BILL_TYPES[found.type], auto = found.auto ?? Boolean(type.auto);
  const b = newBill(found.type, found.from, found.to, auto);
  if (out.reminders) {
    b.before = [...new Set(out.reminders.map(v => (typeof v === 'number' ? Math.floor(v / 1440) : parseInt(v.slice(1), 10) * 30)).filter(n => n >= 1))].sort((x, y) => x - y);
  }
  if (found.after.length) b.after = [...new Set(found.after)].sort((x, y) => x - y);
  // Başlık yalnız türün adından ibaretse ("Claude", "Elektrik") tam adını yaz
  if (!out.title || (found.type !== 'diger' && !/\s/.test(out.title))) out.title = type.title;
  const interval = out.repeat === 'monthly' ? out.interval : out.repeat === 'yearly' ? out.interval * 12 : 1;
  Object.assign(out, { bill: b, repeat: 'monthly', interval, monthDay: 0, weekdays: [], reminders: null, nag: null, endTime: '', date: billSpan(b, firstCycle(b, today)).start, doubt: [] });
  Object.assign(out.found, { repeat: true, date: true });
}
// Sesle "Not balık yemi bitti" (iki nokta söylemeden). "Not defteri al" plandır.
const NOTE_HEAD = /^(?:not(?:\s+(?:al|et|olarak|ekle|yaz|düş|kaydet)(?:\s+(?:ekle|kaydet|al))?)?|aklımdaki|aklıma\s+gelen)(?![\p{L}\p{N}])(?!\s*(?:defter|kağıd|kağıt|kâğıt|kâğıd))/u;
const NOTE_TAIL = /[\s,.;:]+not\s+(?:olarak\s+)?(?:ekle|kaydet|al|yaz|düş)[.!]?$/u;

// --- Tekrar hatırlatma (tamamlanana kadar) ---
const NAGU = '(dakika|dakka|dk|dak|saat|sa)';
// "2 günde bir" tek başına takvim tekrarıdır; yanında "3 kere" varsa tekrar hatırlatmadır
const NAGU_N = '(dakika|dakka|dk|dak|saat|sa|gün)';
const NAGSEP = "(?:'?(?:da|de|ta|te)\\s+bir|\\s*içinde|\\s*arayla|\\s*aralıkla|\\s*ara\\s+ile)";
const NAGC = `(${NUM})\\s*(?:kere|kez|defa|sefer)`;
const NAGHAT = '(?:(?:tekrar|yine|tekrardan)\\s+)?hatırlat\\p{L}*';
function nagValue(n, unit, count) {
  const k = n === 'yarım' ? 0.5 : wordNum(n);
  const every = Math.round(unit === 'gün' ? k * 1440 : isHour(unit) ? k * 60 : (n === 'yarım' ? 30 : k));
  const times = count == null ? 3 : wordNum(count);
  if (!(every >= 1 && every <= 525600) || !(times >= 1 && times <= 1000)) return null;
  return { every, times };
}
export const NAG_PATTERNS = [
  // "tekrar hatırlat 10 dakika içinde 5 kere", "her 15 dakikada bir 3 kez"
  [`(?:${NAGHAT}\\s*[:,]?\\s*)?(?:her\\s+)?(${NUM}|yarım)\\s*${NAGU_N}${NAGSEP}\\s*,?\\s*${NAGC}(?:\\s+${NAGHAT})?`, m => nagValue(m[1].trim(), m[2], m[3])],
  // "5 kere 10 dakikada bir hatırlat"
  [`${NAGC}\\s*(?:${NAGHAT}\\s*)?,?\\s*(?:her\\s+)?(${NUM}|yarım)\\s*${NAGU_N}${NAGSEP}(?:\\s+${NAGHAT})?`, m => nagValue(m[2].trim(), m[3], m[1])],
  // "her 10 dakikada bir tekrar hatırlat" (sayı yoksa 3 kez)
  [`(?:her\\s+)?(${NUM}|yarım)\\s*${NAGU}${NAGSEP}\\s+${NAGHAT}`, m => nagValue(m[1].trim(), m[2], null)],
  // "5 kere tekrar hatırlat", "tekrar hatırlat" (aralık yoksa 10 dk)
  [`${NAGC}\\s+(?:(?:tekrar|yine|tekrardan)\\s+)?hatırlat\\p{L}*|(?:tekrar|yine|tekrardan)\\s+hatırlat\\p{L}*(?:\\s+${NAGC})?`, m => nagValue('10', 'dk', m[1] ?? m[2] ?? null)],
];
// Yalnız tekrar ifadesi yazıldığında (Telegram taslağı): {every, times} | null
export function parseNag(input) {
  const s = normText(input).trim().toLocaleLowerCase('tr');
  if (/^(tekrar\s+)?(yok|kapat|kapalı|istemiyorum|hayır)$/u.test(s)) return false;
  for (const [pattern, pick] of NAG_PATTERNS) {
    const m = s.match(new RegExp(B + '(?:' + pattern + ')' + E, 'u'));
    if (m) { const v = pick(m); if (v) return v; }
  }
  // Tek başına: "her 15 dakikada bir" (3 kez), "5 kere" (10 dk arayla)
  let m = s.match(new RegExp(`^(?:her\\s+)?(${NUM}|yarım)\\s*${NAGU_N}${NAGSEP}$`, 'u'));
  if (m) return nagValue(m[1].trim(), m[2], null);
  m = s.match(new RegExp(`^${NAGC}$`, 'u'));
  if (m) return nagValue('10', 'dk', m[1]);
  return null;
}
export function nagLabel(n) {
  if (!n) return '';
  const e = n.every % 1440 === 0 ? `${n.every / 1440} günde` : n.every % 60 === 0 ? `${n.every / 60} saatte` : `${n.every} dk'da`;
  return `${e} bir · ${n.times} kez`;
}

const FILLER = new Set(['ve', 'tekrar', 'yine', 'seç', 'seçsin', 'seçer', 'ekle', 'ekler', 'eklesene', 'kaydet', 'hatırlat', 'hatırlatsın', 'hatırlatma', 'hatırlatır', 'hatırlatıcı', 'olarak', 'bana', 'lütfen', 'de', 'da', 'kur', 'ayarla', 'oluştur', 'saat', 'her', 'için', 'ayrıca', 'misin', 'mısın', 'musun', 'müsün', 'tamam', 'bildir', 'bildirim', 'gönder', 'alarm', 'takvime', 'takvimime', 'plana', 'planıma', 'ajandaya', 'listeye', 'listeme', 'bir', 'şekilde', 'şeklinde', 'beni', 'bunu', 'not', 'al', 've', 'diye', 'yap', 'gerekli', 'olan', 'şeyi', 'şeyini']);
const KEEP_EDGE = new Set(['al', 'yap', 'not', 'bir']); // başlık içinde anlamlı olabilir; yalnız tek başına kalırsa silinir

export function cleanTitle(text) {
  let s = ' ' + text.replace(/\s+/g, ' ') + ' ';
  // Fiil kalıpları: "aramam için gerekli olan şeyi" → "ara", "aramayı unutma" → "ara"
  s = s.replace(/\s+(?:için\s+)?(?:gerekli|gereken)\s+(?:olan\s+)?(?:şeyi|şeyleri|şey|hatırlatmayı|hatırlatıcıyı)/giu, ' için');
  s = s.replace(/(\p{L}{2,}?)(?:mam|mem|mamız|memiz|mamı|memi)\s+(?:için|lazım|gerek\p{L}*)(?![\p{L}])/giu, '$1');
  s = s.replace(/(\p{L}{2,}?)(?:mayı|meyi)\s+unutma\p{L}*/giu, '$1');
  s = s.replace(/(^|\s)(?:yiyeceğim|diyeceğim|gideceğim|edeceğim)(?![\p{L}])/giu, (m, a) => a + { yiyeceğim: 'ye', diyeceğim: 'de', gideceğim: 'git', edeceğim: 'et' }[m.trim().toLocaleLowerCase('tr')]);
  s = s.replace(/(\p{L}{2,}?)y?(?:acağım|eceğim|malıyım|meliyim)(?![\p{L}])/giu, '$1');
  s = s.replace(/(\p{L}{2,}?)(?:mak|mek)\s+(?:lazım|gerek\p{L}*|istiyorum)(?![\p{L}])/giu, '$1');
  s = s.replace(/\s+(?:ekler|ekleyebilir|ekleyiver|hatırlatır|hatırlatabilir|kurar|ayarlar)\s+m[iıuü]s[iıuü]n\s*\??/giu, ' ');
  s = s.replace(/\s+(?:bir\s+)?(?:hatırlatma|hatırlatıcı|alarm)\s+(?:kur|ekle|ayarla|oluştur)\p{L}*/giu, ' ');
  const clauses = s.split(/[,;.!?]+/u).map(c => {
    const words = c.trim().split(/\s+/).filter(Boolean);
    const isFill = w => FILLER.has(w.toLocaleLowerCase('tr').replace(/[^\p{L}]/gu, ''));
    while (words.length && isFill(words[0]) && !(words.length > 1 && KEEP_EDGE.has(words[0].toLocaleLowerCase('tr')) && !isFill(words[1]))) words.shift();
    while (words.length && isFill(words.at(-1)) && !(words.length > 1 && KEEP_EDGE.has(words.at(-1).toLocaleLowerCase('tr')) && !isFill(words.at(-2)))) words.pop();
    if (words.length === 1 && KEEP_EDGE.has(words[0].toLocaleLowerCase('tr'))) return '';
    return words.join(' ');
  }).filter(Boolean);
  let title = clauses.join(', ').replace(/\s+'/g, "'").replace(/^'+|'+$/g, '').replace(/^[^\p{L}\p{N}]+|[\s:–-]+$/gu, '').trim();
  if (title) title = title[0].toLocaleUpperCase('tr') + title.slice(1);
  return title;
}

const STEMS = `saat|dakika|sabah|akşam|gece|hafta|buçuk|çeyrek|yarın|bugün|sonra|önce|kala|pazartesi|salı|çarşamba|perşembe|cumartesi|cuma|${MONTHS.join('|')}`;
const TEMPORAL = new RegExp(B + `((?:${STEMS})\\p{L}*|her|ay|ayda|ayın|gün|günde|günlük|kadar|itibaren|pazar(?:ı|a|da|dan)?)` + E, 'iu');
function doubts(title, found) {
  const s = title.toLocaleLowerCase('tr');
  const out = [];
  const m = s.match(TEMPORAL);
  if (m) out.push(m[1]);
  if (/\d{1,2}[:.']\d{0,2}/.test(s) && !found.time) out.push('saat?');
  return out;
}

// Çözümlenen sonucu kaydedilebilir plana çevirir.
export function toItem(p, extra = {}) {
  const now = new Date().toISOString();
  return {
    id: extra.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    title: p.title, kind: p.time ? 'event' : 'task', date: p.date || '', time: p.time || '', endTime: p.endTime || '',
    repeat: p.repeat, interval: p.interval || 1, monthDay: p.monthDay || 0, weekdays: p.repeat === 'weekly' ? p.weekdays : [], until: '',
    reminders: p.reminders, nag: p.nag || null, bill: p.bill || null, snooze: null, status: 'pending', exceptions: {}, note: '', createdAt: now, updatedAt: now, ...extra,
  };
}
export const parseDay = (now, tz) => dayAt(now, tz);

// ---------- Süreler ----------
const LONG_UNIT = 'saniye|dakika|dakka|saat|hafta|gün|yıl|sene|dak|dk|sn|sa|hf|ay';
const DUR_UNIT = { saniye: 1 / 60, sn: 1 / 60, dakika: 1, dakka: 1, dak: 1, dk: 1, d: 1, saat: 60, sa: 60, s: 60, gün: 1440, g: 1440, hafta: 10080, hf: 10080 };
// Uzun birim hâl eki alabilir ("20 dakikaya", "2 saatliğine"); tek harf alamaz ("9 da" süre değildir).
const DUR_TOKEN = `(\\d+(?:[.,]\\d+)?|yarım|çeyrek|${NUMW})(\\s*buçuk)?(?:\\s*(${LONG_UNIT})(?:'?(?:ya|ye|a|e|l[ıi][ğk]\\p{L}*))?|\\s*([gsd]))?(?![\\p{L}\\p{N}])`;
// "1 gün 5 saat" → parçalar; başka bir kelime kalırsa null
function durationParts(text) {
  const re = new RegExp(DUR_TOKEN, 'gu'), parts = [];
  const rest = text.replace(re, (all, n, half, long, short) => {
    let v = n === 'yarım' ? 0.5 : n === 'çeyrek' ? 0.25 : /\d/.test(n) ? parseFloat(n.replace(',', '.')) : wordNum(n);
    if (half) v += 0.5;
    parts.push({ n: v, word: n, u: long || short || '' });
    return ' ';
  });
  return !parts.length || rest.replace(/[\s.]/g, '') || parts.some(p => !Number.isFinite(p.n)) ? null : parts;
}
function sumParts(parts, unit) {
  let months = 0, minutes = 0;
  for (const [i, p] of parts.entries()) {
    const u = p.u || (i ? 'dk' : unit);
    if (MONTHS_IN[u]) {
      const m = p.n * MONTHS_IN[u];
      months += Math.floor(m);
      minutes += (m - Math.floor(m)) * 43200;
    } else if (!p.u && u === 'dk' && (p.word === 'yarım' || p.word === 'çeyrek')) minutes += p.word === 'yarım' ? 30 : 15;
    else minutes += p.n * DUR_UNIT[u];
  }
  return months > 120 || minutes > MAX_MINUTES ? null : { months, minutes: Math.round(minutes * 60) / 60 };
}

// Hatırlatma listesi: "30 dk", "1 sa 15 dk" (75), "10 ve 15 dk", "1 ay ve 1 hafta", "28 gün",
// "15 sn", "vaktinde ve 10 dk". Anlaşılmazsa null, "yok" için [].
export function parseDurations(input) {
  let s = normText(input).toLocaleLowerCase('tr').replace(/'/g, ' ').replace(/(önce\p{L}*|kala|hatırlat\p{L}*|kadar)/gu, ' ').trim();
  if (!s) return null;
  if (/^(yok|hiç|kapat|hatırlatma yok|istemiyorum)$/u.test(s)) return [];
  const out = new Set();
  const ZERO = /(tam\s+)?(vaktinde|zamanında|saatinde|anında|aynı gün)/gu;
  if (s.match(ZERO)) { out.add(0); s = s.replace(ZERO, ' '); }
  s = s.replace(/(\d),(\d)(?!\d)/g, '$1.$2'); // "1,5 saat" ondalık, "10,15 dk" liste
  const groups = s.split(/\s*(?:,|;|\+|(?<![\p{L}])(?:ve|veya|ile|ya da)(?![\p{L}]))\s*/u).map(g => g.trim()).filter(Boolean);
  const parsed = groups.map(durationParts);
  if (parsed.includes(null)) return out.size ? [...out] : null;
  for (let i = 0; i < parsed.length; i++) {
    const parts = parsed[i];
    const unit = parts.find(p => p.u)?.u || parsed.slice(i + 1).flat().find(p => p.u)?.u || 'dk'; // "10 ve 15 dk"
    const span = sumParts(parts, parts[0].u || unit);
    const v = span && makeRem(span.months, span.minutes);
    if (v === null) return null;
    out.add(v);
  }
  return out.size ? sortRems(out) : null;
}

// ---------- Erteleme ----------
const SNOOZE_WORDS = /(?<![\p{L}])(?:ertele\p{L}*|ötele\p{L}*|hatırlat\p{L}*|bana|beni|bunu|lütfen)(?![\p{L}])/gu;
const snoozeText = input => normText(input).toLocaleLowerCase('tr').replace(SNOOZE_WORDS, ' ').replace(/[!?…]|[.,;](?!\d)/gu, ' ').replace(/\s+/g, ' ').trim();
// Tek bir süre: "42 dk", "1G", "1 gün ve 5 saat", "20 dakika sonra", "2 saatliğine".
// bare: erteleme beklenirken birimsiz sayı dakikadır ("15").
export function parseSpan(input, { bare = false } = {}) {
  const s = snoozeText(input).replace(/(?<![\p{L}])(?:sonra\p{L}*|tekrar|daha|ve)(?![\p{L}])/gu, ' ').trim();
  const parts = durationParts(s);
  if (!parts) return null;
  if (!parts.some(p => p.u) && (!bare || parts.length > 1)) return null;
  const span = sumParts(parts, 'dk');
  return span && (span.months || span.minutes > 0) ? span : null;
}
export function spanEnd({ months, minutes }, now, tz = TZ_DEFAULT) {
  const today = dayAt(now, tz);
  return now + (months ? daysBetween(today, addMonths(today, months)) * DAY_MS : 0) + minutes * MINUTE;
}
// Erteleme anı, hep `now`dan (basılan/yazılan an) sayılır: süre, saat ("21:30") ya da gün ("yarın", "cuma 10'da").
export function parseUntil(input, { now = Date.now(), tz = TZ_DEFAULT, bare = false } = {}) {
  const s = snoozeText(input).replace(/(\d) +'?(de|da|te|ta)$/u, "$1'$2"), today = dayAt(now, tz);
  const next = time => { const d = zonedMs(today, time, tz); return d > now ? d : zonedMs(dayAdd(today, 1), time, tz); };
  const c = s.match(/^(?:saat\s*)?([01]?\d|2[0-3])\s?[:.]\s?([0-5]\d)(?:\s?'?(?:de|da|te|ta|e|a|ye|ya))?$/u)
    || (bare && (s.match(/^([01]?\d|2[0-3]) ([0-5]\d)$/) || s.match(/^([01]\d|2[0-3])([0-5]\d)$/)));
  if (c) return next(`${pad(+c[1])}:${c[2]}`);
  const span = parseSpan(input, { bare });
  if (span) return spanEnd(span, now, tz);
  const r = parse(s, { now, tz }), f = r.found;
  if (r.kind === 'note' || r.title || r.nag || r.bill || f.repeat || f.reminders || !(f.date || f.time)) return null;
  if (!f.date) return next(r.time);
  // Saat söylenmeden "yarın": yarın, şu anki saatte
  const at = r.time ? zonedMs(r.date, r.time, tz) : now + daysBetween(today, r.date) * DAY_MS;
  return at > now ? at : null;
}

// Yalnız saat yazıldığında: "17:34", "17.34", "17 34", "1734", "17", "saat 5", "akşam 8".
export function parseClock(input, opts = {}) {
  const s = normText(input).trim().toLocaleLowerCase('tr');
  let m = s.match(/^(\d{1,2})\s*[:.,\s]\s*(\d{2})$/) || s.match(/^(\d{2})(\d{2})$/) || s.match(/^(\d)(\d{2})$/);
  if (m && +m[1] < 24 && +m[2] < 60) return `${pad(+m[1])}:${pad(+m[2])}`;
  m = s.match(/^(\d{1,2})$/);
  if (m && +m[1] < 24) return `${pad(+m[1])}:00`;
  const r = parse(s, opts);
  return r.found?.time ? r.time : '';
}
