// Telegram Bot API yardımcıları ve mesaj biçimleri.
import { dayAt, dayAdd, itemsOn, summary, repeatLabel, remindersLabel, dayLabel, DAY_NAMES, DAY_SHORT, shortDate, weekday } from '../web/js/core.js';
import { emojiOf } from '../web/js/categories.js';

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
  '• <i>not: aklımdaki fikir</i>',
  '• Saatsiz yazarsan yapılacaklara eklerim.',
  '• Taslak açıkken <i>yarın 10\'da</i> yazarsan taslağı düzeltirim.',
  '',
  '/bugun · /yarin · /hafta',
].join('\n');

export function reminderMessage(job, now) {
  const left = Math.round((job.start - now) / 60000);
  const when = left <= 0 ? 'şimdi' : left < 60 ? `${left} dk sonra` : left < 1440 ? `${Math.floor(left / 60)} sa${left % 60 ? ' ' + (left % 60) + ' dk' : ''} sonra` : `${Math.round(left / 1440)} gün sonra`;
  return `${emojiOf(job) === '•' ? '⏰' : emojiOf(job)} <b>${esc(job.title)}</b>\n${job.time} · ${when}`;
}

export function addedMessage(item, today, viaAi) {
  const lines = [`✅ ${emojiOf(item)} <b>${esc(item.title)}</b>`];
  const when = item.repeat !== 'none' ? repeatLabel(item) : item.date ? dayLabel(item.date, today) : 'Yapılacaklar';
  lines.push([when, item.time ? (item.endTime ? `${item.time}–${item.endTime}` : item.time) : ''].filter(Boolean).join(' · '));
  if (item.time && item.reminders) lines.push('🔔 ' + remindersLabel(item.reminders));
  if (viaAi) lines.push('<i>✨ AI ile anlaşıldı, kontrol et</i>');
  return lines.join('\n');
}

export function dayList(items, day, today, offset = 0) {
  const list = itemsOn(items, day);
  const head = `<b>${esc(dayLabel(day, today))}</b> · ${shortDate(day)} ${DAY_NAMES[weekday(day)]}`;
  if (!list.length) return { text: `${head}\nBoş.`, list };
  const rows = list.map((o, i) => `${o.status === 'done' ? '✓' : `${offset + i + 1}.`} ${o.time ? o.time + ' ' : ''}${o.status === 'done' ? '<s>' + esc(o.title) + '</s>' : esc(o.title)}`);
  return { text: `${head}\n${rows.join('\n')}`, list };
}

export function inboxList(items) {
  const open = items.filter(i => !i.date && i.status === 'pending');
  if (!open.length) return '';
  return '<b>Yapılacaklar</b>\n' + open.slice(0, 15).map(i => '• ' + esc(i.title)).join('\n');
}

export function digestMessage(items, prefs, now) {
  const tz = prefs.timeZone, today = dayAt(now, tz);
  const list = itemsOn(items, today).filter(o => o.status !== 'done');
  const hi = prefs.name ? `Günaydın ${esc(prefs.name)} ☀️` : 'Günaydın ☀️';
  if (!list.length) return `${hi}\nBugün planında bir şey yok.`;
  return `${hi}\n<b>Bugün</b>\n` + list.map(o => `• ${o.time ? o.time + ' ' : ''}${esc(o.title)}`).join('\n');
}

export { summary, dayAdd };

// Düğmeli taslak: main | day | time | rem | rep
const REM_OPTS = [[0, 'Vaktinde'], [1, '1 dk'], [5, '5 dk'], [10, '10 dk'], [15, '15 dk'], [30, '30 dk'], [60, '1 sa'], [1440, '1 gün']];
export function draftView(d, today, mode = 'main', defaults = [10]) {
  const it = d.item, x = (op, arg = '') => `x:${d.id}:${op}${arg !== '' ? ':' + arg : ''}`;
  const when = it.repeat !== 'none' ? repeatLabel(it) : it.date ? `${dayLabel(it.date, today)}${dayLabel(it.date, today).match(/^(Bugün|Yarın|Dün)$/) ? ', ' + shortDate(it.date) : ''}` : 'Tarihsiz (Yapılacaklar)';
  const rem = it.reminders ?? defaults;
  const lines = [];
  if (d.voice) lines.push(`🎙 <i>“${esc(d.voice)}”</i>`, '');
  lines.push(`📝 <b>Taslak</b>`, `${emojiOf(it)} <b>${esc(it.title)}</b>`, `📅 ${esc(when)}`, `🕐 ${it.time ? (it.endTime ? `${it.time}–${it.endTime}` : it.time) : 'Saat yok'}`);
  if (it.time) lines.push(`🔔 ${esc(remindersLabel(rem))}`);
  if (d.ai) lines.push('<i>✨ AI ile anlaşıldı, kontrol et</i>');
  if (mode === 'main') lines.push('', '<i>Düzeltmek için dokun ya da “yarın 10’da” gibi yaz.</i>');
  const back = ['← Geri', x('back')];
  let rows;
  if (mode === 'day') {
    const days = Array.from({ length: 8 }, (_, i) => dayAdd(today, i));
    const label = (dd, i) => (i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : `${DAY_SHORT[weekday(dd)]} ${+dd.slice(8)}`);
    const mark = (dd, l) => (it.repeat === 'none' && it.date === dd ? '✓ ' + l : l);
    rows = [days.slice(0, 4).map((dd, i) => [mark(dd, label(dd, i)), x('d', dd)]), days.slice(4).map((dd, i) => [mark(dd, label(dd, i + 4)), x('d', dd)]), [[it.date ? 'Tarihsiz' : '✓ Tarihsiz', x('d', '')], back]];
  } else if (mode === 'time') {
    const t = v => [(it.time === v ? '✓ ' : '') + v, x('t', v.replace(':', ''))];
    rows = [['08:00', '09:00', '10:00', '12:00'].map(t), ['14:00', '17:00', '19:00', '21:00'].map(t), [['−1 sa', x('s', -60)], ['−15 dk', x('s', -15)], ['+15 dk', x('s', 15)], ['+1 sa', x('s', 60)]], [[it.time ? 'Saatsiz' : '✓ Saatsiz', x('t', 'none')], back]];
  } else if (mode === 'rem') {
    const r = ([v, l]) => [(rem.includes(v) ? '✓ ' : '') + l, x('r', v)];
    rows = [REM_OPTS.slice(0, 4).map(r), REM_OPTS.slice(4).map(r), [[rem.length ? 'Hatırlatma yok' : '✓ Hatırlatma yok', x('r', 'none')], back]];
  } else if (mode === 'rep') {
    const cur = it.repeat === 'weekly' ? (it.weekdays.join() === '1,2,3,4,5' ? 'weekdays' : it.weekdays.join() === '6,0' ? 'weekend' : 'weekly') : it.repeat;
    const p = (v, l) => [(cur === v ? '✓ ' : '') + l, x('p', v)];
    rows = [[p('none', 'Tekrar yok'), p('daily', 'Her gün')], [p('weekdays', 'Hafta içi'), p('weekend', 'Hafta sonu')], [p('weekly', 'Her hafta'), p('monthly', 'Her ay')], [back]];
  } else {
    rows = [[['✅ Ekle', x('ok')], ['✖️ Vazgeç', x('no')]], [['📅 Gün', x('day')], ['🕐 Saat', x('time')], ['🔔 Hatırlat', x('rem')]], [['🔁 Tekrar', x('rep')]]];
  }
  return { text: lines.join('\n'), markup: buttons(rows) };
}
