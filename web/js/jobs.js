// Hatırlatma zamanlaması: plan, tekrar, erteleme ve fatura dönemleri tek yerden hesaplanır.
import { TZ_DEFAULT, MINUTE, DAY_MS, dayAdd, dayAt, hmAt, daysBetween, addMonths, monthKey, monthsBetween, zonedMs } from './dates.js';
import { cycleDays, isCycle } from './bills.js';
import { ALL_DAY, activeOn, occurrence, cleanNag, monthRem, remDue } from './core.js';

const GRACE = 30 * MINUTE;       // kaçan iş bu kadar geç de olsa gider
const START_GRACE = 5 * MINUTE;  // başlamış planın eski "önce" hatırlatması gönderilmez (yeniden denemeye pay kalır)
const SNOOZE_GRACE = DAY_MS;     // kullanıcının istediği erteleme bir gün geç de olsa gider

export const baseTime = (o, prefs) => o.time || prefs?.allDayTime || ALL_DAY;
export const schedKey = o => `${o.date || ''}T${o.time || ''}`;
export const makeSnooze = (o, until, at) => ({ until, at, for: schedKey(o) });
export const snoozeOf = o => (o.snooze && o.snooze.for === schedKey(o) ? o.snooze : null);
// Plan saati geçtikten sonra (ya da plan saatinin ötesine) ertelenen plan o ana taşınmış sayılır.
// Daha erkene ertelenen yalnız bir ön hatırlatmadır. Faturanın günleri değişmez.
export function movedTo(o, prefs) {
  const z = snoozeOf(o);
  if (!z || o.bill) return null;
  if (!o.date) return z.until;
  return z.until >= zonedMs(o.date, baseTime(o, prefs), prefs?.timeZone || TZ_DEFAULT) ? z.until : null;
}

// Pencereye iş düşürebilecek gerçekleşmeler. Her gün taranmaz: 1 yıl önceden hatırlatma da ucuz kalır.
function originsOf(item, rem, nag, lo, hi, tz) {
  if (item.repeat === 'none') return item.date ? [item.date] : item.snooze ? [''] : [];
  const out = new Set(Object.keys(item.exceptions || {}));
  if (item.bill) {
    const { before, after } = item.bill;
    const first = addMonths(monthKey(dayAdd(dayAt(lo, tz), -Math.max(0, ...after))), -1);
    const last = monthKey(dayAdd(dayAt(hi, tz), Math.max(0, ...before)));
    for (let i = 0, n = monthsBetween(first, last); i <= n; i++) out.add(addMonths(first, i));
    return [...out].filter(k => isCycle(item, k));
  }
  const range = (from, to) => { for (let i = 0, n = daysBetween(from, to); i <= n; i++) out.add(dayAdd(from, i)); };
  for (const v of rem) {
    const m = monthRem(v);
    if (m) range(dayAdd(addMonths(dayAt(lo + m.extra * MINUTE, tz), m.months), -1), dayAdd(addMonths(dayAt(hi + m.extra * MINUTE, tz), m.months), 4));
    else range(dayAdd(dayAt(lo + v * MINUTE, tz), -1), dayAdd(dayAt(hi + v * MINUTE, tz), 1));
  }
  if (nag) range(dayAdd(dayAt(lo - Math.min(nag.every * nag.times * MINUTE, 62 * DAY_MS), tz), -1), dayAt(hi, tz));
  return [...out].filter(d => activeOn(item, d));
}

export function jobsFor(items, prefs, now = Date.now(), days = 8) {
  const tz = prefs?.timeZone || TZ_DEFAULT, defaults = prefs?.reminderDefaults ?? [10];
  const lo = now - GRACE, hi = now + days * DAY_MS;
  const out = new Map();
  for (const item of items) {
    if (item.repeat === 'none' && item.status && item.status !== 'pending') continue;
    const nag = item.bill ? null : cleanNag(item.nag);
    // Saatsiz plan yalnız hatırlatma istendiyse bildirir. Tekrar varken plan anında da haber verilir.
    const hasTime = item.time || Object.values(item.exceptions || {}).some(ex => ex.time);
    const list = item.reminders ?? (hasTime ? defaults : []);
    const rem = item.bill ? [] : nag ? [...new Set([...list, 0])] : list;
    for (const origin of originsOf(item, rem, nag, lo, hi, tz)) {
      const o = occurrence(item, origin);
      if (o.status !== 'pending' && o.status !== undefined) continue;
      const z = snoozeOf(o), time = baseTime(o, prefs);
      const start = o.date ? zonedMs(o.date, time, tz) : null;
      const moved = movedTo(o, prefs);
      const prefix = `${o.id}:${origin}:${time}`;
      const add = (key, due, k = 0, from = lo) => {
        if (due < from || due > hi) return;
        const id = `${prefix}:${key}`;
        if (out.has(id)) return;
        out.set(id, {
          id, itemId: o.id, origin, title: o.title, icon: o.icon || '', bill: o.bill || null, end: o.end || '', start, due,
          date: moved ? dayAt(moved, tz) : o.date, time: moved ? hmAt(moved, tz) : o.time, nag: k, nagTotal: nag?.times || 0,
        });
      };
      // Ertelenen ana kadar (o an dahil) hiçbir eski hatırlatma çalmaz.
      const quiet = due => Boolean(z) && due <= z.until;

      if (o.bill) {
        for (const d of cycleDays(o.bill, origin)) {
          const due = zonedMs(d, time, tz);
          if (!quiet(due)) add(`b${d}`, due);
        }
      } else if (start !== null && !moved) {
        // Saati istisnayla silinmiş gerçekleşme varsayılan hatırlatmayı almaz.
        const own = !o.time && item.reminders == null && !nag ? [] : rem;
        if (start + (nag ? nag.every * nag.times * MINUTE : 0) >= now - START_GRACE) {
          for (const v of own) {
            const due = remDue(v, o.date, time, tz);
            if (!quiet(due)) add(v, due);
          }
          if (nag) for (let k = 1; k <= nag.times; k++) {
            const due = start + nag.every * k * MINUTE;
            if (!quiet(due)) add(`n${k}`, due, k);
          }
        }
      }
      if (z) {
        add(`s${z.until}`, z.until, 0, now - SNOOZE_GRACE);
        // Taşınan planın tekrarları da ertelenen andan yeniden sayılır.
        if (nag && moved) for (let k = 1; k <= nag.times; k++) add(`s${z.until}:n${k}`, z.until + nag.every * k * MINUTE, k);
      }
    }
  }
  return [...out.values()].sort((a, b) => a.due - b.due || a.id.localeCompare(b.id));
}
