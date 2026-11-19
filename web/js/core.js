// Ortak çekirdek: tarih, tekrar, hatırlatma ve doğrulama. Hem uygulama hem Worker kullanır.

export const TZ_DEFAULT = 'Europe/Istanbul';
export const COLORS = ['yesil', 'indigo', 'mor', 'mavi', 'gunbatimi'];
export const MODES = ['light', 'dark', 'system'];
// Eski tek değerli tema (5.0–5.1) → renk + mod
const LEGACY = { light: ['indigo', 'light'], dark: ['indigo', 'dark'], system: ['indigo', 'system'], mor: ['mor', 'light'], yesil: ['yesil', 'light'], mavi: ['mavi', 'light'], gunbatimi: ['gunbatimi', 'light'] };
export const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
export const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export const isDate = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && new Date(x + 'T12:00:00Z').toISOString().slice(0, 10) === x;
export const isTime = x => typeof x === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x);
export const pad = n => String(n).padStart(2, '0');
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function dayAdd(day, n) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekday = day => new Date(day + 'T12:00:00Z').getUTCDay();
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
export const mondayOf = day => dayAdd(day, -((weekday(day) + 6) % 7));
export const monthDays = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

const fmtCache = new Map();
function parts(ms, tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    fmtCache.set(tz, f);
  }
  return Object.fromEntries(f.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
}
export function dayAt(ms, tz = TZ_DEFAULT) {
  const p = parts(ms, tz);
  return `${p.year}-${p.month}-${p.day}`;
}
export function clockAt(ms, tz = TZ_DEFAULT) {
  const p = parts(ms, tz);
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
}
export function zonedMs(day, time, tz = TZ_DEFAULT) {
  const goal = Date.parse(`${day}T${time}:00Z`);
  let guess = goal;
  for (let i = 0; i < 3; i++) {
    const p = parts(guess, tz);
    const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    if (seen === goal) return guess;
    guess += goal - seen;
  }
  return guess;
}
export const toMin = t => (t ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : null);
export const fromMin = m => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 60) + 60) % 60)}`;

// --- Tekrar ---------------------------------------------------------------
// repeat: none | daily | weekly | monthly. Tarihsiz (date === '') kayıt gelen kutusudur.
export function activeOn(item, origin) {
  if (!item.date || origin < item.date || (item.until && origin > item.until)) return false;
  switch (item.repeat) {
    case 'daily': return true;
    case 'weekly': return item.weekdays.includes(weekday(origin));
    case 'monthly': {
      const want = +item.date.slice(8, 10), y = +origin.slice(0, 4), m = +origin.slice(5, 7) - 1;
      return +origin.slice(8, 10) === Math.min(want, monthDays(y, m));
    }
    default: return origin === item.date;
  }
}
export function occurrence(item, origin) {
  const ex = item.exceptions?.[origin];
  return { ...item, ...ex, id: item.id, origin, date: ex?.date || origin, exceptions: undefined };
}
export function statusOf(item, origin) {
  return item.repeat === 'none' ? item.status : (item.exceptions?.[origin]?.status || 'pending');
}
// Bir günün gerçekleşmeleri. Taşınmış istisnalar uzaktaki tarihte de bulunur.
export function itemsOn(items, day) {
  const out = [];
  for (const item of items) {
    if (!item.date) continue;
    const origins = new Set([day]);
    if (item.exceptions) for (const [o, ex] of Object.entries(item.exceptions)) if (ex.date === day) origins.add(o);
    for (const origin of origins) {
      if (!activeOn(item, origin)) continue;
      const o = occurrence(item, origin);
      if (o.date === day && o.status !== 'cancelled') out.push(o);
    }
  }
  return out.sort(byTime);
}
export const byTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || (a.createdAt || '').localeCompare(b.createdAt || '');
export function patchOccurrence(item, origin, patch) {
  const next = structuredClone(item), at = new Date().toISOString();
  if (next.repeat === 'none') Object.assign(next, patch);
  else next.exceptions = { ...next.exceptions, [origin]: { ...next.exceptions?.[origin], ...patch } };
  next.updatedAt = at;
  return next;
}

// --- Hatırlatma işleri -------------------------------------------------------
export function jobsFor(items, prefs, now = Date.now(), days = 8) {
  const tz = prefs?.timeZone || TZ_DEFAULT, defaults = prefs?.reminderDefaults ?? [10];
  const out = [], seen = new Set(), today = dayAt(now, tz);
  for (const item of items) {
    if (!item.date || !item.time) continue;
    const nag = cleanNag(item.nag);
    // Tekrar varken plan saatinde de haber verilir; sonra her `every` dakikada `times` kez daha.
    const rem = nag ? [...new Set([...(item.reminders ?? defaults), 0])] : (item.reminders ?? defaults);
    if (!rem.length) continue;
    const maxBefore = Math.max(...rem);
    const after = nag ? nag.every * nag.times : 0;
    const origins = new Set();
    if (item.repeat === 'none') origins.add(item.date);
    else {
      const first = dayAdd(today, -1);
      const span = days + 2 + Math.ceil(maxBefore / 1440);
      for (let i = 0; i < span; i++) origins.add(dayAdd(first, i));
      for (const o of Object.keys(item.exceptions || {})) origins.add(o);
    }
    for (const origin of origins) {
      if (!activeOn(item, origin)) continue;
      const o = occurrence(item, origin);
      if (o.status !== 'pending' && o.status !== undefined) continue;
      if (!o.time) continue;
      const start = zonedMs(o.date, o.time, tz);
      if (start + after * 60000 < now - 120000) continue;
      const offsets = rem.map(m => [m, 0]);
      if (nag) for (let k = 1; k <= nag.times; k++) offsets.push([-nag.every * k, k]);
      for (const [m, k] of offsets) {
        const due = start - m * 60000;
        if (due < now - 30 * 60000 || due > now + days * 86400000) continue;
        const id = k ? `${o.id}:${origin}:${o.time}:n${k}` : `${o.id}:${origin}:${o.time}:${m}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ id, itemId: o.id, origin, date: o.date, time: o.time, title: o.title, icon: o.icon || '', start, due, minutes: m, nag: k, nagTotal: nag?.times || 0 });
      }
    }
  }
  return out.sort((a, b) => a.due - b.due || a.id.localeCompare(b.id));
}

// --- Etiketler ---------------------------------------------------------------
export function minutesLabel(m) {
  if (m === 0) return 'tam vaktinde';
  if (m < 1) return `${Math.round(m * 60)} sn önce`;
  if (m % 1440 === 0) return `${m / 1440} gün önce`;
  if (m % 60 === 0) return `${m / 60} saat önce`;
  if (m > 60) return `${Math.floor(m / 60)} sa ${m % 60} dk önce`;
  return `${m} dk önce`;
}
// [0, 10, 15, 60] → "Vaktinde · 10, 15 dk · 1 saat önce"
// Kısa tekrar etiketi: "10 dk × 5"
export const nagShort = n => (n ? `${n.every % 60 === 0 ? n.every / 60 + ' sa' : n.every + ' dk'} × ${n.times}` : '');
export function remindersLabel(list) {
  if (!list) return '';
  if (!list.length) return 'Hatırlatma yok';
  const s = [...list].sort((a, b) => a - b);
  const parts = [];
  if (s.includes(0)) parts.push('vaktinde');
  const secs = s.filter(m => m > 0 && m < 1);
  if (secs.length) parts.push(secs.map(m => Math.round(m * 60)).join(', ') + ' sn');
  const mins = s.filter(m => m >= 1 && (m < 60 || m % 60));
  const hours = s.filter(m => m >= 60 && m % 60 === 0 && m % 1440);
  const days = s.filter(m => m >= 1440 && m % 1440 === 0);
  if (mins.length) parts.push(mins.map(m => (m < 60 ? m : `${Math.floor(m / 60)} sa ${m % 60}`)).join(', ') + ' dk');
  if (hours.length) parts.push(hours.map(m => m / 60).join(', ') + ' saat');
  if (days.length) parts.push(days.map(m => m / 1440).join(', ') + ' gün');
  const before = parts.length > (s.includes(0) ? 1 : 0) ? ' önce' : '';
  const out = parts.join(' · ') + before;
  return out[0].toLocaleUpperCase('tr') + out.slice(1);
}
export function repeatLabel(item) {
  switch (item.repeat) {
    case 'daily': return 'Her gün';
    case 'monthly': return `Her ayın ${+item.date.slice(8, 10)}'${monthSuffix(+item.date.slice(8, 10))}`;
    case 'weekly': {
      const d = [...item.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      if (d.length === 7) return 'Her gün';
      if (d.length === 5 && d.join() === '1,2,3,4,5') return 'Hafta içi her gün';
      if (d.length === 2 && d.join() === '6,0') return 'Hafta sonları';
      return 'Her ' + d.map(x => DAY_NAMES[x]).join(', ');
    }
    default: return '';
  }
}
function monthSuffix(n) {
  const last = n % 10, tens = Math.floor(n / 10) % 10;
  if (last === 0) return ['', 'u', 'si', 'u', 'ı', 'si', 'ı', 'u', 'i', 'ı'][tens] || 'ı';
  return ['', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u'][last];
}
export function dayLabel(day, today) {
  const diff = daysBetween(today, day);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  if (diff === -1) return 'Dün';
  const [y, m, d] = day.split('-').map(Number);
  const base = `${d} ${MONTHS[m - 1]}`;
  const name = DAY_NAMES[weekday(day)];
  if (diff > 1 && diff < 7) return name;
  return `${base} ${name}${y !== +today.slice(0, 4) ? ' ' + y : ''}`;
}
export const shortDate = day => { const [, m, d] = day.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
// Plan özeti: "Cuma 12:00 · Babaannemi ara"
export function summary(item, today) {
  const when = item.repeat !== 'none' ? repeatLabel(item) : item.date ? dayLabel(item.date, today) : '';
  const time = item.time ? (item.endTime ? `${item.time}–${item.endTime}` : item.time) : '';
  return [when, time].filter(Boolean).join(' ') + (when || time ? ' · ' : '') + item.title;
}

// --- Doğrulama ---------------------------------------------------------------
const STATUS = ['pending', 'done', 'cancelled'];
export function cleanReminders(v) {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v) || v.length > 6) throw Error('Hatırlatma süreleri geçersiz.');
  // Dakika cinsinden; saniye hassasiyeti için kesirli olabilir (0.25 = 15 sn).
  const out = [...new Set(v.map(n => Math.round(Number(n) * 60) / 60))];
  if (out.some(n => !Number.isFinite(n) || n < 0 || n > 40320)) throw Error('Hatırlatma süreleri geçersiz.');
  return out.sort((a, b) => b - a);
}
function cleanPatch(p) {
  const out = {};
  if (!p || typeof p !== 'object') throw Error('İstisna geçersiz.');
  if ('status' in p) { if (!STATUS.includes(p.status) && p.status !== 'postponed') throw Error('Durum geçersiz.'); out.status = p.status === 'postponed' ? 'cancelled' : p.status; }
  if ('date' in p && p.date) { if (!isDate(p.date)) throw Error('Tarih geçersiz.'); out.date = p.date; }
  if ('time' in p) { if (p.time && !isTime(p.time)) throw Error('Saat geçersiz.'); out.time = p.time || ''; }
  if ('title' in p && typeof p.title === 'string' && p.title.trim()) out.title = p.title.trim().slice(0, 300);
  return out;
}
// Tamamlanmazsa tekrar hatırlat: { every: dakika (1–1440), times: 1–20 } ya da null
export function cleanNag(v) {
  if (!v || typeof v !== 'object') return null;
  const every = Math.round(Number(v.every)), times = Math.round(Number(v.times));
  return every >= 1 && every <= 1440 && times >= 1 && times <= 20 ? { every, times } : null;
}
export function cleanItem(raw) {
  if (!raw || typeof raw !== 'object') throw Error('Plan geçersiz.');
  if (typeof raw.id !== 'string' || !/^[-_:a-zA-Z0-9]{1,150}$/.test(raw.id)) throw Error('Plan kimliği geçersiz.');
  const title = String(raw.title ?? '').trim();
  if (!title || title.length > 300) throw Error('Plan başlığı geçersiz.');
  const date = raw.date || '';
  if (date && !isDate(date)) throw Error('Plan tarihi geçersiz.');
  for (const k of ['time', 'endTime']) if (raw[k] && !isTime(raw[k])) throw Error('Plan saati geçersiz.');
  const repeat = ['none', 'daily', 'weekly', 'monthly'].includes(raw.repeat) ? raw.repeat : 'none';
  const weekdays = Array.isArray(raw.weekdays) ? [...new Set(raw.weekdays.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))] : [];
  if (repeat === 'weekly' && !weekdays.length) throw Error('Tekrar günleri eksik.');
  if (repeat !== 'none' && !date) throw Error('Tekrarlayan planın başlangıç tarihi olmalı.');
  const exceptions = {};
  if (raw.exceptions && typeof raw.exceptions === 'object') {
    const entries = Object.entries(raw.exceptions);
    if (entries.length > 3000) throw Error('Çok fazla istisna.');
    for (const [o, p] of entries) { if (!isDate(o)) throw Error('İstisna tarihi geçersiz.'); exceptions[o] = cleanPatch(p); }
  }
  const now = new Date().toISOString();
  return {
    id: raw.id, title, kind: raw.kind === 'event' || raw.time ? 'event' : 'task',
    date, time: raw.time || '', endTime: raw.time && raw.endTime ? raw.endTime : '',
    repeat, weekdays: repeat === 'weekly' ? weekdays : [], until: raw.until && isDate(raw.until) ? raw.until : '',
    reminders: cleanReminders(raw.reminders),
    nag: cleanNag(raw.nag),
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
    plannerMode: ['day', 'week', 'month'].includes(raw.plannerMode) ? raw.plannerMode : 'day',
    digest: { on: Boolean(raw.digest?.on), time: isTime(raw.digest?.time) ? raw.digest.time : '08:00' },
    reviewDay: Number.isInteger(raw.reviewDay) && raw.reviewDay >= 0 && raw.reviewDay <= 6 ? raw.reviewDay : 0,
    showDone: raw.showDone === true,
    color: COLORS.includes(raw.color) ? raw.color : (LEGACY[raw.theme]?.[0] || 'yesil'),
    mode: MODES.includes(raw.mode) ? raw.mode : (LEGACY[raw.theme]?.[1] || 'light'),
  };
}
