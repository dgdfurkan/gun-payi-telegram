// Faturalar: ödenecekler, ödenenler ve dönem düzenleyici.
import { cleanItem, uid, occurrence, openBills, patchOccurrence, donePatch, addMonths, monthKey, monthsBetween, daysBetween, isCycle, billSpan, firstCycle, newBill, cycleDays, spanLabel, billLabel, periodName, paidWord, shortDate, zonedMs, BILL_TYPES } from './core.js';
import { get, commit, subscribe } from './store.js';
import { icon } from './icons.js';
import { $, esc, haptic, toast, sheet, actions, confirmDanger } from './ui.js';
import { today, tz } from './ctx.js';
import { sync } from './api.js';
import { catOf } from './categories.js';
import { tile, wheelHTML, bindWheel, intervalHTML, intervalOf, stepInput } from './pickers.js';

// Dönemin durumu, kısa ve kesin
export function billState(o, t) {
  if (o.status === 'done') return { text: o.bill.auto ? 'Çekildi' : 'Ödendi', cls: 'ok' };
  if (o.status === 'cancelled') return { text: 'Atlandı', cls: '' };
  const toStart = daysBetween(t, o.date), toEnd = daysBetween(t, o.end);
  if (toStart > 0) return { text: toStart === 1 ? 'Yarın başlıyor' : `${toStart} gün sonra`, cls: '' };
  if (toEnd > 0) return { text: toEnd === 1 ? 'Son gün yarın' : `Son ${toEnd} gün`, cls: 'due' };
  if (toEnd === 0) return { text: o.date === o.end ? 'Bugün' : 'Bugün son gün', cls: 'due' };
  return { text: o.bill.auto ? 'Çekim günü geçti' : `${-toEnd} gün gecikti`, cls: 'late' };
}

export async function setPaid(id, origin, status) {
  const t = today();
  const item = get().items.find(i => i.id === id);
  if (!item) return;
  await commit(s => {
    const i = s.items.findIndex(x => x.id === id);
    if (i >= 0) s.items[i] = patchOccurrence(s.items[i], origin, donePatch(s.items[i], status, t));
  });
  sync(true);
}

// Henüz ödenmemiş ilk gelecek dönem (erken ödeme için)
function upcoming(item, t) {
  const from = monthKey(item.date > t ? item.date : t);
  for (let i = 0; i <= 12 * (item.interval || 1) + 1; i++) {
    const key = addMonths(from, i);
    if (!isCycle(item, key)) continue;
    const o = occurrence(item, key);
    if (o.date > t && o.status === 'pending') return o;
  }
  return null;
}
function lastPaid(item) {
  const key = Object.keys(item.exceptions || {}).filter(k => item.exceptions[k].status === 'done' && isCycle(item, k)).sort().pop();
  return key ? occurrence(item, key) : null;
}

function row(o, t) {
  const st = billState(o, t), done = o.status === 'done', future = o.date > t;
  const ids = `data-id="${esc(o.id)}" data-origin="${esc(o.origin)}"`;
  return `<div class="task bill-row ${done ? 'done' : ''}">
    <button type="button" class="bill-open" data-b="edit" ${ids}>${tile(catOf(o))}
      <span class="task-main"><span class="task-title">${esc(o.title)}</span><span class="tags"><span class="tag">${icon('cal')}${esc(spanLabel(o.date, o.end))}</span><span class="tag st ${st.cls}">${esc(st.text)}</span></span></span></button>
    <button type="button" class="pay-btn ${done || future ? 'quiet' : ''}" data-b="${done ? 'undo' : 'pay'}" ${ids}>${done ? 'Geri al' : paidWord(o.bill)}</button></div>`;
}

export function openBillList() {
  const body = () => {
    const t = today(), items = get().items.filter(i => i.bill);
    const due = openBills(items, t);
    const next = items.map(i => upcoming(i, t)).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
    const paid = items.map(lastPaid).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
    const section = (title, list) => (list.length ? `<div class="section-h">${title}</div><div class="tasks">${list.map(o => row(o, t)).join('')}</div>` : '');
    return `<div class="form">
      ${items.length
        ? `<div class="bill-sum">${icon(due.length ? 'bill' : 'check')}<div><b>${due.length ? `${due.length} Ödeme Bekliyor` : 'Bekleyen Ödeme Yok'}</b><span>Ödedim dediğin dönem susar, sonraki dönemde yeniden başlar.</span></div></div>`
        : `<div class="empty"><div class="em-ic">${icon('bill')}</div><b>Faturalarını bir kez gir</b>Net gün ya da aralık seç. Ödeyene kadar Telegram’dan hatırlatırım.</div>`}
      ${section('Ödenecekler', due)}${section('Sıradaki dönem', next)}${section('Son ödenenler', paid)}
      <div class="section-h">Fatura ekle</div>
      <div class="bill-types">${Object.entries(BILL_TYPES).map(([k, v]) => `<button type="button" class="ico" data-b="new" data-type="${k}">${tile(v.cat)}<span>${v.label}</span></button>`).join('')}</div>
    </div>`;
  };
  const sh = sheet({ title: 'Faturalar', left: 'Kapat', body: body(), onClose: () => off() });
  const off = subscribe(() => {
    const y = sh.body.scrollTop;
    sh.body.innerHTML = body();
    sh.body.scrollTop = y;
  });
  sh.body.addEventListener('click', async e => {
    const b = e.target.closest('[data-b]');
    if (!b) return;
    const { id, origin, type } = b.dataset;
    if (b.dataset.b === 'new') { haptic(); openBill({ type }); }
    if (b.dataset.b === 'edit') { haptic(); openBill({ id, origin }); }
    if (b.dataset.b === 'undo') { haptic(); await setPaid(id, origin, 'pending'); }
    if (b.dataset.b === 'pay') {
      haptic('success');
      await setPaid(id, origin, 'done');
      toast(`${periodName(origin)} dönemi tamam`, { label: 'Geri al', run: () => setPaid(id, origin, 'pending') });
    }
  });
  return sh;
}

const BEFORE = [1, 2, 3, 7], AFTER = [1, 2, 3, 5, 7];

// id: düzenle · type: yeni · draft: ekleme panelinde söylenen fatura
export function openBill({ id = '', origin = '', type = 'diger', draft = null, onSaved = null } = {}) {
  const saved = id ? get().items.find(i => i.id === id) : null;
  if (id && !saved?.bill) return null;
  const t = today();
  let d = saved ? structuredClone(saved) : {
    id: uid(), title: draft?.title || BILL_TYPES[type].title, icon: draft?.icon || '', time: draft?.time || '', note: '',
    interval: draft?.interval || 1, bill: draft?.bill ? structuredClone(draft.bill) : newBill(type, 10, BILL_TYPES[type].auto ? 10 : 15),
  };
  let range = d.bill.from !== d.bill.to, anchor = null, open = '';
  // Kullanıcı hatırlatma günlerine dokunmadıkça varsayılanlar seçime göre değişir.
  let ownDays = Boolean(saved || draft);
  const daysTouched = () => !saved || d.bill.from !== saved.bill.from || d.bill.to !== saved.bill.to;
  const startDate = () => (saved && (Object.keys(saved.exceptions || {}).length || !daysTouched()) ? saved.date : billSpan(d.bill, firstCycle(d.bill, t)).start);
  const period = saved && origin && isCycle(saved, origin) ? occurrence(saved, origin) : null;
  const at = () => d.time || get().prefs.allDayTime;

  function nextReminders() {
    const temp = { ...d, date: startDate(), repeat: 'monthly', status: 'pending', exceptions: saved?.exceptions || {} };
    for (let i = -1; i <= 12 * d.interval + 1; i++) {
      const key = addMonths(monthKey(t), i);
      if (monthsBetween(temp.date, key) < 0 || !isCycle(temp, key) || occurrence(temp, key).status !== 'pending') continue;
      const { start, end } = billSpan(d.bill, key);
      const days = cycleDays(d.bill, key).filter(x => zonedMs(x, at(), tz()) > Date.now());
      if (!days.length) continue;
      const inside = days.filter(x => x >= start && x <= end), outside = days.filter(x => x < start || x > end);
      const parts = [...outside.filter(x => x < start).map(shortDate), ...(inside.length > 1 ? [`${spanLabel(inside[0], inside.at(-1))} her gün`] : inside.map(shortDate)), ...outside.filter(x => x > end).map(shortDate)];
      return `<b>${esc(periodName(key))} dönemi: ${esc(spanLabel(start, end))}</b><span>${esc(parts.join(' · '))} · saat ${at()}</span>`;
    }
    return '';
  }
  function dayGrid() {
    const { from, to } = d.bill;
    const within = n => (from <= to ? n >= from && n <= to : n >= from || n <= to);
    const cls = n => [within(n) && 'in-range', n === from && 'edge start', n === to && 'edge end', n === anchor && 'anchor'].filter(Boolean).join(' ');
    return `<div class="bd-grid">${Array.from({ length: 31 }, (_, i) => `<button type="button" class="bd ${cls(i + 1)}" data-day="${i + 1}">${i + 1}</button>`).join('')}</div>
      <p class="pk-note">${!range ? 'Faturanın günü. 31 seçersen kısa aylarda ayın son günü olur.' : anchor ? `Başlangıç ${anchor}. Şimdi bitiş gününe dokun.` : 'Önce ilk güne, sonra son güne dokun. Sonraki aya taşabilir (25 → 5).'}</p>`;
  }
  function dayChips(key, presets) {
    const list = d.bill[key], all = [...new Set([...presets, ...list])].sort((a, b) => a - b);
    return `<div class="picker-row">${all.map(n => `<button type="button" class="chip ${list.includes(n) ? 'on' : ''}" data-list="${key}" data-n="${n}">${n} gün</button>`).join('')}<button type="button" class="chip ${list.length ? '' : 'on'}" data-list="${key}" data-n="0">Yok</button></div>
      <div class="rem-custom"><span class="rc-l">Özel</span><button type="button" class="rc-b" data-step="-1" aria-label="Azalt">${icon('minus')}</button><input type="number" inputmode="numeric" min="1" max="3650" value="10" data-dn aria-label="Gün"><button type="button" class="rc-b" data-step="1" aria-label="Artır">${icon('plus')}</button><span class="rc-l">gün</span><button type="button" class="rc-add" data-add="${key}">Ekle</button></div>`;
  }
  const body = () => `<div class="form">
    <div class="ed-head">${tile(catOf(d), 'lg')}<input class="title-input" value="${esc(d.title)}" data-f="title" aria-label="Fatura adı" enterkeyhint="done"></div>
    ${period ? `<button type="button" class="big-btn ${period.status === 'done' ? 'soft' : ''}" data-x="paid">${icon(period.status === 'done' ? 'undo' : 'check')}${esc(spanLabel(period.date, period.end))} · ${period.status === 'done' ? 'Geri al' : paidWord(period.bill)}</button>` : ''}
    <div class="section-h">Ödeme günleri</div>
    <div class="group pad">
      <div class="seg bill-kind" style="--i:${range ? 0 : 1};--n:2"><button type="button" data-x="range" aria-pressed="${range}">Tarih aralığı</button><button type="button" data-x="single" aria-pressed="${!range}">Net gün</button></div>
      ${dayGrid()}
      ${intervalHTML(d.interval, 'ayda')}
    </div>
    <div class="group">
      <label class="cell"><span class="cell-ic soft">${icon('sub')}</span><span class="cell-label">Otomatik çekiliyor<small>Süresi geçince gecikmiş sayılmaz</small></span><span class="switch"><input type="checkbox" data-auto ${d.bill.auto ? 'checked' : ''}><span></span></span></label>
      <button type="button" class="cell ${open === 'time' ? 'opened' : ''}" data-x="time"><span class="cell-ic soft">${icon('clock')}</span><span class="cell-label">Hatırlatma saati</span><span class="cell-value">${at()}</span>${icon('chevD', 'chev rot')}</button>
      ${open === 'time' ? `<div class="exp in">${wheelHTML(at())}</div>` : ''}
    </div>
    <div class="section-h">Başlamadan önce de haber ver</div>
    <div class="group pad">${dayChips('before', BEFORE)}</div>
    <div class="section-h">${d.bill.auto ? 'İşaretlemezsem, günü geçince' : 'Ödemezsem, süre bitince'}</div>
    <div class="group pad">${dayChips('after', AFTER)}</div>
    <div class="bill-next">${icon('bell')}<div>${nextReminders()}</div></div>
    ${saved ? `<div class="group">
      ${period?.status === 'pending' ? `<button type="button" class="cell" data-x="skip"><span class="cell-ic gray">${icon('skip')}</span><span class="cell-label">Bu dönem fatura yok</span></button>` : ''}
      <button type="button" class="cell danger" data-x="delete">Faturayı sil</button></div>` : ''}
  </div>`;

  const sh = sheet({ title: saved ? 'Fatura' : 'Yeni fatura', right: saved ? 'Bitti' : 'Ekle', body: body(), onRight: () => save() });
  const read = () => { d.title = $('[data-f=title]', sh.body).value; };
  const rerender = () => {
    read();
    const y = sh.body.scrollTop;
    sh.body.innerHTML = body();
    sh.body.scrollTop = y;
    if (open === 'time') bindWheel($('.exp', sh.body), v => {
      d.time = v;
      $('[data-x=time] .cell-value', sh.body).textContent = v;
      $('.bill-next div', sh.body).innerHTML = nextReminders();
    });
  };
  const setDays = (from, to) => {
    const { type: kind, auto, before, after } = d.bill;
    d.bill = ownDays ? { type: kind, auto, before, after, from, to } : newBill(kind, from, to, auto);
  };

  sh.body.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.day) {
      const n = +b.dataset.day;
      if (!range) setDays(n, n);
      else if (anchor === null) { anchor = n; setDays(n, n); }
      else { setDays(anchor, n); range = anchor !== n; anchor = null; }
      haptic(); return rerender();
    }
    if (b.dataset.list) {
      const key = b.dataset.list, n = +b.dataset.n, cur = d.bill[key];
      d.bill[key] = !n ? [] : cur.includes(n) ? cur.filter(x => x !== n) : [...cur, n].sort((x, y) => x - y);
      ownDays = true; haptic(); return rerender();
    }
    if (b.dataset.step) { stepInput($('[data-dn]', b.closest('.rem-custom')), +b.dataset.step); return; }
    if (b.dataset.add) {
      const n = parseInt($('[data-dn]', b.closest('.rem-custom')).value, 10);
      if (!(n >= 1 && n <= 3650)) { toast('Geçerli bir gün sayısı yaz.'); return; }
      d.bill[b.dataset.add] = [...new Set([...d.bill[b.dataset.add], n])].sort((x, y) => x - y);
      ownDays = true; haptic('success'); return rerender();
    }
    if (b.dataset.int) { d.interval = intervalOf($('[data-intv]', sh.body).value, b.dataset.int); haptic(); return rerender(); }
    const x = b.dataset.x;
    if (x === 'range') {
      if (range) return;
      range = true; anchor = d.bill.from;
      haptic(); return rerender();
    }
    if (x === 'single') { range = false; anchor = null; setDays(d.bill.from, d.bill.from); haptic(); return rerender(); }
    if (x === 'time') { open = open ? '' : 'time'; haptic(); return rerender(); }
    if (x === 'paid') {
      const next = period.status === 'done' ? 'pending' : 'done';
      haptic('success');
      await save({ quiet: true });
      await setPaid(id, origin, next);
      toast(next === 'done' ? `${periodName(origin)} dönemi tamam` : 'Geri alındı');
    }
    if (x === 'skip') {
      await setPaid(id, origin, 'cancelled');
      haptic(); sh.close();
      toast('Bu dönem atlandı', { label: 'Geri al', run: () => setPaid(id, origin, 'pending') });
    }
    if (x === 'delete') {
      if (!(await confirmDanger(`“${saved.title}” bütün dönemleriyle silinsin mi?`, 'Faturayı sil'))) return;
      const before = structuredClone(get().items.find(i => i.id === id) || saved);
      await commit(s => { s.items = s.items.filter(i => i.id !== id); });
      haptic(); sh.close(); sync(true);
      toast('Fatura silindi', { label: 'Geri al', run: () => commit(s => { s.items = s.items.filter(i => i.id !== id).concat(before); }).then(() => sync()) });
    }
  });
  sh.body.addEventListener('change', e => {
    if (e.target.dataset.intv !== undefined) { d.interval = intervalOf(e.target.value); rerender(); }
    if (e.target.dataset.auto !== undefined) {
      d.bill.auto = e.target.checked;
      if (!ownDays) d.bill = newBill(d.bill.type, d.bill.from, d.bill.to, d.bill.auto);
      haptic(); rerender();
    }
  });

  async function save({ quiet = false } = {}) {
    read();
    if (!d.title.trim()) { toast('Fatura adı boş olamaz.'); return; }
    if (range && anchor !== null && !quiet) { toast('Aralığın son gününe de dokun.'); return; }
    // Ödeme bilgisi bu sayfa açıkken Telegram'dan değişmiş olabilir; güncel hâli korunur.
    const cur = saved ? get().items.find(i => i.id === id) : null;
    if (saved && !cur) { sh.close(); return; }
    let item;
    try {
      item = cleanItem({ ...d, date: startDate(), repeat: 'monthly', exceptions: cur?.exceptions || {}, status: 'pending', updatedAt: new Date().toISOString() });
    } catch (err) { toast(err.message); return; }
    await commit(s => {
      const i = s.items.findIndex(z => z.id === item.id);
      if (i >= 0) s.items[i] = item; else s.items.push(item);
    });
    haptic('success');
    sh.close();
    onSaved?.(item);
    if (!saved && !quiet) toast(`Eklendi · ${billLabel(item)}`);
    sync(true);
  }
  return sh;
}

// Listeden silme: yalnız bu dönem mi, faturanın tamamı mı?
export const askDeleteBill = (item, origin) => actions(`“${item.title}” dönemsel bir fatura`, [
  { label: origin ? `${periodName(origin)} dönemi yok` : 'Bu dönem yok', value: 'one' },
  { label: 'Faturayı tamamen sil', value: 'all', danger: true },
]);
