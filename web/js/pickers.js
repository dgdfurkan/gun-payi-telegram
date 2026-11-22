// Uygulama içi seçiciler: takvim, saat çarkı, hatırlatma (saniyeye kadar özel), tekrar, ikon.
// Yerel <input type=date/time> iOS'ta yeniden çizimde kendiliğinden kapandığı için kullanılmıyor.
import { dayAdd, weekday, mondayOf, monthDays, daysBetween, pad, MONTHS, DAY_SHORT, remindersLabel, readRem, sortRems, durationLabel, whenAt } from './core.js';
import { CATS } from './categories.js';
import { icon } from './icons.js';
import { haptic, esc, toast } from './ui.js';

// ---------- Takvim ----------
export function calendarHTML(sel, month, today) {
  const [y, m] = (month || sel || today).slice(0, 7).split('-').map(Number);
  const first = `${y}-${pad(m)}-01`, start = mondayOf(first);
  const cells = Math.ceil((daysBetween(start, first) + monthDays(y, m - 1)) / 7) * 7;
  let grid = [1, 2, 3, 4, 5, 6, 0].map(d => `<span class="cal-wd">${DAY_SHORT[d]}</span>`).join('');
  for (let i = 0; i < cells; i++) {
    const d = dayAdd(start, i);
    const cls = [d.slice(0, 7) !== first.slice(0, 7) && 'out', d === sel && 'sel', d === today && 'today', d < today && 'past'].filter(Boolean).join(' ');
    grid += `<button type="button" class="cal-d ${cls}" data-cal-day="${d}">${+d.slice(8)}</button>`;
  }
  return `<div class="cal" data-cal-month="${first.slice(0, 7)}"><div class="cal-h"><b>${MONTHS[m - 1]} ${y}</b><span>
    <button type="button" data-cal-nav="-1" aria-label="Önceki ay">${icon('chevL')}</button><button type="button" data-cal-nav="1" aria-label="Sonraki ay">${icon('chevR')}</button></span></div>
    <div class="cal-g">${grid}</div></div>`;
}
export function shiftMonth(month, n) {
  let [y, m] = month.split('-').map(Number);
  m += n; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
  return `${y}-${pad(m)}`;
}
export function quickDays(sel, today) {
  const sat = dayAdd(today, (6 - weekday(today) + 7) % 7 || 7);
  const opts = [['Bugün', today], ['Yarın', dayAdd(today, 1)], ['Hafta sonu', sat], ['Gelecek hafta', dayAdd(mondayOf(today), 7)]];
  return opts.map(([l, d]) => `<button type="button" class="chip ${sel === d ? 'on' : ''}" data-date="${d}">${l}</button>`).join('');
}

// ---------- Saat çarkı ----------
const ROW = 40;
export function wheelHTML(time) {
  const [h, m] = time ? time.split(':').map(Number) : [9, 0];
  const col = (n, cur, key) => `<div class="wcol" data-wcol="${key}" data-val="${cur}">${Array.from({ length: n }, (_, i) => `<div class="witem${i === cur ? ' on' : ''}">${pad(i)}</div>`).join('')}</div>`;
  return `<div class="wheel">${col(24, h, 'h')}<span class="wsep">:</span>${col(60, m, 'm')}</div>`;
}
export function bindWheel(root, onChange) {
  const cols = [...root.querySelectorAll('.wcol')];
  if (!cols.length) return;
  const read = () => cols.map((c, k) => pad(Math.min(Math.max(Math.round(c.scrollTop / ROW), 0), k ? 59 : 23))).join(':');
  let lastTick = 0;
  requestAnimationFrame(() => {
    for (const c of cols) {
      c.scrollTop = Number(c.dataset.val) * ROW;
      let timer, last = Number(c.dataset.val);
      c.addEventListener('scroll', () => {
        const i = Math.round(c.scrollTop / ROW);
        if (i !== last) {
          last = i;
          c.querySelector('.witem.on')?.classList.remove('on');
          c.children[i]?.classList.add('on');
          const now = Date.now();
          if (now - lastTick > 70) { lastTick = now; haptic(); }
        }
        clearTimeout(timer);
        timer = setTimeout(() => onChange(read()), 140);
      }, { passive: true });
      c.addEventListener('click', e => {
        const it = e.target.closest('.witem');
        if (it) c.scrollTo({ top: [...c.children].indexOf(it) * ROW, behavior: 'smooth' });
      });
    }
  });
}

// ---------- Sayı alanı ----------
// Hazır seçenekler kısayoldur; her alana istenen sayı yazılabilir.
const numInput = (attr, value, label, max = 999999) => `<input type="number" inputmode="numeric" min="1" max="${max}" value="${value}" ${attr} aria-label="${label}">`;
const unitSeg = (units, cur) => `<span class="unit-seg">${units.map(u => `<button type="button" data-unit="${u}" aria-pressed="${u === cur}">${u}</button>`).join('')}</span>`;
export function pressUnit(btn) {
  const box = btn.closest('.rem-custom');
  box.dataset.u = btn.dataset.unit;
  box.querySelectorAll('[data-unit]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
  haptic();
}
// Hep birer birer; hız basılı tutmaktan gelir.
export function stepValue(value, dir, min = 1, max = 999999) {
  const v = parseInt(value, 10);
  return Math.min(max, Math.max(min, (Number.isNaN(v) ? min : v) + dir));
}
let buzzedAt = 0;
export function stepInput(input, dir) {
  const next = String(stepValue(input.value, dir, 1, +input.max || 999999));
  if (next === input.value) return;
  input.value = next;
  if (Date.now() - buzzedAt > 70) { buzzedAt = Date.now(); haptic(); }
}
// Basılı tutunca hızlanarak sayar. Dokunup bırakmak normal tıklamadır (tek adım).
export const holdDelay = n => Math.max(22, Math.round(140 * 0.88 ** n));
export function bindHold() {
  let timer = null, held = null, skipUntil = 0;
  const stop = () => {
    clearTimeout(timer);
    timer = null;
    if (!held) return;
    skipUntil = Date.now() + 700;
    // Değeri duruma yazan 'change' dinleyicileri sayım bitince bir kez çalışır
    held.input.dispatchEvent(new Event('change', { bubbles: true }));
    held = null;
  };
  document.addEventListener('pointerdown', e => {
    stop();
    skipUntil = 0;
    const btn = e.target.closest?.('.rc-b');
    const input = btn?.closest('.rem-custom')?.querySelector('input');
    if (!input) return;
    const dir = ['-', '-1'].includes(btn.dataset.rc || btn.dataset.int || btn.dataset.step) ? -1 : 1;
    let n = 0;
    const tick = () => {
      if (!btn.isConnected) { held = null; return; }
      held = { btn, input };
      stepInput(input, dir);
      timer = setTimeout(tick, holdDelay(n++));
    };
    timer = setTimeout(tick, 380);
  }, true);
  for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, stop, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('blur', stop);
  // Parmağı kaldırınca gelen tıklama bir adım daha saymasın
  // (Düğme 'change' sırasında yeniden çizilmiş olabilir; kimliğine değil türüne bakılır)
  document.addEventListener('click', e => {
    if (Date.now() > skipUntil) return;
    skipUntil = 0;
    if (e.target.closest?.('.rc-b')) { e.stopPropagation(); e.preventDefault(); }
  }, true);
  document.addEventListener('contextmenu', e => { if (e.target.closest?.('.rc-b')) e.preventDefault(); });
}

// ---------- Hatırlatma ----------
const REM_PRESETS = [[0, 'Vaktinde'], [1, '1 dk'], [5, '5 dk'], [10, '10 dk'], [15, '15 dk'], [30, '30 dk'], [60, '1 saat'], [120, '2 saat'], [1440, '1 gün'], [4320, '3 gün'], [10080, '1 hafta'], ['M1', '1 ay']];
const DAY_PRESETS = [[0, 'Aynı gün'], [1440, '1 gün'], [4320, '3 gün'], [10080, '1 hafta'], [20160, '2 hafta'], ['M1', '1 ay'], ['M2', '2 ay'], ['M12', '1 yıl']];
const UNITS = { dk: 1, sa: 60, gün: 1440 };
export function reminderHTML(list, { allDay = false, at = '' } = {}) {
  const base = allDay ? DAY_PRESETS : REM_PRESETS, known = base.map(([v]) => v);
  const extra = sortRems(list.filter(v => !known.includes(v))).reverse();
  const chip = (v, l) => `<button type="button" class="chip ${list.includes(v) ? 'on' : ''}" data-rem="${v}">${l}</button>`;
  const u = allDay ? 'gün' : 'dk';
  return `${allDay && at ? `<p class="pk-note">Saatsiz planda hatırlatma saati ${at}. Ayarlar’dan değiştirebilirsin.</p>` : ''}
    <div class="picker-row">${base.map(([v, l]) => chip(v, l)).join('')}${extra.map(v => chip(v, remindersLabel([v], allDay).replace(' önce', ''))).join('')}
      <button type="button" class="chip ${list.length ? '' : 'on'}" data-rem="none">Yok</button></div>
    <div class="rem-custom" data-u="${u}" data-custom="rem"><span class="rc-l">Özel</span>
      <button type="button" class="rc-b" data-rc="-" aria-label="Azalt">${icon('minus')}</button>
      ${numInput('data-rcv', allDay ? 28 : 20, 'Süre')}
      <button type="button" class="rc-b" data-rc="+" aria-label="Artır">${icon('plus')}</button>
      <button type="button" class="rc-add" data-rc="add">Ekle</button>
      ${unitSeg(Object.keys(UNITS), u)}</div>`;
}
function customValue(box) {
  const n = parseInt(box.querySelector('[data-rcv]').value, 10), unit = UNITS[box.dataset.u];
  if (!(n >= 1)) return null;
  return readRem(n * unit);
}
// Özel satırdaki düğmeleri işler; eklenecek değer döner, yoksa null.
export function handleCustom(btn) {
  const box = btn.closest('.rem-custom');
  if (btn.dataset.unit) { pressUnit(btn); return null; }
  if (btn.dataset.rc !== 'add') { stepInput(box.querySelector('[data-rcv]'), btn.dataset.rc === '+' ? 1 : -1); return null; }
  const v = customValue(box);
  if (v === null) toast('Geçerli bir süre yaz.');
  return v;
}
// Sayıyı yazıp "Ekle"ye basmadan kaydedene: yazdığı süre kaybolmasın.
export function withTypedReminder(root, list) {
  const box = root.querySelector('[data-custom="rem"]'), input = box?.querySelector('[data-rcv]');
  if (!input || input.value === input.defaultValue) return null;
  const v = customValue(box);
  return v === null || list.includes(v) ? null : sortRems([...list, v]);
}
export function toggleReminder(list, value) {
  if (value === 'none') return [];
  const v = readRem(value);
  return list.includes(v) ? list.filter(x => x !== v) : sortRems([...list, v]);
}

// ---------- Tamamlanmazsa tekrar ----------
const NAG_EVERY = [[0, 'Kapalı'], [5, '5 dk'], [10, '10 dk'], [15, '15 dk'], [30, '30 dk'], [60, '1 sa']];
const NAG_TIMES = [2, 3, 5, 10];
export function nagHTML(nag) {
  const ev = nag?.every || 0, tm = nag?.times || 3;
  const chip = (attr, v, l, on) => `<button type="button" class="chip ${on ? 'on' : ''}" data-${attr}="${v}">${l}</button>`;
  const evs = NAG_EVERY.some(([v]) => v === ev) ? NAG_EVERY : [...NAG_EVERY, [ev, durationLabel(ev)]];
  const tms = NAG_TIMES.includes(tm) ? NAG_TIMES : [...NAG_TIMES, tm].sort((a, b) => a - b);
  const u = ev && ev % 1440 === 0 ? 'gün' : ev && ev % 60 === 0 ? 'sa' : 'dk';
  return `<div class="pk-sub nag-h">${icon('again')}Tamamlanmazsa tekrar hatırlat</div>
    <div class="picker-row">${evs.map(([v, l]) => chip('nag-every', v, l, ev === v)).join('')}</div>
    ${ev ? `<div class="picker-row">${tms.map(n => chip('nag-times', n, n + ' kez', tm === n)).join('')}</div>
    <div class="rem-custom" data-u="${u}"><span class="rc-l">Özel</span>
      ${numInput('data-nag-n', ev / UNITS[u], 'Kaçta bir')}<span class="rc-l">×</span>${numInput('data-nag-t', tm, 'Kaç kez')}
      <button type="button" class="rc-add" data-nag-set>Uygula</button>${unitSeg(Object.keys(UNITS), u)}</div>` : ''}`;
}
export function applyNag(nag, btn) {
  if ('nagEvery' in btn.dataset) { const e = +btn.dataset.nagEvery; return e ? { every: e, times: nag?.times || 3 } : null; }
  if ('nagTimes' in btn.dataset && nag) return { ...nag, times: +btn.dataset.nagTimes };
  if ('nagSet' in btn.dataset) {
    const box = btn.closest('.rem-custom');
    const every = parseInt(box.querySelector('[data-nag-n]').value, 10) * UNITS[box.dataset.u], times = parseInt(box.querySelector('[data-nag-t]').value, 10);
    if (every >= 1 && every <= 525600 && times >= 1 && times <= 1000) return { every, times };
    toast('En fazla 1 yılda bir, 1000 kez olabilir.');
  }
  return nag || null;
}
export const isNagButton = b => 'nagEvery' in b.dataset || 'nagTimes' in b.dataset || 'nagSet' in b.dataset;

// ---------- Ertele ----------
export const SNOOZE_PRESETS = [[10, '10 dk'], [20, '20 dk'], [30, '30 dk'], [60, '1 saat'], [120, '2 saat'], [1440, 'Yarın']];
export function snoozeHTML(active, typed = '') {
  return `<div class="picker-row snz">${SNOOZE_PRESETS.map(([v, l]) => `<button type="button" class="chip" data-sz="${v}">${l}</button>`).join('')}</div>
    <div class="snz-field"><input type="text" data-szv value="${esc(typed)}" placeholder="Süre yaz: 45 dk, 3 saat, 1 gün" aria-label="Erteleme süresi" autocomplete="off" autocapitalize="off" enterkeyhint="done">
      <button type="button" class="rc-add" data-sz="typed" disabled>Ertele</button></div>
    <p class="snz-when" aria-live="polite">Şu andan itibaren sayılır.</p>
    ${active ? '<button type="button" class="chip snz-clear" data-sz="clear">Ertelemeyi kaldır</button>' : ''}`;
}
export function paintSnooze(input, until, tz, today) {
  const root = input.closest('.exp');
  root.querySelector('[data-sz="typed"]').disabled = !until;
  const when = root.querySelector('.snz-when');
  when.classList.toggle('ok', Boolean(until));
  when.textContent = until ? `Hatırlatma: ${whenAt(until, tz, today)}` : input.value.trim() ? 'Örnek: 42 dk, 1 gün 5 saat, 21:30' : 'Şu andan itibaren sayılır.';
}

// ---------- Tekrar ----------
export function repeatHTML(it) {
  const cur = it.repeat === 'weekly' ? (it.weekdays.join() === '1,2,3,4,5' ? 'weekdays' : it.weekdays.join() === '6,0' ? 'weekend' : 'weekly') : it.repeat;
  const c = (v, l) => `<button type="button" class="chip ${cur === v ? 'on' : ''}" data-rep="${v}">${l}</button>`;
  let html = `<div class="picker-row">${c('none', 'Tekrar yok')}${c('daily', 'Her gün')}${c('weekdays', 'Hafta içi')}${c('weekend', 'Hafta sonu')}${c('weekly', 'Haftalık')}${c('monthly', 'Aylık')}${c('yearly', 'Yıllık')}</div>`;
  if (it.repeat === 'weekly') html += `<div class="wdays">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" data-wday="${d}" aria-pressed="${it.weekdays.includes(d)}">${DAY_SHORT[d]}</button>`).join('')}</div>`;
  if (it.repeat !== 'none') html += intervalHTML(it.interval || 1, { daily: 'günde', weekly: 'haftada', monthly: 'ayda', yearly: 'yılda' }[it.repeat]);
  return html;
}
export const intervalHTML = (n, unit) => `<div class="rem-custom int-row"><span class="rc-l">Sıklık</span>
  <button type="button" class="rc-b" data-int="-1" aria-label="Azalt">${icon('minus')}</button>${numInput('data-intv', n, 'Tekrar aralığı', 999)}
  <button type="button" class="rc-b" data-int="1" aria-label="Artır">${icon('plus')}</button><span class="rc-l">${unit} bir</span></div>`;
export const intervalOf = (v, step = 0) => stepValue(v, Number(step), 1, 999);
export function applyRepeat(it, v, today) {
  const start = it.date || today;
  if (v === 'none') return { ...it, repeat: 'none', interval: 1, weekdays: [] };
  if (v === 'daily' || v === 'monthly' || v === 'yearly') return { ...it, date: start, repeat: v, interval: it.repeat === v ? it.interval || 1 : 1, weekdays: [] };
  if (v === 'weekdays') return { ...it, date: start, repeat: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] };
  if (v === 'weekend') return { ...it, date: start, repeat: 'weekly', interval: 1, weekdays: [6, 0] };
  return { ...it, date: start, repeat: 'weekly', interval: it.repeat === 'weekly' ? it.interval || 1 : 1, weekdays: it.weekdays?.length ? it.weekdays : [weekday(start)] };
}
export function toggleWeekday(it, d) {
  const set = new Set(it.weekdays);
  set.has(d) ? set.delete(d) : set.add(d);
  return set.size ? { ...it, weekdays: [...set] } : it;
}

// ---------- İkon ----------
export const tile = (key, cls = '') => {
  const c = CATS[key];
  return c ? `<span class="tile ${cls}" style="--c:${c.color}">${icon(c.glyph)}</span>` : `<span class="tile plain ${cls}">${icon('dot')}</span>`;
};
export function iconGridHTML(selected, auto) {
  return `<div class="ico-grid"><button type="button" class="ico ${selected ? '' : 'on'}" data-ico="">${tile(auto)}<span>Otomatik</span></button>
    ${Object.entries(CATS).map(([k, c]) => `<button type="button" class="ico ${selected === k ? 'on' : ''}" data-ico="${k}">${tile(k)}<span>${c.label}</span></button>`).join('')}</div>`;
}
