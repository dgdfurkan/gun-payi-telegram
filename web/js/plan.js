// Planım: Gün / Hafta / Ay görünümleri ve satır işlemleri.
import { itemsOn, dayAdd, weekday, mondayOf, monthDays, daysBetween, dayLabel, repeatLabel, remindersLabel, statusOf, patchOccurrence, toMin, clockAt, DAY_SHORT, DAY_NAMES, MONTHS, pad } from './core.js';
import { get, commit } from './store.js';
import { icon } from './icons.js';
import { esc, haptic, toast, actions, reduced } from './ui.js';
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
  const ids = `data-id="${esc(o.id)}" data-origin="${esc(o.origin || '')}"`;
  return `<div class="swipe ${done ? 'is-done' : ''}" ${ids}>
    <div class="swipe-bg"><span class="sb-l">${icon(done ? 'undo' : 'check')}${done ? 'Geri al' : 'Tamamla'}</span><button type="button" class="sb-r" data-act="swipe-del" ${ids}>${icon('trash')}Sil</button></div>
    <div class="task ${cls}" ${color ? `style="--c:${color}"` : ''} data-act="open" ${ids}>
    ${tile(key)}
    <div class="task-main"><div class="task-title">${esc(o.title)}</div>${tags.length ? `<div class="tags">${tags.join('')}</div>` : ''}</div>
    ${o.time ? `<span class="time-pill">${o.time}${o.endTime ? `<small>${o.endTime}</small>` : ''}</span>` : ''}
  </div></div>`;
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

// Tamamlananlar listeden düşer; istenirse küçük bağlantıyla görünür (geri almak için).
const doneToggle = n => `<button type="button" class="done-toggle" data-act="show-done">${icon('check')}${n} tamamlandı · ${ctx.showDone ? 'gizle' : 'göster'}</button>`;
function swipeHint() {
  try { if (localStorage.getItem('gp-swiped')) return ''; } catch { return ''; }
  return '<p class="swipe-hint">Sağa kaydır: tamamla · Sola kaydır: sil</p>';
}

function dayBody(day, t) {
  const s = get();
  const list = itemsOn(s.items, day);
  const inbox = day === t ? s.items.filter(i => !i.date && (i.status === 'pending' || ctx.pop === `${i.id}:`)) : [];
  let html = '';
  if (list.length) {
    const done = list.filter(o => o.status === 'done').length;
    const visible = list.filter(o => o.status !== 'done' || ctx.showDone);
    html += `<div class="progress"><div class="progress-h"><span>Günlük ilerleme</span><b>${done} / ${list.length} tamamlandı</b></div><div class="track"><i style="width:${Math.round((done / list.length) * 100)}%"></i></div></div>
      <div class="sec-h"><h3>Planlar</h3><span>${list.length - done ? `${list.length - done} kaldı` : 'hepsi tamam'}</span></div>${swipeHint()}`;
    html += visible.length ? `<div class="tasks">${visible.map(o => itemRow(o, t)).join('')}</div>` : `<div class="all-done">${icon('check')}<b>Bugünün planları tamam</b><span>Güzel iş. Dinlenmeyi unutma.</span></div>`;
    if (done) html += doneToggle(done);
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
    const list = itemsOn(s.items, d).filter(o => o.status !== 'done' || ctx.showDone);
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
  const list = itemsOn(s.items, sel).filter(o => o.status !== 'done' || ctx.showDone);
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
  'show-done': () => { ctx.showDone = !ctx.showDone; haptic(); ctx.render(); },
  'swipe-del': el => deleteRow(el.closest('.swipe')),
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

// ---- Kaydırma: kartta sola sil (sonuna kadar = otomatik), sağa tamamla; şerit/ayda hafta/ay değiştir ----
let openRow = null;
const closeRow = row => { row?.classList.remove('open'); const t = row?.querySelector('.task'); if (t) t.style.transform = ''; if (openRow === row) openRow = null; };
function markSwiped() { try { localStorage.setItem('gp-swiped', '1'); } catch { /* yok */ } }

function flyOut(wrap, dir) {
  return new Promise(done => {
    if (reduced()) return done();
    const task = wrap.querySelector('.task');
    task.style.transition = 'transform .26s cubic-bezier(.4, 0, 1, 1)';
    task.style.transform = `translateX(${dir * 115}%)`;
    wrap.style.height = wrap.offsetHeight + 'px';
    requestAnimationFrame(() => {
      wrap.style.transition = 'height .26s .16s cubic-bezier(.32,.72,0,1), margin .26s .16s, opacity .2s .16s';
      wrap.style.height = '0px';
      wrap.style.marginBottom = '-8px';
      wrap.style.opacity = '0';
    });
    setTimeout(done, 440);
  });
}

async function completeRow(wrap) {
  const { id, origin } = wrap.dataset;
  const item = get().items.find(i => i.id === id);
  if (!item) return;
  const undo = wrap.classList.contains('is-done');
  const next = undo ? 'pending' : 'done';
  haptic('success');
  await flyOut(wrap, 1);
  const before = structuredClone(item);
  await commit(s => {
    const i = s.items.findIndex(x => x.id === id);
    s.items[i] = item.date ? patchOccurrence(s.items[i], origin || item.date, { status: next }) : { ...s.items[i], status: next, updatedAt: new Date().toISOString() };
  });
  sync();
  if (!undo) toast('Tamamlandı', { label: 'Geri al', run: () => commit(s => { const i = s.items.findIndex(x => x.id === id); if (i >= 0) s.items[i] = before; }).then(() => sync()) });
}

export async function deleteRow(wrap) {
  const { id, origin } = wrap.dataset;
  const item = get().items.find(i => i.id === id);
  if (!item) return;
  let choice = 'all';
  if (item.repeat !== 'none' && origin) {
    choice = await actions(`“${item.title}” tekrarlayan bir plan`, [{ label: 'Sadece bu günü sil', value: 'one' }, { label: 'Tüm seriyi sil', value: 'all', danger: true }]);
    if (!choice) { closeRow(wrap); return; }
  }
  haptic('success');
  await flyOut(wrap, -1);
  const before = structuredClone(item);
  await commit(s => {
    if (choice === 'one') { const i = s.items.findIndex(z => z.id === id); s.items[i] = patchOccurrence(s.items[i], origin, { status: 'cancelled' }); }
    else s.items = s.items.filter(z => z.id !== id);
  });
  sync();
  toast(choice === 'one' ? 'Bu gün silindi' : 'Silindi', { label: 'Geri al', run: () => commit(s => { s.items = s.items.filter(z => z.id !== id).concat(before); }).then(() => sync()) });
}

export function bindSwipe(view) {
  let sw = null, strip = null;
  view.addEventListener('touchstart', e => {
    const wrap = e.target.closest('.swipe');
    if (openRow && openRow !== wrap) closeRow(openRow);
    const p = e.touches[0];
    if (wrap && !e.target.closest('.sb-r')) {
      sw = { wrap, task: wrap.querySelector('.task'), x0: p.clientX, y0: p.clientY, base: wrap.classList.contains('open') ? -96 : 0, dx: 0, lock: null, w: wrap.offsetWidth, full: false, arm: false };
      return;
    }
    const s = e.target.closest('[data-swipe]');
    if (s) strip = { kind: s.dataset.swipe, x0: p.clientX, y0: p.clientY };
  }, { passive: true });
  view.addEventListener('touchmove', e => {
    if (!sw) return;
    const p = e.touches[0], dx = p.clientX - sw.x0, dy = p.clientY - sw.y0;
    if (!sw.lock) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) sw.lock = 'x';
      else if (Math.abs(dy) > 8) { sw.lock = 'y'; return; }
      else return;
    }
    if (sw.lock !== 'x') return;
    e.preventDefault();
    let x = sw.base + dx;
    if (x > 0) x = Math.min(x, sw.w * 0.6) * (x > 140 ? 0.92 : 1);
    sw.dx = x;
    sw.wrap.classList.add('dragging');
    sw.wrap.classList.toggle('left', x < 0);
    sw.wrap.classList.toggle('right', x > 0);
    sw.task.style.transform = `translateX(${x}px)`;
    const full = x < -sw.w * 0.55, arm = x > 88;
    if (full !== sw.full) { sw.full = full; sw.wrap.classList.toggle('full', full); haptic(); }
    if (arm !== sw.arm) { sw.arm = arm; sw.wrap.classList.toggle('arm', arm); haptic(); }
  }, { passive: false });
  const end = e => {
    if (strip && !sw) {
      const p = e.changedTouches[0], dx = p.clientX - strip.x0, dy = p.clientY - strip.y0, kind = strip.kind;
      strip = null;
      if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
      const dir = dx < 0 ? 1 : -1;
      if (kind === 'week') planActs.shift({ dataset: { n: String(7 * dir) } });
      else planActs.month({ dataset: { n: String(dir) } });
      haptic();
      return;
    }
    if (!sw) return;
    const { wrap, task, dx, lock, full, arm } = sw;
    sw = null;
    if (lock !== 'x') return;
    ctx.swipedAt = Date.now();
    markSwiped();
    wrap.classList.remove('dragging', 'full', 'arm');
    if (full) { wrap.classList.remove('right'); wrap.classList.add('left'); deleteRow(wrap); return; }
    if (arm) { completeRow(wrap); return; }
    wrap.classList.remove('left', 'right');
    if (dx < -56) { wrap.classList.add('open'); task.style.transform = ''; openRow = wrap; }
    else closeRow(wrap);
  };
  view.addEventListener('touchend', end);
  view.addEventListener('touchcancel', end);
  view.addEventListener('scroll', () => { if (openRow) closeRow(openRow); }, { passive: true });
}
