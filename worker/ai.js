// Cloudflare Workers AI: ses → metin (Whisper) ve kuralların anlamadığı cümleler için yedek çözümleme.
import { dayAt, clockAt, weekday, DAY_NAMES, isDate, isTime, fromMin } from '../web/js/core.js';

const TEXT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const VOICE_MODEL = '@cf/openai/whisper-large-v3-turbo';

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function transcribe(env, audio) {
  if (!env.AI) throw Error('Ses çözümleme bağlı değil.');
  const out = await env.AI.run(env.AI_VOICE_MODEL || VOICE_MODEL, {
    audio: toBase64(audio), task: 'transcribe', language: 'tr', vad_filter: true,
    initial_prompt: "Her cuma saat 12'de babaannemi ara. Yarın 09:30'da toplantı, 10 dakika önce hatırlat.",
  });
  return String(out?.text || '').trim();
}

const SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['task', 'event', 'note'] },
    title: { type: 'string' },
    date: { type: 'string' },
    time: { type: 'string' },
    endTime: { type: 'string' },
    repeat: { type: 'string', enum: ['none', 'daily', 'weekly', 'monthly'] },
    weekdays: { type: 'array', items: { type: 'integer' } },
    reminders: { type: 'array', items: { type: 'integer' } },
  },
  required: ['kind', 'title', 'date', 'time', 'repeat', 'weekdays', 'reminders'],
};

// Kural tabanlı sonucu (fallback) bozmadan, yalnız geçerli alanları alır.
export async function aiParse(env, text, { now = Date.now(), tz = 'Europe/Istanbul', fallback } = {}) {
  if (!env.AI) return null;
  const { day, minutes } = clockAt(now, tz);
  const system = [
    'Sen Türkçe bir ajanda asistanısın. Kullanıcının cümlesini tek bir plan kaydına çevir. Sadece JSON döndür.',
    `Bugün ${day} (${DAY_NAMES[weekday(day)]}), saat ${fromMin(minutes)}, saat dilimi ${tz}.`,
    'Alanlar: kind (task: saatsiz iş, event: saatli plan, note: not), title (kısa, emir kipinde, zaman ifadeleri ve "ekle/hatırlat" gibi komutlar olmadan, ilk harf büyük),',
    'date (YYYY-MM-DD; tekrarlarda ilk gerçekleşme; tarih yoksa ""), time ("HH:MM" 24 saat; yoksa ""), endTime (yoksa ""),',
    'repeat (none|daily|weekly|monthly), weekdays (weekly için; 0=Pazar,1=Pazartesi,...,6=Cumartesi), reminders (başlangıçtan kaç dakika önce; söylenmediyse []).',
    'Saat 1-6 arası ve sabah denmediyse öğleden sonra kabul et (3 → 15:00). "Akşam 8" → 20:00. "Her iki haftada bir" desteklenmez: weekly yap.',
  ].join('\n');
  try {
    const res = await env.AI.run(env.AI_TEXT_MODEL || TEXT_MODEL, {
      messages: [{ role: 'system', content: system }, { role: 'user', content: text }],
      response_format: { type: 'json_schema', json_schema: SCHEMA },
      max_tokens: 300, temperature: 0,
    });
    let r = res?.response ?? res;
    if (typeof r === 'string') r = JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1));
    if (!r || typeof r.title !== 'string' || !r.title.trim()) return null;
    const out = { ...(fallback || {}), ai: true };
    out.kind = ['task', 'event', 'note'].includes(r.kind) ? r.kind : 'task';
    out.title = r.title.trim().slice(0, 300);
    out.date = isDate(r.date) ? r.date : '';
    out.time = isTime(r.time) ? r.time : '';
    out.endTime = out.time && isTime(r.endTime) ? r.endTime : '';
    out.repeat = ['none', 'daily', 'weekly', 'monthly'].includes(r.repeat) ? r.repeat : 'none';
    out.weekdays = Array.isArray(r.weekdays) ? [...new Set(r.weekdays.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))] : [];
    if (out.repeat === 'weekly' && !out.weekdays.length) out.repeat = 'none';
    if (out.repeat !== 'none' && !out.date) out.date = day;
    const rem = Array.isArray(r.reminders) ? [...new Set(r.reminders.filter(n => Number.isInteger(n) && n >= 0 && n <= 40320))] : [];
    out.reminders = rem.length ? rem : (fallback?.reminders ?? null);
    out.doubt = [];
    return out;
  } catch {
    return null;
  }
}
