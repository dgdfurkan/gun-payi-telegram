// Planım: Gün / Hafta / Ay görünümleri ve satır işlemleri.
import { itemsOn, dayAdd, weekday, mondayOf, monthDays, daysBetween, dayLabel, repeatLabel, remindersLabel, statusOf, patchOccurrence, toMin, clockAt, DAY_SHORT, DAY_NAMES, MONTHS, pad } from './core.js';
import { get, commit } from './store.js';
import { icon } from './icons.js';
import { esc, haptic, toast } from './ui.js';
import { ctx, today, tz } from './ctx.js';
import { sync } from './api.js';

const fullDate = d => { const [, m, dd] = d.split('-').map(Number); return `${dd} ${MONTHS[m - 1]} ${DAY_NAMES[weekday(d)]}`; };

export function itemRow(o, t, { showDate = false } = {}) {
  const s = get();
  const done = o.status === 'done';
  const meta = [];
  if (showDate && o.date) meta.push(`<span>${icon('cal')}${esc(dayLabel(o.date, t))}</span>`);
  if (o.repeat !== 'none') meta.push(`<span>${icon('repeat')}${esc(repeatLabel(o))}</span>`);
  if (o.time) {
    const rem = o.reminders ?? s.prefs.reminderDefaults;
    if (rem.length) meta.push(`<span>${icon('bell')}${esc(remindersLabel(rem))}</span>`);
  }
  if (o.note) meta.push(`<span>${icon('notes')}Not</span>`);
  let cls = done ? 'done' : '';
  if (o.date === t && o.time && !done) {
    const now = clockAt(Date.now(), tz()).minutes, start = toMin(o.time), end = o.endTime ? toMin(o.endTime) : start + 30;
    if (now >= start && now < (end > start ? end : end + 1440)) cls += ' now';
    else if (now >= (end > start ? end : start + 30)) cls += ' past';
  }
  if (ctx.pop === `${o.id}:${o.origin || ''}`) cls += ' pop';
  if (ctx.enter === o.id) cls += ' enter';
  return `<div class="item ${cls}" data-act="open" data-id="${esc(o.id)}" data-origin="${esc(o.origin || '')}">
    <button type="button" class="check" data-act="toggle" data-id="${esc(o.id)}" data-origin="${esc(o.origin || '')}" aria-label="${done ? 'Geri al' : 'Tamamla'}">${icon('check')}</button>
    <div class="item-main"><div class="item-title">${esc(o.title)}</div>${meta.length ? `<div class="item-meta">${meta.join('')}</div>` : ''}</div>
    ${o.time ? `<div class="item-time">${o.time}${o.endTime ? `<small>${o.endTime}</small>` : ''}</div>` : ''}
  </div>`;
}

function strip(sel, t) {
  const s = get();
  const mon = mondayOf(sel);
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = dayAdd(mon, i);
    const has = itemsOn(s.items, d).length > 0;
    html += `<button type="button" class="day ${d === sel ? 'sel' : ''} ${d === t ? 'today' : ''} ${has ? 'has' : ''}" data-act="pick-day" data-day="${d}" aria-label="${fullDate(d)}">
      <span class="dn">${DAY_SHORT[weekday(d)]}</span><span class="dd">${+d.slice(8)}</span><span class="dot"></span></button>`;
  }
  return `<div class="strip-wrap"><button type="button" data-act="shift" data-n="-7" aria-label="Önceki hafta">${icon('chevL')}</button><div class="strip" data-swipe="week">${html}</div><button type="button" data-act="shift" data-n="7" aria-label="Sonraki hafta">${icon('chevR')}</button></div>`;
}

function dayBody(day, t) {
  const s = get();
  const list = itemsOn(s.items, day);
  let html = '';
  if (list.length) html += `<div class="list">${list.map(o => itemRow(o, t)).join('')}</div>`;
  const inbox = day === t ? s.items.filter(i => !i.date && (i.status === 'pending' || ctx.pop === `${i.id}:`)) : [];
  if (!list.length && !inbox.length) {
    html += `<div class="empty">${icon(day === t ? 'sun' : 'cal')}<b>${day === t ? 'Bugün boş' : 'Plan yok'}</b>${day === t ? 'Güne yer açık.' : esc(fullDate(day))}<br><button type="button" data-act="add" data-day="${day}">+ Plan ekle</button></div>`;
  }
  if (inbox.length) {
    html += `<div class="section-h big">Yapılacaklar<small style="font-size:15px;color:var(--label-2);font-weight:400">${inbox.length}</small></div>`;
    html += `<div class="list">${inbox.map(i => itemRow({ ...i, origin: '' }, t)).join('')}</div>`;
  }
  return html;
}

function weekBody(sel, t) {
  const s = get();
  const mon = mondayOf(sel);
  let html = `<div class="month-h"><b>${+mon.slice(8)} ${MONTHS[+mon.slice(5, 7) - 1].slice(0, 3)} – ${+dayAdd(mon, 6).slice(8)} ${MONTHS[+dayAdd(mon, 6).slice(5, 7) - 1].slice(0, 3)}</b><div><button type="button" data-act="shift" data-n="-7" aria-label="Önceki hafta">${icon('chevL')}</button><button type="button" data-act="shift" data-n="7" aria-label="Sonraki hafta">${icon('chevR')}</button></div></div>`;
  for (let i = 0; i < 7; i++) {
    const d = dayAdd(mon, i);
    const list = itemsOn(s.items, d);
    html += `<div class="wday"><div class="wday-h ${d === t ? 'today' : ''}">${DAY_NAMES[weekday(d)]}<small>${+d.slice(8)} ${MONTHS[+d.slice(5, 7) - 1]}${d === t ? ' · Bugün' : ''}</small></div>`;
    html += list.length ? `<div class="list">${list.map(o => itemRow(o, t)).join('')}</div>` : `<button type="button" class="wday-empty" data-act="add" data-day="${d}" style="width:calc(100% - 32px);text-align:left">Boş · ekle</button>`;
    html += '</div>';
  }
  return html;
}

function monthBody(sel, t) {
  const s = get();
  const [y, m] = (ctx.month || sel.slice(0, 7)).split('-').map(Number);
  const first = `${y}-${pad(m)}-01`;
  const start = mondayOf(first);
  const days = monthDays(y, m - 1);
  const cells = Math.ceil((daysBetween(start, first) + days) / 7) * 7;
  let grid = DAY_SHORT.slice(1).concat(DAY_SHORT[0]).map(d => `<div class="wd">${d}</div>`).join('');
  for (let i = 0; i < cells; i++) {
    const d = dayAdd(start, i);
    const out = d.slice(0, 7) !== first.slice(0, 7);
    const has = !out && itemsOn(s.items, d).length > 0;
    grid += `<button type="button" class="day ${out ? 'out' : ''} ${d === sel ? 'sel' : ''} ${d === t ? 'today' : ''} ${has ? 'has' : ''}" data-act="pick-day" data-day="${d}"><span class="dd">${+d.slice(8)}</span><span class="dot"></span></button>`;
  }
  return `<div class="month-h"><b>${MONTHS[m - 1]} ${y}</b><div><button type="button" data-act="month" data-n="-1" aria-label="Önceki ay">${icon('chevL')}</button><button type="button" data-act="month" data-n="1" aria-label="Sonraki ay">${icon('chevR')}</button></div></div>
    <div class="mgrid" data-swipe="month">${grid}</div>
    <div class="section-h">${esc(dayLabel(sel, t))} · ${esc(fullDate(sel))}</div>${dayBody(sel, t)}`;
}

export function renderPlan() {
  const t = today();
  if (!ctx.day) ctx.day = t;
  const sel = ctx.day;
  const title = ctx.mode === 'day' ? dayLabel(sel, t) : ctx.mode === 'week' ? 'Bu hafta' : 'Takvim';
  const weekTitle = ctx.mode === 'week' && mondayOf(sel) !== mondayOf(t) ? (daysBetween(mondayOf(t), mondayOf(sel)) === 7 ? 'Gelecek hafta' : daysBetween(mondayOf(t), mondayOf(sel)) === -7 ? 'Geçen hafta' : 'Hafta') : title;
  const sub = ctx.mode === 'day' ? fullDate(sel) : greeting();
  const seg = ['day', 'week', 'month'].map(m => `<button type="button" data-act="mode" data-mode="${m}" aria-pressed="${ctx.mode === m}">${{ day: 'Gün', week: 'Hafta', month: 'Ay' }[m]}</button>`).join('');
  const off = sel !== t;
  let body = '';
  if (ctx.mode === 'day') body = strip(sel, t) + dayBody(sel, t);
  else if (ctx.mode === 'week') body = weekBody(sel, t);
  else body = monthBody(sel, t);
  return `<div class="topbar">${off ? `<button type="button" class="bar-btn l" data-act="today" style="font-size:17px;padding:0 6px">Bugün</button>` : ''}<h2>${esc(weekTitle)}</h2></div>
    <div class="page"><div class="large"><h1>${esc(weekTitle)}</h1><p>${esc(sub)}</p></div>
    <div class="seg" role="group" aria-label="Görünüm">${seg}</div>${body}</div>`;
}

function greeting() {
  const h = clockAt(Date.now(), tz()).minutes / 60;
  const name = get().prefs.name;
  const g = h < 5 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
  return name ? `${g}, ${name}` : g;
}

// --- işlemler ---
export const planActs = {
  mode: el => { ctx.mode = el.dataset.mode; if (ctx.mode === 'month') ctx.month = ctx.day.slice(0, 7); haptic(); commit(s => { s.prefs.plannerMode = ctx.mode; }); },
  'pick-day': el => {
    ctx.day = el.dataset.day;
    if (ctx.mode === 'month' && el.classList.contains('out')) ctx.month = ctx.day.slice(0, 7);
    haptic();
    ctx.render();
  },
  shift: el => { ctx.day = dayAdd(ctx.day, +el.dataset.n); ctx.render(); },
  month: el => {
    let [y, m] = (ctx.month || ctx.day.slice(0, 7)).split('-').map(Number);
    m += +el.dataset.n; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    ctx.month = `${y}-${pad(m)}`;
    ctx.day = `${ctx.month}-01` <= today() && today().startsWith(ctx.month) ? today() : `${ctx.month}-01`;
    ctx.render();
  },
  today: () => { ctx.day = today(); ctx.month = ctx.day.slice(0, 7); haptic(); ctx.render(); },
  toggle: async el => {
    const { id, origin } = el.dataset;
    const item = get().items.find(i => i.id === id);
    if (!item) return;
    const was = statusOf(item, origin || item.date);
    const next = was === 'done' ? 'pending' : 'done';
    haptic(next === 'done' ? 'success' : 'light');
    ctx.pop = next === 'done' ? `${id}:${origin}` : null;
    const row = el.closest('.item');
    row?.classList.toggle('done', next === 'done');
    row?.classList.toggle('pop', next === 'done');
    await commit(s => {
      const i = s.items.findIndex(x => x.id === id);
      s.items[i] = item.date ? patchOccurrence(s.items[i], origin || item.date, { status: next }) : { ...s.items[i], status: next, updatedAt: new Date().toISOString() };
    });
    if (!item.date && next === 'done') {
      toast('Tamamlandı', { label: 'Geri al', run: () => commit(s => { const i = s.items.findIndex(x => x.id === id); if (i >= 0) s.items[i].status = 'pending'; }) });
    }
    setTimeout(() => { if (ctx.pop === `${id}:${origin}`) { ctx.pop = null; if (!item.date) ctx.render(); } }, 900);
    sync();
  },
};

// Hafta şeridinde / ay ızgarasında yatay kaydırma.
export function bindSwipe(view) {
  let x0 = null, y0 = 0, kind = '';
  view.addEventListener('touchstart', e => {
    const s = e.target.closest('[data-swipe]');
    if (!s) return;
    kind = s.dataset.swipe; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  view.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
    const dir = dx < 0 ? 1 : -1;
    if (kind === 'week') planActs.shift({ dataset: { n: String(7 * dir) } });
    else planActs.month({ dataset: { n: String(dir) } });
    haptic();
  });
}
