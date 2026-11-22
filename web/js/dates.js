// Tarih ve saat ilkelleri. Uygulama ve Worker ortak kullanır; başka modüle bağlı değildir.

export const TZ_DEFAULT = 'Europe/Istanbul';
export const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
export const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const MINUTE = 60000, DAY_MS = 86400000;

export const isDate = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x + 'T12:00:00Z')) && new Date(x + 'T12:00:00Z').toISOString().slice(0, 10) === x;
export const isTime = x => typeof x === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x);
export const pad = n => String(n).padStart(2, '0');

export function dayAdd(day, n) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekday = day => new Date(day + 'T12:00:00Z').getUTCDay();
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY_MS);
export const mondayOf = day => dayAdd(day, -((weekday(day) + 6) % 7));
export const monthDays = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

// Takvim ayı: "31 Mart − 1 ay" = 28/29 Şubat. `want` verilirse o güne (ay kısaysa son güne) oturur.
export function addMonths(day, n, want = +day.slice(8, 10)) {
  const total = +day.slice(0, 4) * 12 + +day.slice(5, 7) - 1 + n;
  const y = Math.floor(total / 12), m = total - y * 12;
  return `${y}-${pad(m + 1)}-${pad(Math.min(want, monthDays(y, m)))}`;
}
export const monthsBetween = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + +b.slice(5, 7) - +a.slice(5, 7);
export const monthKey = day => day.slice(0, 8) + '01';

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
export function hmAt(ms, tz = TZ_DEFAULT) {
  const p = parts(ms, tz);
  return `${p.hour}:${p.minute}`;
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

export function monthSuffix(n) {
  const last = n % 10, tens = Math.floor(n / 10) % 10;
  if (last === 0) return ['', 'u', 'si', 'u', 'ı', 'si', 'ı', 'u', 'i', 'ı'][tens] || 'ı';
  return ['', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u'][last];
}
export const shortDate = day => { const [, m, d] = day.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
export function dayLabel(day, today) {
  const diff = daysBetween(today, day);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  if (diff === -1) return 'Dün';
  const name = DAY_NAMES[weekday(day)];
  if (diff > 1 && diff < 7) return name;
  return `${shortDate(day)} ${name}${day.slice(0, 4) !== today.slice(0, 4) ? ' ' + day.slice(0, 4) : ''}`;
}
// Hatırlatmada belirsizlik olmasın: yakın günler adıyla, diğerleri tam tarihle
export function exactDay(day, today) {
  const diff = daysBetween(today, day);
  if (diff >= -1 && diff <= 1) return dayLabel(day, today);
  return `${shortDate(day)} ${DAY_NAMES[weekday(day)]}${day.slice(0, 4) !== today.slice(0, 4) ? ' ' + day.slice(0, 4) : ''}`;
}
// Bir an: "20:35", "Yarın 09:15", "24 Nisan Cumartesi 2027 09:00"
export function whenAt(ms, tz, today) {
  const d = dayAt(ms, tz);
  return (d === today ? '' : exactDay(d, today) + ' ') + hmAt(ms, tz);
}
