// Planım: Gün / Hafta / Ay görünümleri ve satır işlemleri.
import { planOn, openBills, dayAdd, weekday, mondayOf, monthDays, daysBetween, dayLabel, repeatLabel, remindersLabel, nagShort, spanLabel, snoozeOf, whenAt, paidWord, periodName, statusOf, donePatch, patchOccurrence, toMin, clockAt, DAY_SHORT, DAY_NAMES, MONTHS, pad } from './core.js';
import { get, commit } from './store.js';
import { icon } from './icons.js';
import { esc, haptic, toast, actions, reduced } from './ui.js';
import { ctx, today, tz } from './ctx.js';
import { sync } from './api.js';
import { catOf, CATS } from './categories.js';
import { tile } from './pickers.js';
import { openBillList, billState, askDeleteBill } from './billsview.js';
import { appbar, hero, titleCase } from './chrome.js';

const fullDate = d => { const [, m, dd] = d.split('-').map(Number); return `${dd} ${MONTHS[m - 1]} ${DAY_NAMES[weekday(d)]}`; };
const STARTERS = [['Kısa yürüyüş', 'run', 'Bugün 18:00 kısa yürüyüş'], ['Kitap oku', 'book', 'Bugün 21:00 kitap oku'], ['Su iç', 'drop', 'Her gün 10:00 su iç'], ['Ailemi ara', 'phone', 'Bugün 20:00 ailemi ara']];
function isoWeek(day) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - y) / 86400000 - 3 + ((y.getUTCDay() + 6) % 7)) / 7);
}
// Tamamlananlar varsayılan gizli; gizliyken listeden, sayılardan ve takvim noktalarından da çıkar.
const showDone = () => get().prefs.showDone === true;
const listOn = (items, day) => planOn(items, day, today(), get().prefs);
export const visibleOn = (items, day) => listOn(items, day).filter(o => o.status !== 'done' || showDone());

export function itemRow(o, t, { stripe = false } = {}) {
  const s = get();
  const done = o.status === 'done';
  const key = catOf(o);
  const tags = [];
  const time = o.at?.time || o.time, date = o.at?.date || o.date;
  if (o.bill) {
    tags.push(`<span class="tag">${icon('cal')}${esc(spanLabel(o.date, o.end))}</span>`);
    const st = billState(o, t);
    tags.push(`<span class="tag st ${st.cls}">${esc(st.text)}</span>`);
  } else {
    const z = done ? null : snoozeOf(o);
    if (z && z.until > Date.now()) tags.push(`<span class="tag st due">${icon('again')}${esc(`Ertelendi ${whenAt(z.until, s.prefs.timeZone, t)}`)}</span>`);
    if (o.date && !done) {
      const rem = o.reminders ?? (o.time ? s.prefs.reminderDefaults : []);
      if (rem.length) tags.push(`<span class="tag">${icon('bell')}<b>${esc(remindersLabel(rem, !o.time))}</b></span>`);
      if (o.nag) tags.push(`<span class="tag">${icon('again')}${esc(nagShort(o.nag))}</span>`);
    }
    if (o.repeat !== 'none') tags.push(`<span class="tag">${icon('repeat')}<b>${esc(repeatLabel(o))}</b></span>`);
  }
  if (o.note) tags.push(`<span class="tag">${icon('notes')}Not</span>`);
  let cls = done ? 'done' : '';
  if (!o.bill && date === t && time && !done) {
    const now = clockAt(Date.now(), tz()).minutes, start = toMin(time), end = o.endTime && !o.at ? toMin(o.endTime) : start + 30;
    if (now >= start && now < (end > start ? end : end + 1440)) cls += ' now';
    else if (now >= (end > start ? end : start + 30)) cls += ' past';
  }
  if (ctx.enter === o.id) cls += ' enter';
  if (stripe) cls += ' stripe';
  const color = CATS[key]?.color;
  const ids = `data-id="${esc(o.id)}" data-origin="${esc(o.origin || '')}"`;
  // iOS tarzı: kart kayınca yanında ayrı, yuvarlak köşeli düğme açılır.
  return `<div class="swipe ${done ? 'is-done' : ''}" ${ids}>
    <button type="button" class="sw-act sw-done" data-act="swipe-done" ${ids} aria-label="${done ? 'Geri al' : 'Tamamla'}"><span>${icon(done ? 'undo' : 'check')}<small>${done ? 'Geri al' : o.bill ? paidWord(o.bill) : 'Tamamla'}</small></span></button>
    <button type="button" class="sw-act sw-del" data-act="swipe-del" ${ids} aria-label="Sil"><span>${icon('trash')}<small>Sil</small></span></button>
    <div class="task ${cls}" ${color ? `style="--c:${color}"` : ''} data-act="open" ${ids}>
      ${tile(key)}
      <div class="task-main"><div class="task-title">${esc(o.title)}</div>${tags.length ? `<div class="tags">${tags.join('')}</div>` : ''}</div>
      ${o.bill && !done ? `<button type="button" class="pay-btn ${o.date > t ? 'quiet' : ''}" data-act="swipe-done" ${ids}>${paidWord(o.bill)}</button>`
        : time && !o.bill ? `<span class="time-pill">${time}${o.endTime && !o.at ? `<small>${o.endTime}</small>` : ''}</span>` : ''}
    </div></div>`;
}

function strip(sel, t) {
  const s = get();
  const mon = mondayOf(sel);
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = dayAdd(mon, i);
    const has = visibleOn(s.items, d).length > 0;
    html += `<button type="button" class="day ${d === sel ? 'sel' : ''} ${d === t ? 'today' : ''} ${has ? 'has' : ''}" data-act="pick-day" data-day="${d}" aria-label="${fullDate(d)}">
      <span class="dn">${DAY_SHORT[weekday(d)]}</span><span class="dd">${+d.slice(8)}</span><span class="dot"></span></button>`;
  }
  return `<div class="strip-wrap"><button type="button" data-act="shift" data-n="-7" aria-label="Önceki hafta">${icon('chevL')}</button><div class="strip" data-swipe="week">${html}</div><button type="button" data-act="shift" data-n="7" aria-label="Sonraki hafta">${icon('chevR')}</button></div>`;
}

function emptyDay(day, t) {
  const isToday = day === t;
  return `<div class="empty-hero"><i class="aura a1"></i><i class="aura a2"></i>
      <div class="sun"><span>${icon(isToday ? 'sun' : 'cal')}</span></div>
      <h3>${isToday ? 'Bugün Boş' : 'Plan Yok'}</h3>
      <p>${isToday ? 'Güne yer açık. Rahatla ya da yeni bir plan ekle.' : esc(fullDate(day)) + ' için henüz bir şey yok.'}</p>
      <button type="button" class="pill-primary" data-act="add" data-day="${day}">${icon('plus')}Plan Ekle</button></div>
    <div class="starters"><span class="kicker">Hızlı başla</span><div class="chips-row">${STARTERS.map(([l, g, txt]) => `<button type="button" class="starter" data-act="add" data-text="${esc(txt)}">${icon(g)}${l}</button>`).join('')}</div></div>`;
}

function swipeHint() {
  try { if (localStorage.getItem('gp-swiped2')) return ''; } catch { return ''; }
  return '<p class="swipe-hint">Sağa çek: tamamla · Sola çek: sil</p>';
}

function dayBody(day, t) {
  const s = get();
  const all = listOn(s.items, day);
  const list = all.filter(o => o.status !== 'done' || showDone());
  const inbox = day === t ? s.items.filter(i => !i.date && (i.status === 'pending' || (showDone() && i.status === 'done'))) : [];
  let html = '';
  if (all.length) {
    const done = all.filter(o => o.status === 'done').length, left = all.length - done;
    html += `<div class="progress"><div class="progress-h"><span>Günlük İlerleme</span><b>${done} / ${all.length} Tamamlandı</b></div><div class="track"><i style="width:${Math.round((done / all.length) * 100)}%"></i></div></div>
      <div class="sec-h"><h3>Planlar</h3><span>${left ? `${left} Kaldı` : 'Hepsi Tamam'}</span></div>${swipeHint()}`;
    html += list.length ? `<div class="tasks">${list.map(o => itemRow(o, t)).join('')}</div>`
      : `<div class="all-done">${icon('check')}<b>Bugünün Planları Tamam</b><span>Tamamlananları sağ üstteki göz düğmesiyle görebilirsin.</span></div>`;
  }
  if (!all.length && !inbox.length) html += emptyDay(day, t);
  if (inbox.length) html += `<div class="sec-h"><h3>Yapılacaklar</h3><span>${inbox.length} İş</span></div><div class="tasks">${inbox.map(i => itemRow({ ...i, origin: '' }, t)).join('')}</div>`;
  return html;
}

function weekBody(sel, t) {
  const s = get();
  const mon = mondayOf(sel), sun = dayAdd(mon, 6);
  let html = `<div class="week-nav"><b>${+mon.slice(8)} ${MONTHS[+mon.slice(5, 7) - 1]} – ${+sun.slice(8)} ${MONTHS[+sun.slice(5, 7) - 1]}</b><div class="round-nav"><button type="button" data-act="shift" data-n="-7" aria-label="Önceki hafta">${icon('chevL')}</button><button type="button" data-act="shift" data-n="7" aria-label="Sonraki hafta">${icon('chevR')}</button></div></div>`;
  for (let i = 0; i < 7; i++) {
    const d = dayAdd(mon, i);
    const list = visibleOn(s.items, d);
    html += `<div class="wday"><div class="wday-h ${d === t ? 'today' : ''}">${DAY_NAMES[weekday(d)]}<small>${+d.slice(8)} ${MONTHS[+d.slice(5, 7) - 1]}${d === t ? ' · Bugün' : ''}</small></div>`;
    html += list.length ? `<div class="tasks">${list.map(o => itemRow(o, t)).join('')}</div>` : `<button type="button" class="wday-empty" data-act="add" data-day="${d}">+ Boş · Plan Ekle</button>`;
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
    const dots = out ? [] : [...new Set(visibleOn(s.items, d).map(o => CATS[catOf(o)]?.color || ''))].slice(0, 3);
    grid += `<button type="button" class="mday ${out ? 'out' : ''} ${d === sel ? 'sel' : ''} ${d === t ? 'today' : ''}" data-act="pick-day" data-day="${d}"><span class="dd">${+d.slice(8)}</span><span class="dots">${dots.map(c => `<i ${c ? `style="--c:${c}"` : ''}></i>`).join('')}</span></button>`;
  }
  const list = visibleOn(s.items, sel);
  return `<div class="cal-card"><div class="cal-top"><div><h3>${MONTHS[m - 1]} ${y}</h3><span class="badge">${isoWeek(sel)}. Hafta</span></div>
      <div class="round-nav"><button type="button" data-act="month" data-n="-1" aria-label="Önceki ay">${icon('chevL')}</button><button type="button" data-act="month" data-n="1" aria-label="Sonraki ay">${icon('chevR')}</button></div></div>
      <div class="mgrid" data-swipe="month">${grid}</div></div>
    <div class="agenda-h"><div><h4>${esc(dayLabel(sel, t))} · ${esc(fullDate(sel))}</h4></div><span class="badge-p">${list.length} Plan</span></div>
    ${list.length ? `<div class="tasks">${list.map(o => itemRow(o, t, { stripe: true })).join('')}</div>` : `<button type="button" class="wday-empty" data-act="add" data-day="${sel}">+ Bu Güne Plan Ekle</button>`}`;
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
    title = `${isoWeek(sel)}. Hafta`;
  } else {
    kicker = 'Takvim';
    const [y, m] = (ctx.month || sel.slice(0, 7)).split('-').map(Number);
    const n = Array.from({ length: monthDays(y, m - 1) }, (_, i) => visibleOn(get().items, `${y}-${pad(m)}-${pad(i + 1)}`).length).reduce((a, b) => a + b, 0);
    title = titleCase(n ? `Bu ay ${n} plan` : 'Ay boş');
  }
  const seg = ['day', 'week', 'month'].map(m => `<button type="button" data-act="mode" data-mode="${m}" aria-pressed="${ctx.mode === m}">${{ day: 'Gün', week: 'Hafta', month: 'Ay' }[m]}</button>`).join('');
  const off = sel !== t;
  let body = '';
  if (ctx.mode === 'day') body = strip(sel, t) + dayBody(sel, t);
  else if (ctx.mode === 'week') body = weekBody(sel, t);
  else body = monthBody(sel, t);
  const eye = `<button type="button" class="icon-btn ${showDone() ? 'on' : ''}" data-act="toggle-done" aria-pressed="${showDone()}" aria-label="${showDone() ? 'Tamamlananları gizle' : 'Tamamlananları göster'}">${icon(showDone() ? 'eye' : 'eyeOff')}</button>`;
  const owed = openBills(get().items, t).length;
  const bills = `<button type="button" class="icon-btn bills-btn" data-act="bills" aria-label="Faturalar${owed ? `, ${owed} ödeme bekliyor` : ''}">${icon('bill')}${owed ? `<i>${owed}</i>` : ''}</button>`;
  return `${appbar('Plan', (off ? '<button type="button" class="pill-btn" data-act="today">Bugün</button>' : '') + bills + eye)}
    <div class="page">${hero(kicker, title)}
    <div class="seg" style="--i:${['day', 'week', 'month'].indexOf(ctx.mode)}" role="group" aria-label="Görünüm">${seg}</div>${body}</div>`;
}

// ---- satır işlemleri ----
async function setDone(id, origin, next) {
  const item = get().items.find(i => i.id === id);
  if (!item) return null;
  const before = structuredClone(item);
  await commit(s => {
    const i = s.items.findIndex(x => x.id === id);
    s.items[i] = item.date ? patchOccurrence(s.items[i], origin || item.date, donePatch(item, next, today())) : { ...s.items[i], status: next, updatedAt: new Date().toISOString() };
  });
  sync();
  return before;
}

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
  'toggle-done': () => {
    const next = !showDone();
    haptic();
    commit(s => { s.prefs.showDone = next; });
    toast(next ? 'Tamamlananlar gösteriliyor' : 'Tamamlananlar gizlendi');
  },
  bills: () => { haptic(); openBillList(); },
  'swipe-del': el => deleteRow(el.closest('.swipe')),
  'swipe-done': el => completeRow(el.closest('.swipe')),
  // Özet sayfasındaki hızlı tamamla düğmesi
  toggle: async el => {
    const { id, origin } = el.dataset;
    const item = get().items.find(i => i.id === id);
    if (!item) return;
    const next = statusOf(item, origin || item.date) === 'done' ? 'pending' : 'done';
    haptic(next === 'done' ? 'success' : 'light');
    await setDone(id, origin, next);
  },
};

// ---- Kaydırma: sola çek → Sil (sonuna kadar çekince kendiliğinden), sağa çek → Tamamla ----
const ACT_W = 84, GAP = 8;
let openRow = null;
function setPull(wrap, x) {
  const task = wrap.querySelector('.task');
  task.style.transform = x ? `translateX(${x}px)` : '';
  const l = Math.max(0, x - GAP), r = Math.max(0, -x - GAP);
  wrap.style.setProperty('--pl', l + 'px');
  wrap.style.setProperty('--pr', r + 'px');
  wrap.style.setProperty('--opl', Math.min(1, l / 36));
  wrap.style.setProperty('--opr', Math.min(1, r / 36));
  wrap.style.setProperty('--kl', Math.min(1, .55 + l / 140));
  wrap.style.setProperty('--kr', Math.min(1, .55 + r / 140));
}
function closeRow(row) {
  if (!row) return;
  row.classList.remove('open', 'open-l', 'dragging', 'full');
  setPull(row, 0);
  if (openRow === row) openRow = null;
}
export const closeOpenRow = () => closeRow(openRow);
function markSwiped() { try { localStorage.setItem('gp-swiped2', '1'); } catch { /* yok */ } }

function flyOut(wrap, dir) {
  return new Promise(done => {
    if (reduced()) return done();
    const task = wrap.querySelector('.task');
    wrap.classList.add('leaving');
    task.style.transition = 'transform .28s cubic-bezier(.4, 0, 1, 1)';
    task.style.transform = `translateX(${dir * 115}%)`;
    wrap.style.height = wrap.offsetHeight + 'px';
    requestAnimationFrame(() => {
      wrap.style.transition = 'height .28s .14s cubic-bezier(.32,.72,0,1), margin .28s .14s, opacity .22s .14s';
      wrap.style.height = '0px';
      wrap.style.marginBottom = '-8px';
      wrap.style.opacity = '0';
    });
    setTimeout(done, 450);
  });
}

async function completeRow(wrap) {
  if (!wrap) return;
  const { id, origin } = wrap.dataset;
  const undo = wrap.classList.contains('is-done');
  haptic('success');
  if (!undo && !showDone()) await flyOut(wrap, 1);  // gizliyken akıp gider
  else closeRow(wrap);                                 // görünürken üstü çizilir, yerinde kalır
  const before = await setDone(id, origin, undo ? 'pending' : 'done');
  if (before && !undo) toast(before.bill ? `${periodName(origin)} dönemi tamam` : 'Tamamlandı', { label: 'Geri al', run: () => commit(s => { const i = s.items.findIndex(x => x.id === id); if (i >= 0) s.items[i] = before; }).then(() => sync()) });
}

export async function deleteRow(wrap) {
  if (!wrap) return;
  const { id, origin } = wrap.dataset;
  const item = get().items.find(i => i.id === id);
  if (!item) return;
  let choice = 'all';
  if (item.bill) {
    choice = await askDeleteBill(item, origin);
    if (!choice) { closeRow(wrap); return; }
  } else if (item.repeat !== 'none' && origin) {
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
  toast(choice === 'one' ? (item.bill ? 'Bu dönem atlandı' : 'Bu gün silindi') : 'Silindi', { label: 'Geri al', run: () => commit(s => { s.items = s.items.filter(z => z.id !== id).concat(before); }).then(() => sync()) });
}

export function bindSwipe(view) {
  let sw = null, strip = null;
  view.addEventListener('touchstart', e => {
    const wrap = e.target.closest('.swipe');
    if (openRow && openRow !== wrap) closeRow(openRow);
    const p = e.touches[0];
    if (wrap && !e.target.closest('.sw-act')) {
      const base = wrap.classList.contains('open') ? -ACT_W - GAP : wrap.classList.contains('open-l') ? ACT_W + GAP : 0;
      sw = { wrap, x0: p.clientX, y0: p.clientY, base, x: base, lock: null, w: wrap.offsetWidth, full: false, armed: false };
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
    if (x > 0) x = x > sw.w * 0.45 ? sw.w * 0.45 + (x - sw.w * 0.45) * 0.25 : x; // sağda direnç
    sw.x = x;
    sw.wrap.classList.add('dragging');
    setPull(sw.wrap, x);
    const full = x < -sw.w * 0.5, armed = x > sw.w * 0.3;
    if (full !== sw.full) { sw.full = full; sw.wrap.classList.toggle('full', full); haptic(); }
    if (armed !== sw.armed) { sw.armed = armed; sw.wrap.classList.toggle('armed', armed); haptic(); }
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
    const { wrap, x, lock, full, armed } = sw;
    sw = null;
    if (lock !== 'x') return;
    ctx.swipedAt = Date.now();
    markSwiped();
    wrap.classList.remove('dragging', 'armed');
    if (full) { deleteRow(wrap); return; }
    if (armed) { completeRow(wrap); return; }
    if (x < -ACT_W / 2) { wrap.classList.add('open'); wrap.classList.remove('open-l'); setPull(wrap, -ACT_W - GAP); openRow = wrap; }
    else if (x > ACT_W / 2) { wrap.classList.add('open-l'); wrap.classList.remove('open'); setPull(wrap, ACT_W + GAP); openRow = wrap; }
    else closeRow(wrap);
  };
  view.addEventListener('touchend', end);
  view.addEventListener('touchcancel', end);
  view.addEventListener('scroll', () => { if (openRow) closeRow(openRow); }, { passive: true });
}
