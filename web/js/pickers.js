// Uygulama içi seçiciler: takvim, saat çarkı, hatırlatma (saniyeye kadar özel), tekrar, ikon.
// Yerel <input type=date/time> iOS'ta yeniden çizimde kendiliğinden kapandığı için kullanılmıyor.
import { dayAdd, weekday, mondayOf, monthDays, daysBetween, pad, MONTHS, DAY_SHORT, remindersLabel } from './core.js';
import { CATS } from './categories.js';
import { icon } from './icons.js';
import { haptic } from './ui.js';

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

// ---------- Hatırlatma ----------
export const REM_PRESETS = [[0, 'Vaktinde'], [1, '1 dk'], [5, '5 dk'], [10, '10 dk'], [15, '15 dk'], [30, '30 dk'], [60, '1 saat'], [120, '2 saat'], [1440, '1 gün']];
const UNITS = { sn: 1 / 60, dk: 1, sa: 60, gün: 1440 };
// Tamamlanmazsa tekrar hatırlat: aralık ve kaç kez
const NAG_EVERY = [[0, 'Kapalı'], [5, '5 dk'], [10, '10 dk'], [15, '15 dk'], [30, '30 dk'], [60, '1 sa']];
const NAG_TIMES = [2, 3, 5, 10];
export function nagHTML(nag) {
  const ev = nag?.every || 0, tm = nag?.times || 3;
  const chip = (attr, v, l, on) => `<button type="button" class="chip ${on ? 'on' : ''}" data-${attr}="${v}">${l}</button>`;
  const evs = NAG_EVERY.some(([v]) => v === ev) ? NAG_EVERY : [...NAG_EVERY, [ev, ev % 60 ? ev + ' dk' : ev / 60 + ' sa']];
  const tms = NAG_TIMES.includes(tm) ? NAG_TIMES : [...NAG_TIMES, tm].sort((a, b) => a - b);
  return `<div class="pk-sub nag-h">${icon('again')}Tamamlanmazsa tekrar hatırlat</div>
    <div class="picker-row">${evs.map(([v, l]) => chip('nag-every', v, l, ev === v)).join('')}</div>
    ${ev ? `<div class="picker-row">${tms.map(n => chip('nag-times', n, n + ' kez', tm === n)).join('')}</div>` : ''}`;
}
export function applyNag(nag, btn) {
  if ('nagEvery' in btn.dataset) { const e = +btn.dataset.nagEvery; return e ? { every: e, times: nag?.times || 3 } : null; }
  if ('nagTimes' in btn.dataset && nag) return { ...nag, times: +btn.dataset.nagTimes };
  return nag || null;
}
export function reminderHTML(list) {
  const presets = REM_PRESETS.map(([v]) => v);
  const extra = list.filter(v => !presets.includes(v)).sort((a, b) => a - b);
  const chip = (v, l) => `<button type="button" class="chip ${list.includes(v) ? 'on' : ''}" data-rem="${v}">${l}</button>`;
  return `<div class="picker-row">${REM_PRESETS.map(([v, l]) => chip(v, l)).join('')}${extra.map(v => chip(v, remindersLabel([v]).replace(' önce', ''))).join('')}
      <button type="button" class="chip ${list.length ? '' : 'on'}" data-rem="none">Yok</button></div>
    <div class="rem-custom" data-u="dk"><span class="rc-l">Özel</span>
      <button type="button" class="rc-b" data-rc="-" aria-label="Azalt">${icon('minus')}</button>
      <input type="number" inputmode="numeric" min="1" max="999" value="20" data-rcv aria-label="Süre">
      <button type="button" class="rc-b" data-rc="+" aria-label="Artır">${icon('plus')}</button>
      <span class="unit-seg">${Object.keys(UNITS).map(u => `<button type="button" data-unit="${u}" aria-pressed="${u === 'dk'}">${u}</button>`).join('')}</span>
      <button type="button" class="rc-add" data-rc="add">Ekle</button></div>`;
}
// Özel satırdaki düğmeleri işler; eklenecek değer (dakika) döner, yoksa null.
export function handleCustom(btn) {
  const box = btn.closest('.rem-custom');
  const input = box.querySelector('[data-rcv]');
  if (btn.dataset.unit) {
    box.dataset.u = btn.dataset.unit;
    box.querySelectorAll('[data-unit]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    haptic();
    return null;
  }
  const v = Math.min(Math.max(parseInt(input.value, 10) || 1, 1), 999);
  if (btn.dataset.rc === '-') { input.value = Math.max(1, v - (v > 10 ? 5 : 1)); haptic(); return null; }
  if (btn.dataset.rc === '+') { input.value = Math.min(999, v + (v >= 10 ? 5 : 1)); haptic(); return null; }
  const minutes = Math.round(v * UNITS[box.dataset.u] * 60) / 60;
  return minutes <= 40320 ? minutes : null;
}
export function toggleReminder(list, value) {
  if (value === 'none') return [];
  const v = Number(value);
  return list.includes(v) ? list.filter(x => x !== v) : [...list, v].sort((a, b) => b - a);
}

// ---------- Tekrar ----------
export function repeatHTML(it) {
  const cur = it.repeat === 'weekly' ? (it.weekdays.join() === '1,2,3,4,5' ? 'weekdays' : it.weekdays.join() === '6,0' ? 'weekend' : 'weekly') : it.repeat;
  const c = (v, l) => `<button type="button" class="chip ${cur === v ? 'on' : ''}" data-rep="${v}">${l}</button>`;
  let html = `<div class="picker-row">${c('none', 'Tekrar yok')}${c('daily', 'Her gün')}${c('weekdays', 'Hafta içi')}${c('weekend', 'Hafta sonu')}${c('weekly', 'Haftalık')}${c('monthly', 'Aylık')}</div>`;
  if (it.repeat === 'weekly') html += `<div class="wdays">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" data-wday="${d}" aria-pressed="${it.weekdays.includes(d)}">${DAY_SHORT[d]}</button>`).join('')}</div>`;
  return html;
}
export function applyRepeat(it, v, today) {
  const start = it.date || today;
  if (v === 'none') return { ...it, repeat: 'none', weekdays: [] };
  if (v === 'daily' || v === 'monthly') return { ...it, date: start, repeat: v, weekdays: [] };
  if (v === 'weekdays') return { ...it, date: start, repeat: 'weekly', weekdays: [1, 2, 3, 4, 5] };
  if (v === 'weekend') return { ...it, date: start, repeat: 'weekly', weekdays: [6, 0] };
  return { ...it, date: start, repeat: 'weekly', weekdays: it.weekdays?.length ? it.weekdays : [weekday(start)] };
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
