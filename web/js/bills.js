// Dönemsel faturalar. Bir dönem, başladığı ayın anahtarıyla (YYYY-MM-01) tutulur:
// ödeme günleri değişse de "Kasım ödendi" bilgisi kaybolmaz.
import { isDate, dayAdd, daysBetween, addMonths, monthsBetween, monthKey, monthSuffix, shortDate, MONTHS } from './dates.js';

// cat: ikon/emoji kategorisi (categories.js). Sıra önemlidir: ilk eşleşen tür seçilir ("Apple iCloud" → iCloud).
// Aynı türden birden çok kayıt olabilir (iki telefon hattı, iki ChatGPT hesabı); ayrımı başlık yapar.
export const BILL_GROUPS = [['ev', 'Ev ve hat'], ['dijital', 'Dijital abonelikler'], ['odeme', 'Ödemeler ve diğer']];
export const BILL_TYPES = {
  elektrik: { group: 'ev', label: 'Elektrik', title: 'Elektrik faturası', cat: 'power', match: /elektri[kğ]/u },
  dogalgaz: { group: 'ev', label: 'Doğalgaz', title: 'Doğalgaz faturası', cat: 'flame', match: /doğal\s*gaz|dogalgaz/u },
  su: { group: 'ev', label: 'Su', title: 'Su faturası', cat: 'water', match: /(?<![\p{L}])su(?![\p{L}])/u },
  isinma: { group: 'ev', label: 'Isınma', title: 'Isınma bedeli', cat: 'flame', match: /ısınma|merkezi ısı/u },
  internet: { group: 'ev', label: 'Ev interneti', title: 'Ev interneti faturası', cat: 'wifi', match: /internet/u },
  telefon: { group: 'ev', label: 'Telefon', title: 'Telefon faturası', cat: 'mobile', match: /telefon|gsm|(?<![\p{L}])hat(?:t[ıi])?(?![\p{L}])/u },
  kira: { group: 'ev', label: 'Kira', title: 'Kira', cat: 'home', match: /(?<![\p{L}])kira(?![lz])/u },
  aidat: { group: 'ev', label: 'Aidat', title: 'Aidat', cat: 'home', match: /aidat/u },
  chatgpt: { group: 'dijital', label: 'ChatGPT', title: 'ChatGPT aboneliği', cat: 'ai', auto: true, match: /chat\s*gpt|çet\s*gpt|openai/u },
  claude: { group: 'dijital', label: 'Claude', title: 'Claude aboneliği', cat: 'ai', auto: true, match: /claude|klod|clod/u },
  gemini: { group: 'dijital', label: 'Gemini', title: 'Gemini aboneliği', cat: 'ai', auto: true, match: /gemini|cemini/u },
  youtube: { group: 'dijital', label: 'YouTube', title: 'YouTube Premium', cat: 'tv', auto: true, match: /you\s*tube|yutu[pb]/u },
  netflix: { group: 'dijital', label: 'Netflix', title: 'Netflix aboneliği', cat: 'tv', auto: true, match: /netfl[iı][xks]/u },
  disney: { group: 'dijital', label: 'Disney+', title: 'Disney+ aboneliği', cat: 'tv', auto: true, match: /disney|dizni/u },
  prime: { group: 'dijital', label: 'Prime Video', title: 'Amazon Prime aboneliği', cat: 'tv', auto: true, match: /amazon|(?<![\p{L}])prime(?![\p{L}])/u },
  max: { group: 'dijital', label: 'HBO Max', title: 'HBO Max aboneliği', cat: 'tv', auto: true, match: /hbo|blu\s*tv|(?<![\p{L}])max(?![\p{L}])/u },
  exxen: { group: 'dijital', label: 'Exxen', title: 'Exxen aboneliği', cat: 'tv', auto: true, match: /exxen|ekzen/u },
  tod: { group: 'dijital', label: 'TOD', title: 'TOD aboneliği', cat: 'tv', auto: true, match: /(?<![\p{L}])tod(?![\p{L}])|bein/u },
  spotify: { group: 'dijital', label: 'Spotify', title: 'Spotify Premium', cat: 'music', auto: true, match: /spot[iı]f[aiy]/u },
  icloud: { group: 'dijital', label: 'iCloud+', title: 'iCloud+ depolama', cat: 'cloud', auto: true, match: /[iı]\s*cloud|ay\s*kla[uv]d/u },
  apple: { group: 'dijital', label: 'Apple', title: 'Apple aboneliği', cat: 'sub', auto: true, match: /apple|app\s*store|(?<![\p{L}])epıl/u },
  google: { group: 'dijital', label: 'Google One', title: 'Google One depolama', cat: 'cloud', auto: true, match: /google|gugıl/u },
  microsoft: { group: 'dijital', label: 'Microsoft 365', title: 'Microsoft 365 aboneliği', cat: 'cloud', auto: true, match: /microsoft|office\s*365|one\s*drive/u },
  adobe: { group: 'dijital', label: 'Adobe', title: 'Adobe aboneliği', cat: 'sub', auto: true, match: /adobe|photoshop|lightroom/u },
  oyun: { group: 'dijital', label: 'Oyun', title: 'Oyun aboneliği', cat: 'game', auto: true, match: /playstation|ps\s*plus|xbox|game\s*pass|nintendo|steam|(?<![\p{L}])oyun/u },
  abonelik: { group: 'dijital', label: 'Diğer abonelik', title: 'Abonelik', cat: 'sub', auto: true, match: /abone|premium/u },
  kart: { group: 'odeme', label: 'Kredi kartı', title: 'Kredi kartı ödemesi', cat: 'pay', match: /kredi\s*kart|ekstre/u },
  sigorta: { group: 'odeme', label: 'Sigorta', title: 'Sigorta', cat: 'shield', match: /sigorta|kasko|poliçe/u },
  spor: { group: 'odeme', label: 'Spor salonu', title: 'Spor salonu', cat: 'sport', match: /spor\s*salon|(?<![\p{L}])gym|fitness/u },
  kurs: { group: 'odeme', label: 'Okul, kurs', title: 'Kurs ödemesi', cat: 'study', match: /(?<![\p{L}])okul|kurs|dershane/u },
  kredi: { group: 'odeme', label: 'Kredi taksiti', title: 'Kredi taksiti', cat: 'pay', match: /kredi|taksit/u },
  diger: { group: 'odeme', label: 'Diğer', title: 'Fatura', cat: 'pay', match: /(?!)/u },
};
export function billTypeOf(text) {
  // Marka adları büyük harfle gelebilir: Türkçe küçültme "ICLOUD"u "ıcloud" yapar, ikisine de bakılır.
  const forms = [String(text).toLocaleLowerCase('tr'), String(text).toLowerCase()];
  return Object.keys(BILL_TYPES).find(k => forms.some(s => BILL_TYPES[k].match.test(s))) || 'diger';
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
// Aynı türden ikinci kayıt "Telefon faturası 2" olur; kullanıcı adı "İş hattı" gibi değiştirebilir.
export function freshBillTitle(type, items) {
  const base = (BILL_TYPES[type] || BILL_TYPES.diger).title;
  const taken = new Set(items.filter(i => i.bill).map(i => i.title.trim().toLocaleLowerCase('tr')));
  if (!taken.has(base.toLocaleLowerCase('tr')) && !items.some(i => i.bill?.type === type)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLocaleLowerCase('tr'))) n++;
  return `${base} ${n}`;
}

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
