// Telegram Bot API yardımcıları ve mesaj biçimleri.
import { dayAt, dayAdd, itemsOn, summary, repeatLabel, remindersLabel, dayLabel, DAY_NAMES, shortDate, weekday } from '../web/js/core.js';

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
  'Bana yazman ya da <b>sesli mesaj</b> atman yeterli:',
  '• <i>Her cuma 12\'de babaannemi ara</i>',
  '• <i>Yarın 9\'da spor, 10 dk önce hatırlat</i>',
  '• <i>Hafta içi her gün 07:30 ilaç</i>',
  '• <i>not: aklımdaki fikir</i>',
  '• Saatsiz yazarsan yapılacaklara eklerim.',
  '',
  '/bugun · /yarin · /hafta',
].join('\n');

export function reminderMessage(job, now) {
  const left = Math.round((job.start - now) / 60000);
  const when = left <= 0 ? 'şimdi' : left < 60 ? `${left} dk sonra` : left < 1440 ? `${Math.floor(left / 60)} sa${left % 60 ? ' ' + (left % 60) + ' dk' : ''} sonra` : `${Math.round(left / 1440)} gün sonra`;
  return `⏰ <b>${esc(job.title)}</b>\n${job.time} · ${when}`;
}

export function addedMessage(item, today, viaAi) {
  const lines = [`✅ <b>${esc(item.title)}</b>`];
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
