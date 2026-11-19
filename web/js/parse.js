// Türkçe doğal dil çözümleyici: "her cuma 12'de babaannemi ara, 10 ve 15 dk önce hatırlat"
// Kural tabanlıdır, ağ kullanmaz. Anlamadığı zamansal kelime kalırsa `doubt` doldurur.
import { dayAt, clockAt, fromMin, dayAdd, weekday, mondayOf, monthDays, pad, TZ_DEFAULT } from './core.js';

const B = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';
const UNITS = ['bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
const NUMW = `(?:(?:${TENS.join('|')})(?:\\s?(?:${UNITS.join('|')}))?|${UNITS.join('|')})`;
const NUM = `(?:\\d{1,3}|${NUMW})`;
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

function reminderValue(numStr, unit) {
  let n = numStr === 'çeyrek' ? 0.25 : wordNum(numStr);
  if (!Number.isFinite(n)) return null;
  const u = unit || 'dakika';
  if (numStr === 'çeyrek') return 15;
  if (/^(saat|sa)$/.test(u)) return Math.round(n * 60);
  if (u === 'gün') return Math.round(n * 1440);
  if (u === 'saniye' || u === 'sn') return Math.round(n) / 60;
  return Math.round(n);
}

export function parse(input, opts = {}) {
  const tz = opts.tz || TZ_DEFAULT;
  const now = opts.now ?? Date.now();
  const { day: today, minutes: nowMin } = clockAt(now, tz);
  const raw = String(input || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const t = new Text(raw);
  const out = { kind: 'task', title: '', date: '', time: '', endTime: '', repeat: 'none', weekdays: [], reminders: null, nag: null, timeGuess: false, doubt: [] };
  const found = { date: false, time: false, repeat: false, reminders: false, nag: false };
  let relative = false, period = null, hour = null, minute = 0, endHour = null, endMinute = 0, ownPeriod = null, monthDay = null, dateShift = 0, exact = false, endExact = false;

  // 1) Not mu? Başta "Not", "Not:", "Not al", "Not olarak ekle"; sonda "… not olarak ekle". Not metni olduğu gibi kalır.
  const head = t.s.match(NOTE_HEAD), tail = head ? null : t.s.match(NOTE_TAIL);
  if (head || tail) {
    const text = head ? raw.slice(head[0].length) : raw.slice(0, tail.index);
    const body = text.replace(/^[\s:.,;!\-–]+/u, '').replace(/[\s,;:\-–]+$/u, '');
    return { ...out, kind: 'note', title: body ? body[0].toLocaleUpperCase('tr') + body.slice(1) : '', found };
  }

  // 1b) Tamamlanmazsa tekrar hatırlat: "10 dakika içinde 5 kere", "yarım saat arayla 2 kez", "tekrar hatırlat"
  for (const [pattern, pick] of NAG_PATTERNS) t.each(pattern, 'nag', m => { const v = pick(m); if (!v) return false; out.nag = v; found.nag = true; });
  // "tamamlamazsam", "yapmazsam", "unutursam" tekrar isteğinin parçasıdır, başlığa girmez
  if (found.nag) t.each('(?:tamamla|tamamlan|yap|yapıl|bitir|hallet)m[ae]zs[ae]\\p{L}*|unutursa\\p{L}*', 'nag', () => {});

  // 2) Hatırlatmalar: "10 ve 15 dakika önce", "yarım saat önce", "1 gün önceden"
  const UNIT = '(saniye|sn|dakika|dakka|dk|dak|saat|sa|gün)';
  const ITEM = `(?:${NUM}|yarım|çeyrek)(?:\\s*${UNIT})?`;
  t.each(`((?:${ITEM})(?:${SEP}(?:${ITEM}))*)\\s*${UNIT}?\\s*(?:önce(?:si|sinde|den|ye|yi|sini|siyle)?|öncesinden|kala|evvel)`, 'rem', m => {
    const tail = m[m.length - 1];
    const chunks = m[1].split(new RegExp(SEP, 'u')).map(x => x.trim()).filter(Boolean);
    const lastUnit = tail || (chunks.at(-1).match(new RegExp(UNIT + '$', 'u')) || [])[1];
    const list = [];
    for (const c of chunks) {
      const mm = c.match(new RegExp(`^(${NUM}|yarım|çeyrek)\\s*${UNIT}?$`, 'u'));
      if (!mm) return false;
      const v = reminderValue(mm[1].trim(), mm[2] || lastUnit);
      if (v === null || v > 40320 || (v < 1 && v * 60 < 1)) return false;
      list.push(v);
    }
    out.reminders = [...new Set([...(out.reminders || []), ...list])];
    found.reminders = true;
  });
  t.each('(?:tam\\s+)?(?:vaktinde|zamanında|saatinde|başlarken)', 'rem', () => { out.reminders = [...new Set([...(out.reminders || []), 0])]; found.reminders = true; });
  t.each('hatırlatma(?:\\s+(?:yok|olmasın|istemiyorum)|sız)', 'rem', () => { out.reminders = []; found.reminders = true; });

  // 3) Tekrarlar
  const setWeekly = days => { out.repeat = 'weekly'; out.weekdays = [...new Set([...out.weekdays, ...days])]; found.repeat = true; };
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
    out.repeat = out.repeat === 'weekly' ? 'weekly' : 'daily';
    found.repeat = true;
    const p = m[0].match(new RegExp(PERIOD, 'u'));
    if (p) period = p[1];
  });
  t.each(`her\\s+ay(?:ın)?(?:\\s+(\\d{1,2}|${NUMW})\\s*'?(?:i|ı|u|ü|si|sı|sü|su|nci|ncı|inci|ıncı|uncu|üncü)?(?:nde|nda|inde|ında|unda|ünde|sinde|sında|sünde|sunda)?)?`, 'rep', m => {
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
  t.each(`ayın\\s+(\\d{1,2}|${NUMW})\\s*'?(?:i|ı|u|ü|si|sı|sü|su)?(?:nde|nda|inde|ında|unda|ünde|sinde|sında|sünde|sunda)?`, 'date', m => {
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
    const n = wordNum(m[1]); if (!Number.isFinite(n) || n < 1 || n > 400) return false;
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
  // Göreli: "20 dakika sonra", "2 saat sonra", "yarım saat sonra", "1 saat 15 dakika sonra", "bir buçuk saat sonra"
  t.each(`(\\d{1,3}(?:[.,]\\d)?|yarım|çeyrek|${NUMW})(\\s*buçuk)?\\s*(dakika|dakka|dk|saat|sa)(?:\\s+(\\d{1,2}|${NUMW})\\s*(?:dakika|dakka|dk))?\\s+sonra(?:ya|sı|sına)?`, 'time', m => {
    if (found.time || found.date || found.repeat) return false;
    let n = m[1] === 'yarım' ? 0.5 : m[1] === 'çeyrek' ? 0.25 : /\d/.test(m[1]) ? parseFloat(m[1].replace(',', '.')) : wordNum(m[1]);
    if (!Number.isFinite(n)) return false;
    if (m[2]) n += 0.5;
    let mins = /^(saat|sa)$/.test(m[3]) ? n * 60 : n;
    if (m[4]) mins += wordNum(m[4]);
    mins = Math.round(mins);
    if (!(mins >= 1 && mins <= 2880)) return false;
    const at = clockAt(now + mins * 60000, tz);
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
  } else if (period && (found.date || found.repeat)) {
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
    } else if (!out.date) out.date = today;
  } else if (out.repeat === 'daily') {
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
  if (out.kind === 'note' && !out.title) out.title = '';
  out.doubt = doubts(out.title, found);
  out.found = found;
  if (relative && out.reminders == null) out.reminders = [0]; // "20 dakika sonra": tam o anda haber ver
  if (out.kind !== 'note') out.kind = out.time ? 'event' : 'task';
  return out;
}

const toMinutes = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
// Sesle "Not balık yemi bitti" (iki nokta söylemeden). "Not defteri al" plandır.
const NOTE_HEAD = /^(?:not(?:\s+(?:al|et|olarak|ekle|yaz|düş|kaydet)(?:\s+(?:ekle|kaydet|al))?)?|aklımdaki|aklıma\s+gelen)(?![\p{L}\p{N}])(?!\s*(?:defter|kağıd|kağıt|kâğıt|kâğıd))/u;
const NOTE_TAIL = /[\s,.;:]+not\s+(?:olarak\s+)?(?:ekle|kaydet|al|yaz|düş)[.!]?$/u;

// --- Tekrar hatırlatma (tamamlanana kadar) ---
const NAGU = '(dakika|dakka|dk|dak|saat|sa)';
const NAGSEP = "(?:'?(?:da|de|ta|te)\\s+bir|\\s*içinde|\\s*arayla|\\s*aralıkla|\\s*ara\\s+ile)";
const NAGC = `(${NUM})\\s*(?:kere|kez|defa|sefer)`;
const NAGHAT = '(?:(?:tekrar|yine|tekrardan)\\s+)?hatırlat\\p{L}*';
function nagValue(n, unit, count) {
  const k = n === 'yarım' ? 0.5 : wordNum(n);
  const every = Math.round(/^(saat|sa)$/.test(unit) ? k * 60 : (n === 'yarım' ? 30 : k));
  const times = count == null ? 3 : wordNum(count);
  if (!(every >= 1 && every <= 1440) || !(times >= 1 && times <= 20)) return null;
  return { every, times };
}
export const NAG_PATTERNS = [
  // "tekrar hatırlat 10 dakika içinde 5 kere", "her 15 dakikada bir 3 kez"
  [`(?:${NAGHAT}\\s*[:,]?\\s*)?(?:her\\s+)?(${NUM}|yarım)\\s*${NAGU}${NAGSEP}\\s*,?\\s*${NAGC}(?:\\s+${NAGHAT})?`, m => nagValue(m[1].trim(), m[2], m[3])],
  // "5 kere 10 dakikada bir hatırlat"
  [`${NAGC}\\s*(?:${NAGHAT}\\s*)?,?\\s*(?:her\\s+)?(${NUM}|yarım)\\s*${NAGU}${NAGSEP}(?:\\s+${NAGHAT})?`, m => nagValue(m[2].trim(), m[3], m[1])],
  // "her 10 dakikada bir tekrar hatırlat" (sayı yoksa 3 kez)
  [`(?:her\\s+)?(${NUM}|yarım)\\s*${NAGU}${NAGSEP}\\s+${NAGHAT}`, m => nagValue(m[1].trim(), m[2], null)],
  // "5 kere tekrar hatırlat", "tekrar hatırlat" (aralık yoksa 10 dk)
  [`${NAGC}\\s+(?:tekrar|yine|tekrardan)\\s+hatırlat\\p{L}*|(?:tekrar|yine|tekrardan)\\s+hatırlat\\p{L}*(?:\\s+${NAGC})?`, m => nagValue('10', 'dk', m[1] ?? m[2] ?? null)],
];
// Yalnız tekrar ifadesi yazıldığında (Telegram taslağı): {every, times} | null
export function parseNag(input) {
  const s = String(input || '').trim().toLocaleLowerCase('tr');
  if (/^(tekrar\s+)?(yok|kapat|kapalı|istemiyorum|hayır)$/u.test(s)) return false;
  for (const [pattern, pick] of NAG_PATTERNS) {
    const m = s.match(new RegExp(B + '(?:' + pattern + ')' + E, 'u'));
    if (m) { const v = pick(m); if (v) return v; }
  }
  // Tek başına: "her 15 dakikada bir" (3 kez), "5 kere" (10 dk arayla)
  let m = s.match(new RegExp(`^(?:her\\s+)?(${NUM}|yarım)\\s*${NAGU}${NAGSEP}$`, 'u'));
  if (m) return nagValue(m[1].trim(), m[2], null);
  m = s.match(new RegExp(`^${NAGC}$`, 'u'));
  if (m) return nagValue('10', 'dk', m[1]);
  return null;
}
export const nagLabel = n => (n ? `${n.every % 60 === 0 ? n.every / 60 + ' saatte' : n.every + ' dk\'da'} bir · ${n.times} kez` : '');

const FILLER = new Set(['ve', 'tekrar', 'yine', 'seç', 'seçsin', 'seçer', 'ekle', 'ekler', 'eklesene', 'kaydet', 'hatırlat', 'hatırlatsın', 'hatırlatma', 'hatırlatır', 'hatırlatıcı', 'olarak', 'bana', 'lütfen', 'de', 'da', 'kur', 'ayarla', 'oluştur', 'saat', 'her', 'için', 'ayrıca', 'misin', 'mısın', 'musun', 'müsün', 'tamam', 'bildir', 'bildirim', 'gönder', 'alarm', 'takvime', 'takvimime', 'plana', 'planıma', 'ajandaya', 'listeye', 'listeme', 'bir', 'şekilde', 'şeklinde', 'beni', 'bunu', 'not', 'al', 've', 'diye', 'yap', 'gerekli', 'olan', 'şeyi', 'şeyini']);
const KEEP_EDGE = new Set(['al', 'yap', 'not', 'bir']); // başlık içinde anlamlı olabilir; yalnız tek başına kalırsa silinir

export function cleanTitle(text) {
  let s = ' ' + text.replace(/\s+/g, ' ') + ' ';
  // Fiil kalıpları: "aramam için gerekli olan şeyi" → "ara", "aramayı unutma" → "ara"
  s = s.replace(/\s+(?:için\s+)?(?:gerekli|gereken)\s+(?:olan\s+)?(?:şeyi|şeyleri|şey|hatırlatmayı|hatırlatıcıyı)/giu, ' için');
  s = s.replace(/(\p{L}{2,}?)(?:mam|mem|mamız|memiz|mamı|memi)\s+(?:için|lazım|gerek\p{L}*)(?![\p{L}])/giu, '$1');
  s = s.replace(/(\p{L}{2,}?)(?:mayı|meyi)\s+unutma\p{L}*/giu, '$1');
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
    repeat: p.repeat, weekdays: p.repeat === 'weekly' ? p.weekdays : [], until: '',
    reminders: p.reminders, nag: p.nag || null, status: 'pending', exceptions: {}, note: '', createdAt: now, updatedAt: now, ...extra,
  };
}
export const parseDay = (now, tz) => dayAt(now, tz);

// Yalnız süre yazıldığında hatırlatma listesi: "30 dk", "1 sa 15 dk" (75), "10 ve 15 dk", "yarım saat",
// "15 sn", "vaktinde ve 10 dk". Anlaşılmazsa null, "yok" için [].
const DUR_UNIT = { saniye: 1 / 60, sn: 1 / 60, dakika: 1, dakka: 1, dk: 1, dak: 1, d: 1, saat: 60, sa: 60, s: 60, gün: 1440, g: 1440, hafta: 10080, hf: 10080 };
export function parseDurations(input) {
  let s = String(input || '').toLocaleLowerCase('tr').replace(/[’'`]/g, ' ').replace(/(önce\p{L}*|kala|hatırlat\p{L}*|kadar)/gu, ' ').trim();
  if (!s) return null;
  if (/^(yok|hiç|kapat|hatırlatma yok|istemiyorum)$/u.test(s)) return [];
  const out = new Set();
  if (/(vaktinde|zamanında|tam saatinde|anında)/u.test(s)) { out.add(0); s = s.replace(/(tam\s+)?(vaktinde|zamanında|saatinde|anında)/gu, ' '); }
  s = s.replace(/(\d),(\d)(?!\d)/g, '$1.$2'); // "1,5 saat" ondalık, "10,15 dk" liste
  const groups = s.split(/\s*(?:,|;|\+|(?<![\p{L}])(?:ve|veya|ile|ya da)(?![\p{L}]))\s*/u).map(g => g.trim()).filter(Boolean);
  const tok = new RegExp(`(\\d+(?:[.,]\\d+)?|yarım|çeyrek|${NUMW})\\s*(saniye|sn|dakika|dakka|dk|dak|saat|sa|gün|g|hafta|hf|s|d)?(?![\\p{L}])`, 'gu');
  const parsed = groups.map(g => {
    const parts = [...g.matchAll(tok)].map(m => ({ n: m[1] === 'çeyrek' ? 0.25 : /\d/.test(m[1]) ? parseFloat(m[1].replace(',', '.')) : wordNum(m[1]), u: m[2] || '' }));
    const rest = g.replace(tok, '').replace(/[\s.]/g, '');
    return rest ? null : parts;
  });
  if (parsed.some(p => p === null)) return out.size ? [...out] : null;
  for (let i = 0; i < parsed.length; i++) {
    const parts = parsed[i];
    if (!parts.length) continue;
    let unit = parts.find(p => p.u)?.u;
    if (!unit) unit = parsed.slice(i + 1).flat().find(p => p.u)?.u || 'dk'; // "10 ve 15 dk"
    let total = 0;
    for (const p of parts) {
      if (!Number.isFinite(p.n)) return null;
      const u = DUR_UNIT[p.u || (parts.length > 1 && p !== parts[0] ? 'dk' : unit)];
      total += (p.n === 0.5 && !p.u && unit === 'dk' ? 30 : p.n * u);
    }
    const v = Math.round(total * 60) / 60;
    if (v < 0 || v > 40320) return null;
    out.add(v);
  }
  return out.size ? [...out].sort((a, b) => b - a) : null;
}

// Yalnız saat yazıldığında: "17:34", "17.34", "17 34", "1734", "17", "saat 5", "akşam 8".
export function parseClock(input, opts = {}) {
  const s = String(input || '').trim().toLocaleLowerCase('tr');
  let m = s.match(/^(\d{1,2})\s*[:.,\s]\s*(\d{2})$/) || s.match(/^(\d{2})(\d{2})$/) || s.match(/^(\d)(\d{2})$/);
  if (m && +m[1] < 24 && +m[2] < 60) return `${pad(+m[1])}:${pad(+m[2])}`;
  m = s.match(/^(\d{1,2})$/);
  if (m && +m[1] < 24) return `${pad(+m[1])}:00`;
  const r = parse(s, opts);
  return r.found?.time ? r.time : '';
}
