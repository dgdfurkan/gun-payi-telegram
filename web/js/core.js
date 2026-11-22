// Ortak çekirdek: plan modeli, tekrar, etiketler ve doğrulama. Hem uygulama hem Worker kullanır.
// Tarih ilkelleri dates.js, fatura dönemleri bills.js, hatırlatma zamanlaması jobs.js içinde.
import { TZ_DEFAULT, DAY_NAMES, isDate, isTime, dayAdd, weekday, daysBetween, mondayOf, monthDays, addMonths, monthsBetween, monthKey, monthSuffix, dayLabel, dayAt, hmAt, zonedMs } from './dates.js';
import { cleanBill, billSpan, isCycle, billLabel } from './bills.js';
import { movedTo } from './jobs.js';

export * from './dates.js';
export * from './bills.js';
export * from './jobs.js';

export const COLORS = ['yesil', 'indigo', 'mor', 'mavi', 'gunbatimi'];
export const MODES = ['light', 'dark', 'system'];
export const ALL_DAY = '09:00'; // saatsiz planın ve faturanın hatırlatma saati (Ayarlar'dan değişir)
// Eski tek değerli tema (5.0–5.1) → renk + mod
const LEGACY = { light: ['indigo', 'light'], dark: ['indigo', 'dark'], system: ['indigo', 'system'], mor: ['mor', 'light'], yesil: ['yesil', 'light'], mavi: ['mavi', 'light'], gunbatimi: ['gunbatimi', 'light'] };
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// --- Hatırlatma değeri ----------------------------------------------------
// Sayı: dakika (kesirli = saniye). "M2" ya da "M1+4320": takvim ayı + dakika ("1 ay 3 gün önce").
export const MAX_MINUTES = 5256000; // 10 yıl: yazım hatasına karşı, kullanım sınırı değil
const MONTH_REM = /^M([1-9]\d{0,2})(?:\+([1-9]\d{0,6}))?$/;
export function monthRem(v) {
  const m = typeof v === 'string' ? v.match(MONTH_REM) : null;
  return m ? { months: +m[1], extra: +(m[2] || 0) } : null;
}
export function readRem(v) {
  if (monthRem(v)) return v;
  const n = v === '' || v === null ? NaN : Math.round(Number(v) * 60) / 60;
  return Number.isFinite(n) && n >= 0 && n <= MAX_MINUTES ? n : null;
}
export function makeRem(months, minutes = 0) {
  return readRem(months ? `M${months}${minutes ? '+' + Math.round(minutes) : ''}` : minutes);
}
// Sıralama için yaklaşık uzunluk; gönderim zamanı remDue ile takvimden hesaplanır.
export function remMinutes(v) {
  const m = monthRem(v);
  return m ? m.months * 43830 + m.extra : v;
}
export function remDue(v, day, time, tz) {
  const m = monthRem(v);
  return m ? zonedMs(addMonths(day, -m.months), time, tz) - m.extra * 60000 : zonedMs(day, time, tz) - v * 60000;
}
export const sortRems = list => [...list].sort((a, b) => remMinutes(b) - remMinutes(a));

// --- Tekrar ---------------------------------------------------------------
// repeat: none | daily | weekly | monthly | yearly, interval: "her N". Tarihsiz kayıt gelen kutusudur.
export function activeOn(item, origin) {
  if (item.bill) return isCycle(item, origin);
  if (!item.date || origin < item.date || (item.until && origin > item.until)) return false;
  const every = item.interval || 1;
  switch (item.repeat) {
    case 'daily': return every === 1 || daysBetween(item.date, origin) % every === 0;
    case 'weekly':
      return item.weekdays.includes(weekday(origin)) && (every === 1 || (daysBetween(mondayOf(item.date), mondayOf(origin)) / 7) % every === 0);
    case 'monthly': case 'yearly': {
      const months = monthsBetween(item.date, origin);
      if (months % (item.repeat === 'yearly' ? 12 * every : every)) return false;
      const want = item.monthDay || +item.date.slice(8, 10), y = +origin.slice(0, 4), m = +origin.slice(5, 7) - 1;
      return +origin.slice(8, 10) === Math.min(want, monthDays(y, m));
    }
    default: return origin === item.date;
  }
}
export function occurrence(item, origin) {
  const ex = item.exceptions?.[origin];
  const o = { ...item, ...ex, id: item.id, origin, date: ex?.date || origin, exceptions: undefined };
  if (item.bill && isDate(origin)) {
    const { start, end } = billSpan(item.bill, origin);
    o.date = start;
    o.end = end;
  }
  return o;
}
export function statusOf(item, origin) {
  return item.repeat === 'none' ? item.status : (item.exceptions?.[origin]?.status || 'pending');
}
// Bir günün gerçekleşmeleri. Taşınmış istisnalar uzaktaki tarihte de bulunur. Fatura, dönemin ilk gününde görünür.
export function itemsOn(items, day) {
  const out = [];
  for (const item of items) {
    if (!item.date) continue;
    const origins = new Set([item.bill ? monthKey(day) : day]);
    if (item.exceptions && !item.bill) for (const [o, ex] of Object.entries(item.exceptions)) if (ex.date === day) origins.add(o);
    for (const origin of origins) {
      if (!activeOn(item, origin)) continue;
      const o = occurrence(item, origin);
      if (o.date === day && o.status !== 'cancelled') out.push(o);
    }
  }
  return out.sort(byTime);
}
export const byTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || (a.createdAt || '').localeCompare(b.createdAt || '');

// Başlamış ve ödenmemiş dönemler (her faturadan en fazla son 3). Otomatik çekilen, aralık ve ek hatırlatma geçince düşer.
export function openBills(items, today) {
  const out = [];
  for (const item of items) {
    if (!item.bill) continue;
    let found = 0;
    for (let i = 0; i < 24 * (item.interval || 1) && found < 3; i++) {
      const key = addMonths(monthKey(today), -i);
      if (monthsBetween(item.date, key) < 0) break;
      if (!isCycle(item, key)) continue;
      const o = occurrence(item, key);
      if (o.date > today || o.status !== 'pending') continue;
      if (item.bill.auto && today > dayAdd(o.end, Math.max(0, ...item.bill.after))) break;
      out.push(o);
      found++;
    }
  }
  return out.sort((a, b) => a.end.localeCompare(b.end) || byTime(a, b));
}
// Ekranlarda ve botta gösterilen gün. Bugün: açık faturalar ve bugün ödenenler de listededir.
// Saati geçtikten sonra ertelenen plan, ertelendiği günde ve o saatle görünür (o.at).
export function planOn(items, day, today, prefs) {
  const tz = prefs?.timeZone || TZ_DEFAULT;
  const placed = o => {
    const ms = movedTo(o, prefs);
    return ms ? { ...o, at: { date: dayAt(ms, tz), time: hmAt(ms, tz) } } : o;
  };
  const list = [];
  for (const raw of itemsOn(items, day)) {
    if (raw.bill && day === today) continue;
    const o = placed(raw);
    if (!o.at || o.at.date === day) list.push(o);
  }
  const seen = new Set(list.map(o => `${o.id}:${o.origin}`));
  const paid = [];
  for (const item of items) {
    if (!item.date) continue;
    const entries = item.repeat === 'none' ? [[item.date, item]] : Object.entries(item.exceptions || {});
    for (const [key, ex] of entries) {
      if (item.bill) {
        if (day === today && ex.status === 'done' && ex.doneOn === today && isCycle(item, key)) paid.push(occurrence(item, key));
      } else if (ex.snooze && !seen.has(`${item.id}:${key}`) && activeOn(item, key)) {
        const o = placed(occurrence(item, key));
        if (o.at?.date === day && o.status !== 'cancelled') list.push(o);
      }
    }
  }
  list.sort((a, b) => (a.at?.time || a.time || '99:99').localeCompare(b.at?.time || b.time || '99:99') || (a.createdAt || '').localeCompare(b.createdAt || ''));
  return day === today ? [...openBills(items, today), ...list, ...paid] : list;
}
export function donePatch(item, status, today) {
  return item.bill ? { status, doneOn: status === 'done' ? today : '' } : { status };
}
export function patchOccurrence(item, origin, patch) {
  const next = structuredClone(item), at = new Date().toISOString();
  if (next.repeat === 'none') Object.assign(next, patch);
  else next.exceptions = { ...next.exceptions, [origin]: { ...next.exceptions?.[origin], ...patch } };
  next.updatedAt = at;
  return next;
}

// --- Etiketler ---------------------------------------------------------------
// 75 → "1 sa 15 dk", 1445 → "1 gün 5 dk", 180 → "3 saat"
export function durationLabel(min) {
  if (min < 1) return `${Math.round(min * 60)} sn`;
  const m = Math.round(min), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), r = m % 60;
  return [d && `${d} gün`, h && `${h} ${d || r ? 'sa' : 'saat'}`, r && `${r} dk`].filter(Boolean).join(' ');
}
// Kısa tekrar etiketi: "10 dk × 5"
export const nagShort = n => (n ? `${n.every % 1440 === 0 ? n.every / 1440 + ' gün' : n.every % 60 === 0 ? n.every / 60 + ' sa' : durationLabel(n.every)} × ${n.times}` : '');
// [0, 10, 15, 60, 10080, "M1"] → "Vaktinde · 10, 15 dk · 1 saat · 1 hafta · 1 ay önce"
export function remindersLabel(list, allDay = false) {
  if (!list) return '';
  if (!list.length) return 'Hatırlatma yok';
  const g = { sn: [], dk: [], mixed: [], saat: [], gün: [], hafta: [], ay: [], yıl: [], mixedMonth: [] };
  let zero = false;
  for (const v of [...list].sort((a, b) => remMinutes(a) - remMinutes(b))) {
    const mr = monthRem(v);
    if (mr) {
      if (mr.extra) g.mixedMonth.push(`${mr.months} ay ${durationLabel(mr.extra)}`);
      else if (mr.months % 12 === 0) g.yıl.push(mr.months / 12);
      else g.ay.push(mr.months);
    } else if (v === 0) zero = true;
    else if (v < 1) g.sn.push(Math.round(v * 60));
    else if (v < 60) g.dk.push(v);
    else if (v % 1440 === 0) {
      const d = v / 1440;
      if (d % 7 === 0 && d <= 21) g.hafta.push(d / 7); else g.gün.push(d);
    } else if (v % 60 === 0 && v < 1440) g.saat.push(v / 60);
    else g.mixed.push(durationLabel(v));
  }
  const before = [];
  for (const [unit, values] of Object.entries(g)) {
    if (!values.length) continue;
    if (unit.startsWith('mixed')) before.push(...values);
    else before.push(`${values.join(', ')} ${unit}`);
  }
  const parts = [...(zero ? [allDay ? 'aynı gün' : 'vaktinde'] : []), ...before];
  const out = parts.join(' · ') + (before.length ? ' önce' : '');
  return out[0].toLocaleUpperCase('tr') + out.slice(1);
}
export function repeatLabel(item) {
  if (item.bill) return billLabel(item);
  const n = item.interval || 1;
  switch (item.repeat) {
    case 'daily': return n === 1 ? 'Her gün' : `${n} günde bir`;
    case 'yearly': return n === 1 ? 'Her yıl' : `${n} yılda bir`;
    case 'monthly': {
      const d = item.monthDay || +item.date.slice(8, 10);
      return n === 1 ? `Her ayın ${d}'${monthSuffix(d)}` : `${n} ayda bir, ayın ${d}'${monthSuffix(d)}`;
    }
    case 'weekly': {
      const d = [...item.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      if (n > 1) return `${n} haftada bir ${d.map(x => DAY_NAMES[x]).join(', ')}`;
      if (d.length === 7) return 'Her gün';
      if (d.length === 5 && d.join() === '1,2,3,4,5') return 'Hafta içi her gün';
      if (d.length === 2 && d.join() === '6,0') return 'Hafta sonları';
      return 'Her ' + d.map(x => DAY_NAMES[x]).join(', ');
    }
    default: return '';
  }
}
// Plan özeti: "Cuma 12:00 · Babaannemi ara"
export function summary(item, today) {
  const when = item.repeat !== 'none' ? repeatLabel(item) : item.date ? dayLabel(item.date, today) : '';
  const time = item.time ? (item.endTime ? `${item.time}–${item.endTime}` : item.time) : '';
  return [when, time].filter(Boolean).join(' ') + (when || time ? ' · ' : '') + item.title;
}

// --- Doğrulama ---------------------------------------------------------------
const STATUS = ['pending', 'done', 'cancelled'];
const REPEATS = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
export function cleanReminders(v) {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v) || v.length > 100) throw Error('Hatırlatma süreleri geçersiz.');
  const out = v.map(readRem);
  if (out.includes(null)) throw Error('Hatırlatma süreleri geçersiz.');
  return sortRems(new Set(out));
}
// Erteleme: { until: ne zaman, at: basıldığı an, for: hangi tarih/saat için }. Plan taşınırsa geçersizleşir.
function cleanSnooze(v) {
  if (!v || typeof v !== 'object') return null;
  const until = Number(v.until), at = Number(v.at);
  if (!Number.isFinite(until) || until <= 0 || until > 32503680000000 || !Number.isFinite(at) || at < 0) return null;
  return /^(?:\d{4}-\d{2}-\d{2})?T(?:\d{2}:\d{2})?$/.test(v.for) ? { until, at, for: v.for } : null;
}
function cleanPatch(p) {
  const out = {};
  if (!p || typeof p !== 'object') throw Error('İstisna geçersiz.');
  if ('status' in p) { if (!STATUS.includes(p.status) && p.status !== 'postponed') throw Error('Durum geçersiz.'); out.status = p.status === 'postponed' ? 'cancelled' : p.status; }
  if ('date' in p && p.date) { if (!isDate(p.date)) throw Error('Tarih geçersiz.'); out.date = p.date; }
  if ('time' in p) { if (p.time && !isTime(p.time)) throw Error('Saat geçersiz.'); out.time = p.time || ''; }
  if ('title' in p && typeof p.title === 'string' && p.title.trim()) out.title = p.title.trim().slice(0, 300);
  if ('snooze' in p) out.snooze = cleanSnooze(p.snooze);
  if ('doneOn' in p) out.doneOn = isDate(p.doneOn) ? p.doneOn : '';
  return out;
}
// Tamamlanmazsa tekrar hatırlat: { every: dakika (en çok 1 yıl), times: en çok 1000 } ya da null
export function cleanNag(v) {
  if (!v || typeof v !== 'object') return null;
  const every = Math.round(Number(v.every)), times = Math.round(Number(v.times));
  return every >= 1 && every <= 525600 && times >= 1 && times <= 1000 ? { every, times } : null;
}
export function cleanItem(raw) {
  if (!raw || typeof raw !== 'object') throw Error('Plan geçersiz.');
  if (typeof raw.id !== 'string' || !/^[-_:a-zA-Z0-9]{1,150}$/.test(raw.id)) throw Error('Plan kimliği geçersiz.');
  const title = String(raw.title ?? '').trim();
  if (!title || title.length > 300) throw Error('Plan başlığı geçersiz.');
  let date = raw.date || '';
  if (date && !isDate(date)) throw Error('Plan tarihi geçersiz.');
  for (const k of ['time', 'endTime']) if (raw[k] && !isTime(raw[k])) throw Error('Plan saati geçersiz.');
  const bill = cleanBill(raw.bill);
  const repeat = bill ? 'monthly' : REPEATS.includes(raw.repeat) ? raw.repeat : 'none';
  const weekdays = Array.isArray(raw.weekdays) ? [...new Set(raw.weekdays.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))] : [];
  if (repeat === 'weekly' && !weekdays.length) throw Error('Tekrar günleri eksik.');
  if (repeat !== 'none' && !date) throw Error('Tekrarlayan planın başlangıç tarihi olmalı.');
  if (bill) date = addMonths(date, 0, bill.from);
  const every = Math.round(Number(raw.interval));
  const interval = repeat !== 'none' && every >= 1 && every <= 999 ? every : 1;
  // "Her ayın 31'i" kasımda başlarsa tarih 30'a oturur; istenen günü ayrıca sakla.
  const md = Math.round(Number(raw.monthDay)), dd = +date.slice(8, 10);
  const monthDay = repeat === 'monthly' && !bill && md > dd && md <= 31 && dd === monthDays(+date.slice(0, 4), +date.slice(5, 7) - 1) ? md : 0;
  const exceptions = {};
  if (raw.exceptions && typeof raw.exceptions === 'object') {
    const entries = Object.entries(raw.exceptions);
    if (entries.length > 20000) throw Error('Çok fazla istisna.');
    for (const [o, p] of entries) { if (!isDate(o)) throw Error('İstisna tarihi geçersiz.'); exceptions[o] = cleanPatch(p); }
  }
  const now = new Date().toISOString();
  return {
    id: raw.id, title, kind: raw.kind === 'event' || raw.time ? 'event' : 'task',
    date, time: raw.time || '', endTime: !bill && raw.time && raw.endTime ? raw.endTime : '',
    repeat, interval, monthDay, weekdays: repeat === 'weekly' ? weekdays : [], until: raw.until && isDate(raw.until) ? raw.until : '',
    reminders: bill ? null : cleanReminders(raw.reminders),
    nag: bill ? null : cleanNag(raw.nag),
    bill,
    snooze: repeat === 'none' ? cleanSnooze(raw.snooze) : null,
    status: STATUS.includes(raw.status) ? raw.status : raw.status === 'postponed' ? 'cancelled' : 'pending',
    exceptions, note: typeof raw.note === 'string' ? raw.note.slice(0, 4000) : '',
    icon: typeof raw.icon === 'string' && /^[a-z]{2,12}$/.test(raw.icon) ? raw.icon : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  };
}
export function cleanPrefs(raw = {}) {
  const tz = typeof raw.timeZone === 'string' ? raw.timeZone : TZ_DEFAULT;
  try { new Intl.DateTimeFormat('tr', { timeZone: tz }); } catch { throw Error('Saat dilimi geçersiz.'); }
  return {
    name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : '',
    timeZone: tz,
    reminderDefaults: cleanReminders(raw.reminderDefaults ?? [10]) ?? [10],
    allDayTime: isTime(raw.allDayTime) ? raw.allDayTime : ALL_DAY,
    plannerMode: ['day', 'week', 'month'].includes(raw.plannerMode) ? raw.plannerMode : 'day',
    digest: { on: Boolean(raw.digest?.on), time: isTime(raw.digest?.time) ? raw.digest.time : '08:00' },
    reviewDay: Number.isInteger(raw.reviewDay) && raw.reviewDay >= 0 && raw.reviewDay <= 6 ? raw.reviewDay : 0,
    showDone: raw.showDone === true,
    color: COLORS.includes(raw.color) ? raw.color : (LEGACY[raw.theme]?.[0] || 'yesil'),
    mode: MODES.includes(raw.mode) ? raw.mode : (LEGACY[raw.theme]?.[1] || 'light'),
  };
}
