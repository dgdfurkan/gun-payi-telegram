// Dönemsel faturalar. Bir dönem, başladığı ayın anahtarıyla (YYYY-MM-01) tutulur:
// ödeme günleri değişse de "Kasım ödendi" bilgisi kaybolmaz.
import { isDate, dayAdd, daysBetween, addMonths, monthsBetween, monthKey, monthSuffix, shortDate, MONTHS } from './dates.js';

// cat: ikon/emoji kategorisi (categories.js)
export const BILL_TYPES = {
  elektrik: { label: 'Elektrik', title: 'Elektrik faturası', cat: 'power', match: /elektri[kğ]/u },
  dogalgaz: { label: 'Doğalgaz', title: 'Doğalgaz faturası', cat: 'flame', match: /doğal\s*gaz|dogalgaz/u },
  su: { label: 'Su', title: 'Su faturası', cat: 'water', match: /(?<![\p{L}])su(?![\p{L}])/u },
  isinma: { label: 'Isınma', title: 'Isınma bedeli', cat: 'flame', match: /ısınma|merkezi ısı/u },
  internet: { label: 'Ev interneti', title: 'Ev interneti faturası', cat: 'wifi', match: /internet/u },
  telefon: { label: 'Telefon', title: 'Telefon faturası', cat: 'mobile', match: /telefon|gsm/u },
  kira: { label: 'Kira', title: 'Kira', cat: 'home', match: /(?<![\p{L}])kira(?![lz])/u },
  aidat: { label: 'Aidat', title: 'Aidat', cat: 'home', match: /aidat/u },
  chatgpt: { label: 'ChatGPT', title: 'ChatGPT aboneliği', cat: 'sub', auto: true, match: /chat\s*gpt|çet\s*gpt/u },
  claude: { label: 'Claude', title: 'Claude aboneliği', cat: 'sub', auto: true, match: /claude|klod|clod/u },
  kart: { label: 'Kredi kartı', title: 'Kredi kartı ödemesi', cat: 'pay', match: /kredi\s*kart|ekstre/u },
  abonelik: { label: 'Abonelik', title: 'Abonelik', cat: 'sub', auto: true, match: /abone|netflix|spotify|icloud|premium/u },
  diger: { label: 'Diğer', title: 'Fatura', cat: 'pay', match: /(?!)/u },
};
export function billTypeOf(text) {
  const s = String(text).toLocaleLowerCase('tr');
  return Object.keys(BILL_TYPES).find(k => BILL_TYPES[k].match.test(s)) || 'diger';
}

const dayList = v => [...new Set((Array.isArray(v) ? v : []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 3650))].sort((a, b) => a - b).slice(0, 100);
// { type, from, to: ayın günü, before: başlamadan N gün, after: bitişten N gün sonra, auto: kendiliğinden çekilir }
export function cleanBill(v) {
  if (!v || typeof v !== 'object') return null;
  const from = Math.round(Number(v.from)), to = Math.round(Number(v.to ?? v.from));
  if (!(from >= 1 && from <= 31 && to >= 1 && to <= 31)) throw Error('Fatura günleri geçersiz.');
  return { type: Object.hasOwn(BILL_TYPES, v.type) ? v.type : 'diger', from, to, before: dayList(v.before), after: dayList(v.after), auto: v.auto === true };
}
export function newBill(type = 'diger', from = 10, to = 15, auto = Boolean(BILL_TYPES[type]?.auto)) {
  // Aralıkta her gün zaten hatırlatır; net günde ve otomatik çekimde bir gün önceden haber ver.
  return { type, from, to, before: from === to || auto ? [1] : [], after: auto ? [] : [3], auto };
}
export const paidWord = bill => (bill.auto ? 'Çekildi' : 'Ödedim');

export function billSpan(bill, key) {
  return { start: addMonths(key, 0, bill.from), end: addMonths(key, bill.to < bill.from ? 1 : 0, bill.to) };
}
export function isCycle(item, key) {
  if (!isDate(key) || key !== monthKey(key) || !item.date) return false;
  const n = monthsBetween(item.date, key);
  return n >= 0 && n % (item.interval || 1) === 0 && !(item.until && billSpan(item.bill, key).start > item.until);
}
// İlk dönem: bugün aralığın içindeyse o dönem, değilse sıradaki.
export function firstCycle(bill, today) {
  const cur = monthKey(today);
  for (let n = -1; n <= 1; n++) {
    const key = addMonths(cur, n);
    if (billSpan(bill, key).end >= today) return key;
  }
  return addMonths(cur, 1);
}
// Dönemin hatırlatma günleri: önce, aralıktaki her gün, bitişten sonra
export function cycleDays(bill, key) {
  const { start, end } = billSpan(bill, key);
  const out = new Set(bill.before.map(n => dayAdd(start, -n)));
  for (let i = 0, n = daysBetween(start, end); i <= n; i++) out.add(dayAdd(start, i));
  for (const n of bill.after) out.add(dayAdd(end, n));
  return [...out].sort();
}
// Başlangıcı [fromDay, toDay] içinde kalan dönemler
export function cyclesBetween(item, fromDay, toDay) {
  const out = [];
  const n = monthsBetween(fromDay, toDay);
  for (let i = 0; i <= n; i++) {
    const key = addMonths(monthKey(fromDay), i);
    if (!isCycle(item, key)) continue;
    const { start } = billSpan(item.bill, key);
    if (start >= fromDay && start <= toDay) out.push(key);
  }
  return out;
}

export function spanLabel(start, end) {
  if (start === end) return shortDate(start);
  return start.slice(0, 7) === end.slice(0, 7) ? `${+start.slice(8)}–${shortDate(end)}` : `${shortDate(start)} – ${shortDate(end)}`;
}
export function billLabel(item) {
  const { from, to } = item.bill, n = item.interval || 1;
  const every = n === 1 ? 'Her ay' : n === 12 ? 'Yılda bir' : `${n} ayda bir`;
  if (from !== to) return `${every} ${from}–${to} arası`;
  if (from === 31) return `${every}, ayın son günü`;
  return n === 1 ? `Her ayın ${from}'${monthSuffix(from)}` : `${every}, ayın ${from}'${monthSuffix(from)}`;
}
export function billRemindLabel(bill) {
  const parts = [];
  if (bill.before.length) parts.push(`${bill.before.join(', ')} gün önce`);
  parts.push(bill.from === bill.to ? 'o gün' : 'aralıkta her gün');
  if (bill.after.length) parts.push(`bitince ${bill.after.join(', ')} gün sonra`);
  return parts.join(' · ');
}
export const periodName = key => MONTHS[+key.slice(5, 7) - 1];
