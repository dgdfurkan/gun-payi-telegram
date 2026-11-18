// Planım: Gün / Hafta / Ay görünümleri ve satır işlemleri.
import { itemsOn, dayAdd, weekday, mondayOf, monthDays, daysBetween, dayLabel, repeatLabel, remindersLabel, statusOf, patchOccurrence, toMin, clockAt, DAY_SHORT, DAY_NAMES, MONTHS, pad } from './core.js';
import { get, commit } from './store.js';
import { icon } from './icons.js';
import { esc, haptic, toast } from './ui.js';
import { ctx, today, tz } from './ctx.js';
import { sync } from './api.js';
import { catOf, CATS } from './categories.js';
import { tile } from './pickers.js';
import { appbar, hero, statusChip } from './chrome.js';

const fullDate = d => { const [, m, dd] = d.split('-').map(Number); return `${dd} ${MONTHS[m - 1]} ${DAY_NAMES[weekday(d)]}`; };
const STARTERS = [['Kısa yürüyüş', 'run', 'Bugün 18:00 kısa yürüyüş'], ['Kitap oku', 'book', 'Bugün 21:00 kitap oku'], ['Su iç', 'drop', 'Her gün 10:00 su iç'], ['Ailemi ara', 'phone', 'Bugün 20:00 ailemi ara']];
function isoWeek(day) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - y) / 86400000 - 3 + ((y.getUTCDay() + 6) % 7)) / 7);
}

export function itemRow(o, t, { stripe = false } = {}) {
  const s = get();
  const done = o.status === 'done';
  const key = catOf(o);
  const tags = [];
  if (o.time) {
    const rem = o.reminders ?? s.prefs.reminderDefaults;
    if (rem.length) tags.push(`<span class="tag">${icon('bell')}${esc(remindersLabel(rem))}</span>`);
  }
  if (o.repeat !== 'none') tags.push(`<span class="tag">${icon('repeat')}${esc(repeatLabel(o))}</span>`);
  if (o.note) tags.push(`<span class="tag">${icon('notes')}Not</span>`);
  let cls = done ? 'done' : '';
  if (o.date === t && o.time && !done) {
    const now = clockAt(Date.now(), tz()).minutes, start = toMin(o.time), end = o.endTime ? toMin(o.endTime) : start + 30;
    if (now >= start && now < (end > start ? end : end + 1440)) cls += ' now';
    else if (now >= (end > start ? end : start + 30)) cls += ' past';
  }
  if (ctx.pop === `${o.id}:${o.origin || ''}`) cls += ' pop';
  if (ctx.enter === o.id) cls += ' enter';
  if (stripe) cls += ' stripe';
  const color = CATS[key]?.color;
  return `<div class="task ${cls}" ${color ? `style="--c:${color}"` : ''} data-act="open" data-id="${esc(o.id)}" data-origin="${esc(o.origin || '')}">
    <button type="button" class="check" data-act="toggle" data-id="${esc(o.id)}" data-origin="${esc(o.origin || '')}" aria-label="${done ? 'Geri al' : 'Tamamla'}">${icon('check')}</button>
    ${tile(key)}
    <div class="task-main"><div class="task-title">${esc(o.title)}</div>${tags.length ? `<div class="tags">${tags.join('')}</div>` : ''}</div>
    ${o.time ? `<span class="time-pill">${o.time}${o.endTime ? `<small>${o.endTime}</small>` : ''}</span>` : ''}
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

function emptyDay(day, t) {
  const isToday = day === t;
  return `<div class="empty-hero"><i class="aura a1"></i><i class="aura a2"></i>
      <div class="sun"><span>${icon(isToday ? 'sun' : 'cal')}</span></div>
      <h3>${isToday ? 'Bugün boş' : 'Plan yok'}</h3>
      <p>${isToday ? 'Güne yer açık. Rahatla ya da yeni bir plan ekle.' : esc(fullDate(day)) + ' için henüz bir şey yok.'}</p>
      <button type="button" class="pill-primary" data-act="add" data-day="${day}">${icon('plus')}Plan ekle</button></div>
    <div class="starters"><span class="kicker">Hızlı başla</span><div class="chips-row">${STARTERS.map(([l, g, txt]) => `<button type="button" class="starter" data-act="add" data-text="${esc(txt)}">${icon(g)}${l}</button>`).join('')}</div></div>`;
}

function dayBody(day, t) {
  const s = get();
  const list = itemsOn(s.items, day);
  const inbox = day === t ? s.items.filter(i => !i.date && (i.status === 'pending' || ctx.pop === `${i.id}:`)) : [];
  let html = '';
  if (list.length) {
    const done = list.filter(o => o.status === 'done').length;
    html += `<div class="progress"><div class="progress-h"><span>Günlük ilerleme</span><b>${done} / ${list.length} tamamlandı</b></div><div class="track"><i style="width:${Math.round((done / list.length) * 100)}%"></i></div></div>
      <div class="sec-h"><h3>Planlar</h3><span>${list.length} plan</span></div>
      <div class="tasks">${list.map(o => itemRow(o, t)).join('')}</div>`;
  }
  if (!list.length && !inbox.length) html += emptyDay(day, t);
  if (inbox.length) html += `<div class="sec-h"><h3>Yapılacaklar</h3><span>${inbox.length} iş</span></div><div class="tasks">${inbox.map(i => itemRow({ ...i, origin: '' }, t)).join('')}</div>`;
  return html;
}

function weekBody(sel, t) {
  const s = get();
  const mon = mondayOf(sel), sun = dayAdd(mon, 6);
  let html = `<div class="week-nav"><b>${+mon.slice(8)} ${MONTHS[+mon.slice(5, 7) - 1]} – ${+sun.slice(8)} ${MONTHS[+sun.slice(5, 7) - 1]}</b><div class="round-nav"><button type="button" data-act="shift" data-n="-7" aria-label="Önceki hafta">${icon('chevL')}</button><button type="button" data-act="shift" data-n="7" aria-label="Sonraki hafta">${icon('chevR')}</button></div></div>`;
  for (let i = 0; i < 7; i++) {
    const d = dayAdd(mon, i);
    const list = itemsOn(s.items, d);
    html += `<div class="wday"><div class="wday-h ${d === t ? 'today' : ''}">${DAY_NAMES[weekday(d)]}<small>${+d.slice(8)} ${MONTHS[+d.slice(5, 7) - 1]}${d === t ? ' · Bugün' : ''}</small></div>`;
    html += list.length ? `<div class="tasks">${list.map(o => itemRow(o, t)).join('')}</div>` : `<button type="button" class="wday-empty" data-act="add" data-day="${d}">+ Boş · plan ekle</button>`;
    html += '</div>';
  }
  return html;
}

function monthBody(sel, t) {
  const s = get();
  const [y, m] = (ctx.month || sel.slice(0, 7)).split('-').map(Number);
  const first = `${y}-${pad(m)}-01`;
  const start = mondayOf(first);
  const cells = Math.ceil((daysBetween(start, first) + monthDays(y, m - 1)) / 7) * 7;
  let grid = [1, 2, 3, 4, 5, 6, 0].map(d => `<span class="wd ${d === 6 || d === 0 ? 'we' : ''}">${DAY_SHORT[d]}</span>`).join('');
  for (let i = 0; i < cells; i++) {
    const d = dayAdd(start, i);
    const out = d.slice(0, 7) !== first.slice(0, 7);
    const dots = out ? [] : [...new Set(itemsOn(s.items, d).map(o => CATS[catOf(o)]?.color || ''))].slice(0, 3);
    grid += `<button type="button" class="mday ${out ? 'out' : ''} ${d === sel ? 'sel' : ''} ${d === t ? 'today' : ''}" data-act="pick-day" data-day="${d}"><span class="dd">${+d.slice(8)}</span><span class="dots">${dots.map(c => `<i ${c ? `style="--c:${c}"` : ''}></i>`).join('')}</span></button>`;
  }
  const list = itemsOn(s.items, sel);
  return `<div class="cal-card"><div class="cal-top"><div><h3>${MONTHS[m - 1]} ${y}</h3><span class="badge">${isoWeek(sel)}. hafta</span></div>
      <div class="round-nav"><button type="button" data-act="month" data-n="-1" aria-label="Önceki ay">${icon('chevL')}</button><button type="button" data-act="month" data-n="1" aria-label="Sonraki ay">${icon('chevR')}</button></div></div>
      <div class="mgrid" data-swipe="month">${grid}</div></div>
    <div class="agenda-h"><div><h4>${esc(dayLabel(sel, t))} · ${esc(fullDate(sel))}</h4></div><span class="badge-p">${list.length} plan</span></div>
    ${list.length ? `<div class="tasks">${list.map(o => itemRow(o, t, { stripe: true })).join('')}</div>` : `<button type="button" class="wday-empty" data-act="add" data-day="${sel}">+ Bu güne plan ekle</button>`}`;
}

export function renderPlan() {
  const t = today();
  if (!ctx.day) ctx.day = t;
  const sel = ctx.day;
  let kicker, title;
  if (ctx.mode === 'day') {
    const rel = dayLabel(sel, t);
    kicker = /^(Bugün|Yarın|Dün)$/.test(rel) ? `${rel} · ${DAY_NAMES[weekday(sel)]}` : DAY_NAMES[weekday(sel)];
    const [y, m, dd] = sel.split('-').map(Number);
    title = `${dd} ${MONTHS[m - 1]}${y !== +t.slice(0, 4) ? ' ' + y : ''}`;
  } else if (ctx.mode === 'week') {
    const diff = daysBetween(mondayOf(t), mondayOf(sel));
    kicker = diff === 0 ? 'Bu hafta' : diff === 7 ? 'Gelecek hafta' : diff === -7 ? 'Geçen hafta' : 'Hafta';
    title = `${isoWeek(sel)}. hafta`;
  } else {
    kicker = 'Takvim';
    const [y, m] = (ctx.month || sel.slice(0, 7)).split('-').map(Number);
    const n = Array.from({ length: monthDays(y, m - 1) }, (_, i) => itemsOn(get().items, `${y}-${pad(m)}-${pad(i + 1)}`).length).reduce((a, b) => a + b, 0);
    title = n ? `Bu ay ${n} plan` : 'Ay boş';
  }
  const seg = ['day', 'week', 'month'].map(m => `<button type="button" data-act="mode" data-mode="${m}" aria-pressed="${ctx.mode === m}">${{ day: 'Gün', week: 'Hafta', month: 'Ay' }[m]}</button>`).join('');
  const off = sel !== t;
  let body = '';
  if (ctx.mode === 'day') body = strip(sel, t) + dayBody(sel, t);
  else if (ctx.mode === 'week') body = weekBody(sel, t);
  else body = monthBody(sel, t);
  return `${appbar('Plan', off ? '<button type="button" class="pill-btn" data-act="today">Bugün</button>' : '')}
    <div class="page">${hero(kicker, title, statusChip())}
    <div class="seg" style="--i:${['day', 'week', 'month'].indexOf(ctx.mode)}" role="group" aria-label="Görünüm">${seg}</div>${body}</div>`;
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
    ctx.day = today().startsWith(ctx.month) ? today() : `${ctx.month}-01`;
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
    const row = el.closest('.task');
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

// Gün şeridinde / ay ızgarasında yatay kaydırma.
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
