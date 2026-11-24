// Telegram Bot API yardımcıları ve mesaj biçimleri.
import { dayAt, dayAdd, planOn, summary, repeatLabel, remindersLabel, nagShort, dayLabel, exactDay, whenAt, hmAt, daysBetween, MONTHS, spanLabel, billRemindLabel, billSpan, monthKey, paidWord, DAY_NAMES, DAY_SHORT, shortDate, weekday, ALL_DAY } from '../web/js/core.js';
import { emojiOf } from '../web/js/categories.js';
import { nagLabel } from '../web/js/parse.js';

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function tg(env, method, payload) {
  if (!env.BOT_TOKEN) throw Error('BOT_TOKEN ayarlı değil.');
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw Error(`Telegram ${method}: ${data.description || res.status}`);
  return data.result;
}

export const buttons = rows => ({ inline_keyboard: rows.map(r => r.map(([text, data]) => ({ text, callback_data: data }))) });

export function send(env, chatId, text, markup) {
  return tg(env, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}) });
}

export const HELP = [
  'Bana yazman ya da <b>sesli mesaj</b> atman yeterli. Önce taslak gösteririm; gün, saat ve hatırlatmayı düğmelerle düzeltip <b>Ekle</b> dersin.',
  '• <i>Her cuma 12\'de babaannemi ara</i>',
  '• <i>Yarın 9\'da spor, 10 dk önce hatırlat</i>',
  '• <i>Hafta içi her gün 07:30 ilaç</i>',
  '• <i>24 Nisan\'da nişan, 1 ay ve 1 hafta önce hatırlat</i>',
  '• <i>Elektrik faturası her ayın 10\'u ile 15\'i arası</i>',
  '• <i>Not aklımdaki fikir</i>',
  '• Hatırlatmayı ertelemek için süreyi yaz: <i>20 dk</i>, <i>1 gün 5 saat</i>.',
  '• Saatsiz yazarsan yapılacaklara eklerim.',
  '• Taslak açıkken <i>yarın 10\'da</i> yazarsan taslağı düzeltirim.',
  '',
  '/bugun · /yarin · /hafta',
].join('\n');

// Sade hatırlatma: ne yapılacak ve ne zaman. Kaçıncı hatırlatma ya da "10 dk sonra" yazmaz.
// Saati geçtikten sonra ertelenen planda saat, ertelenen saattir (job.date/time öyle gelir).
export function reminderMessage(job, today) {
  const icon = emojiOf(job) === '•' ? '⏰' : emojiOf(job);
  const when = job.bill
    ? spanLabel(job.date, job.end || job.date)
    : [job.date && !(job.time && job.date === today) ? exactDay(job.date, today) : '', job.time].filter(Boolean).join(' ');
  return `${icon} <b>${esc(job.title)}</b>${when ? `\n${when}` : ''}`;
}
// Bu hatırlatmadan sonra aynı plan için gelecek olanlar, sırayla ve saatle: "🔔 Sonraki: 20:20 · 20:30".
// Ayrı bildirim değil, mesajın son satırıdır. Hepsi aynı saatteyse günler birlikte: "Yarın, 12, 13 Aralık · 09:00".
export function nextLine(dues, tz, today, max = 6) {
  const list = [...new Set(dues)].sort((a, b) => a - b).map(ms => ({ day: dayAt(ms, tz), hm: hmAt(ms, tz) }));
  const seen = new Set(), uniq = list.filter(x => !seen.has(x.day + x.hm) && seen.add(x.day + x.hm));
  if (!uniq.length) return '';
  const shown = uniq.slice(0, max), more = uniq.length - shown.length;
  const month = d => MONTHS[+d.slice(5, 7) - 1];
  let text;
  if (shown.length > 1 && shown.every(x => x.hm === shown[0].hm && x.day !== today)) {
    text = shown.map((x, i) => {
      if (daysBetween(today, x.day) === 1) return 'Yarın';
      const next = shown[i + 1];
      return `${+x.day.slice(8)}${!next || next.day.slice(0, 7) !== x.day.slice(0, 7) || daysBetween(today, next.day) === 1 ? ' ' + month(x.day) : ''}`;
    }).join(', ') + ` · ${shown[0].hm}`;
  } else {
    text = shown.map(x => {
      const diff = daysBetween(today, x.day);
      return diff === 0 ? x.hm : diff === 1 ? `Yarın ${x.hm}` : `${+x.day.slice(8)} ${month(x.day)} ${x.hm}`;
    }).join(' · ');
  }
  return `\n🔔 Sonraki: ${text}${more > 0 ? ` +${more}` : ''}`;
}
export const snoozedMessage = (job, until, today, tz) => `${reminderMessage(job, today)}\n⏰ Ertelendi: ${whenAt(until, tz, today)}`;
export const snoozeMenuMessage = (job, today, next = '') => `${reminderMessage(job, today)}${next}\n\n<i>Süreye dokun ya da sohbete yaz: 45 dk, 3 saat, 1 gün</i>`;

// Hatırlatma altındaki düğmeler: ana sıra, Ertele menüsü ya da ertelenmiş hâl
export function reminderButtons(itemId, origin, { mode = 'main', bill = null } = {}) {
  const k = `${itemId}:${origin}`;
  if (mode === 'snooze') return buttons([
    [['10 dk', `z:${k}:10`], ['20 dk', `z:${k}:20`], ['30 dk', `z:${k}:30`]],
    [['1 saat', `z:${k}:60`], ['2 saat', `z:${k}:120`], ['Yarın', `z:${k}:1440`]],
    [['← Geri', `b:${k}`]],
  ]);
  return buttons([[[`✓ ${bill ? paidWord(bill) : 'Tamamlandı'}`, `d:${k}`], [mode === 'snoozed' ? '⏰ Değiştir' : '⏰ Ertele', `e:${k}`]]]);
}

const effectiveRem = (item, defaults) => item.reminders ?? (item.time ? defaults : []);

export function addedMessage(item, today, viaAi, { reminderDefaults = [10], allDayTime = ALL_DAY } = {}) {
  const lines = [`✅ ${emojiOf(item)} <b>${esc(item.title)}</b>`];
  if (item.bill) {
    const { start, end } = billSpan(item.bill, monthKey(item.date));
    lines.push(`${repeatLabel(item)} · ilk dönem ${spanLabel(start, end)}`, `🔔 ${billRemindLabel(item.bill)} · ${item.time || allDayTime}`);
  } else {
    const when = item.repeat !== 'none' ? repeatLabel(item) : item.date ? dayLabel(item.date, today) : 'Yapılacaklar';
    lines.push([when, item.time ? (item.endTime ? `${item.time}–${item.endTime}` : item.time) : ''].filter(Boolean).join(' · '));
    const rem = item.date ? effectiveRem(item, reminderDefaults) : [];
    const extra = [rem.length ? `🔔 ${remindersLabel(rem, !item.time)}${item.time ? '' : ` (${allDayTime})`}` : '', item.date && item.nag ? '🔁 ' + nagShort(item.nag) : ''].filter(Boolean);
    if (extra.length) lines.push(extra.join(' · '));
  }
  if (viaAi) lines.push('<i>✨ AI ile anlaşıldı, kontrol et</i>');
  return lines.join('\n');
}

export function dayList(items, day, today, offset = 0, prefs = undefined) {
  const list = planOn(items, day, today, prefs);
  const head = `<b>${esc(dayLabel(day, today))}</b> · ${shortDate(day)} ${DAY_NAMES[weekday(day)]}`;
  if (!list.length) return { text: `${head}\nBoş.`, list };
  const rows = list.map((o, i) => `${o.status === 'done' ? '✓' : `${offset + i + 1}.`} ${o.at?.time || o.time ? (o.at?.time || o.time) + ' ' : ''}${o.status === 'done' ? '<s>' + esc(o.title) + '</s>' : esc(o.title) + (o.bill ? ` (${spanLabel(o.date, o.end)})` : '')}`);
  return { text: `${head}\n${rows.join('\n')}`, list };
}

export function inboxList(items) {
  const open = items.filter(i => !i.date && i.status === 'pending');
  if (!open.length) return '';
  return '<b>Yapılacaklar</b>\n' + open.slice(0, 15).map(i => '• ' + esc(i.title)).join('\n');
}

export function digestMessage(items, prefs, now) {
  const tz = prefs.timeZone, today = dayAt(now, tz);
  const list = planOn(items, today, today, prefs).filter(o => o.status !== 'done');
  const hi = prefs.name ? `Günaydın ${esc(prefs.name)} ☀️` : 'Günaydın ☀️';
  if (!list.length) return `${hi}\nBugün planında bir şey yok.`;
  return `${hi}\n<b>Bugün</b>\n` + list.map(o => `• ${o.at?.time || o.time ? (o.at?.time || o.time) + ' ' : ''}${esc(o.title)}${o.bill ? ` (${spanLabel(o.date, o.end)})` : ''}`).join('\n');
}

export { summary, dayAdd };

// Düğmeli taslak: main | day | time | rem | rep
const REM_OPTS = [[0, 'Vaktinde'], [1, '1 dk'], [5, '5 dk'], [10, '10 dk'], [15, '15 dk'], [30, '30 dk'], [60, '1 sa'], [120, '2 sa'], [1440, '1 gün'], [4320, '3 gün'], [10080, '1 hafta'], ['M1', '1 ay']];
const DAY_OPTS = [[0, 'Aynı gün'], [1440, '1 gün'], [4320, '3 gün'], [10080, '1 hafta'], [20160, '2 hafta'], ['M1', '1 ay'], ['M2', '2 ay'], ['M12', '1 yıl']];
export function draftView(d, today, mode = 'main', { reminderDefaults = [10], allDayTime = ALL_DAY } = {}) {
  const it = d.item, x = (op, arg = '') => `x:${d.id}:${op}${arg !== '' ? ':' + arg : ''}`;
  const when = it.repeat !== 'none' ? repeatLabel(it) : it.date ? `${dayLabel(it.date, today)}${dayLabel(it.date, today).match(/^(Bugün|Yarın|Dün)$/) ? ', ' + shortDate(it.date) : ''}` : 'Tarihsiz (Yapılacaklar)';
  const rem = effectiveRem(it, reminderDefaults);
  const lines = [];
  if (d.voice) lines.push(`🎙 <i>“${esc(d.voice)}”</i>`, '');
  lines.push(`📝 <b>Taslak</b>`, `${emojiOf(it)} <b>${esc(it.title)}</b>`);
  if (it.bill) {
    const { start, end } = billSpan(it.bill, monthKey(it.date));
    lines.push(`📅 ${esc(repeatLabel(it))}`, `İlk dönem: ${spanLabel(start, end)}`, `🕐 ${it.time || allDayTime}`, `🔔 ${esc(billRemindLabel(it.bill))}`);
  } else {
    lines.push(`📅 ${esc(when)}`, `🕐 ${it.time ? (it.endTime ? `${it.time}–${it.endTime}` : it.time) : 'Saat yok'}`);
    if (it.date && (it.time || rem.length)) lines.push(`🔔 ${esc(remindersLabel(rem, !it.time))}${it.time ? '' : ` (${allDayTime})`}`);
    if (it.date && it.nag) lines.push(`🔁 Tamamlanmazsa ${esc(nagLabel(it.nag))}`);
  }
  if (d.ai) lines.push('<i>✨ AI ile anlaşıldı, kontrol et</i>');
  const hint = { main: it.bill ? 'Saati ya da “1 gün önce”yi yazabilirsin.' : 'Düzeltmek için dokun ya da “yarın 10’da” gibi yaz.', day: 'Ya da tarihi yaz: “20 Aralık”, “20 Aralık 2027”, “haftaya cuma”.', time: 'Ya da saati yaz: “17:34”.', rem: 'Ya da istediğin süreyi yaz: “30 dk”, “28 gün”, “1 ay ve 1 hafta”. Tekrar için: “10 dk içinde 5 kere”.', txt: '✏️ Yeni başlığı yazıp gönder.' }[mode];
  if (hint) lines.push('', `<i>${hint}</i>`);
  const back = ['← Geri', x('back')];
  let rows;
  if (mode === 'day') {
    const days = Array.from({ length: 8 }, (_, i) => dayAdd(today, i));
    const label = (dd, i) => (i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : `${DAY_SHORT[weekday(dd)]} ${+dd.slice(8)}`);
    const mark = (dd, l) => (it.repeat === 'none' && it.date === dd ? '✓ ' + l : l);
    rows = [days.slice(0, 4).map((dd, i) => [mark(dd, label(dd, i)), x('d', dd)]), days.slice(4).map((dd, i) => [mark(dd, label(dd, i + 4)), x('d', dd)]), [['Haftaya', x('d', dayAdd(it.date || today, 7))], [it.date ? 'Tarihsiz' : '✓ Tarihsiz', x('d', '')], back]];
  } else if (mode === 'time') {
    const t = v => [(it.time === v ? '✓ ' : '') + v, x('t', v.replace(':', ''))];
    rows = [['08:00', '09:00', '12:00', '14:00'].map(t), ['17:00', '19:00', '20:00', '21:00'].map(t), [['−15 dk', x('s', -15)], ['−5 dk', x('s', -5)], ['+5 dk', x('s', 5)], ['+15 dk', x('s', 15)]], [['−1 sa', x('s', -60)], ['+1 sa', x('s', 60)], [it.time ? 'Saatsiz' : '✓ Saatsiz', x('t', 'none')], back]];
  } else if (mode === 'rem') {
    const r = ([v, l]) => [(rem.includes(v) ? '✓ ' : '') + l, x('r', v)];
    const g = (every, times, l) => [((it.nag?.every === every && it.nag?.times === times) ? '✓ ' : '') + l, x('g', `${every}x${times}`)];
    const opts = it.time ? REM_OPTS : DAY_OPTS;
    const grid = Array.from({ length: Math.ceil(opts.length / 4) }, (_, i) => opts.slice(i * 4, i * 4 + 4).map(r));
    rows = [...grid, [[rem.length ? 'Hatırlatma yok' : '✓ Hatırlatma yok', x('r', 'none')]],
      [g(10, 3, '🔁 10dk×3'), g(10, 5, '🔁 10dk×5'), g(30, 2, '🔁 30dk×2'), [it.nag ? 'Tekrarsız' : '✓ Tekrarsız', x('g', 'none')]], [back]];
  } else if (mode === 'rep') {
    const cur = it.repeat === 'weekly' ? (it.weekdays.join() === '1,2,3,4,5' ? 'weekdays' : it.weekdays.join() === '6,0' ? 'weekend' : 'weekly') : it.repeat;
    const p = (v, l) => [(cur === v ? '✓ ' : '') + l, x('p', v)];
    rows = [[p('none', 'Tekrar yok'), p('daily', 'Her gün')], [p('weekdays', 'Hafta içi'), p('weekend', 'Hafta sonu')], [p('weekly', 'Her hafta'), p('monthly', 'Her ay'), p('yearly', 'Her yıl')], [back]];
  } else if (mode === 'txt') {
    rows = [[back]];
  } else if (it.bill) {
    rows = [[['✅ Ekle', x('ok')], ['✖️ Vazgeç', x('no')]], [['🕐 Saat', x('time')], ['✏️ Yazı', x('txt')]]];
  } else {
    rows = [[['✅ Ekle', x('ok')], ['✖️ Vazgeç', x('no')]], [['📅 Gün', x('day')], ['🕐 Saat', x('time')], ['🔔 Hatırlat', x('rem')]], [['🔁 Tekrar', x('rep')], ['✏️ Yazı', x('txt')]]];
  }
  return { text: lines.join('\n'), markup: buttons(rows) };
}
