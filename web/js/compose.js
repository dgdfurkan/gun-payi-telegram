// Ekleme (doğal dil + ses), plan düzenleme, erteleme ve not sayfaları.
import { parse, toItem, parseUntil, surpriseNote } from './parse.js';
import { cleanItem, dayAdd, dayLabel, repeatLabel, remindersLabel, billRemindLabel, nagShort, weekday, uid, activeOn, occurrence, patchOccurrence, donePatch, shortDate, statusOf, zonedMs, baseTime, makeSnooze, snoozeOf, whenAt, sortRems, MINUTE, DAY_NAMES } from './core.js';
import { get, commit } from './store.js';
import { icon } from './icons.js';
import { $, $$, esc, haptic, toast, sheet, actions, confirmDanger } from './ui.js';
import { ctx, today, tz } from './ctx.js';
import { startDictation, stopDictation, abortDictation, listening, voiceSupported } from './voice.js';
import { link, aiParse, sync } from './api.js';
import { catOf } from './categories.js';
import { openBill } from './billsview.js';
import { calendarHTML, shiftMonth, quickDays, wheelHTML, bindWheel, reminderHTML, withTypedReminder, nagHTML, applyNag, isNagButton, handleCustom, toggleReminder, repeatHTML, applyRepeat, intervalOf, toggleWeekday, snoozeHTML, paintSnooze, tile, iconGridHTML } from './pickers.js';

const EXAMPLES = [["Her cuma 12'de babaannemi ara", 'phone'], ["Yarın 9'da spor, 10 dk önce", 'run'], ['Elektrik faturası her ayın 10’u ile 15’i arası', 'bolt'], ['24 Nisan’da nişan, 1 ay önce hatırlat', 'cake'], ['Hafta içi 07:30 ilaç', 'pill'], ['Kedinin kumunu değiştir, bu hafta hatırlat', 'sparkle'], ['Her gün 21:00 kitap oku', 'book'], ['Ekmek al', 'cart']];
const whenLabel = (p, t) => (p.repeat !== 'none' ? repeatLabel(p) : p.date ? dayLabel(p.date, t) : 'Yapılacaklar');
// Saatsiz planda varsayılan "10 dk önce" geçmez; istenen hatırlatma geçer.
const remOf = p => p.reminders ?? (p.time ? get().prefs.reminderDefaults : []);
const longDate = (d, t) => { const l = dayLabel(d, t); return /^(Bugün|Yarın|Dün)$/.test(l) ? `${l}, ${shortDate(d)}` : `${shortDate(d)} ${DAY_NAMES[weekday(d)]}`; };

// ---------------- Ekleme ----------------
export function openCompose({ day = '', text = '', kind = 'plan' } = {}) {
  const st = { kind, parsed: null, over: {}, locks: {}, picker: '', ai: false, aiFor: '', month: null };
  const linked = Boolean(link());
  const sh = sheet({
    nav: false, full: false, cls: 'compose-sheet',
    body: `<div class="cmp">
      <div class="cmp-head"><div class="seg mini kind-seg" style="--i:${kind === 'note' ? 1 : 0}" role="group"><button type="button" data-k="plan" aria-pressed="${kind === 'plan'}">Plan</button><button type="button" data-k="note" aria-pressed="${kind === 'note'}">Not</button></div>
        <button type="button" class="round-btn" data-x="close" aria-label="Kapat">${icon('x')}</button></div>
      <div class="cmp-field"><textarea rows="1" enterkeyhint="done" autocapitalize="sentences" autocomplete="off" placeholder="${kind === 'note' ? 'Aklındakini yaz…' : 'Ne yapacaksın?'}"></textarea></div>
      <div class="cmp-pv"></div>
      <div class="picker" hidden></div>
      <div class="cmp-ex"><div class="cmp-ex-h">${icon('sparkle')}Hızlı öneriler</div><div class="chips-row">${EXAMPLES.map(([e, g]) => `<button type="button" data-ex="${esc(e)}">${icon(g)}${esc(e)}</button>`).join('')}</div></div>
      <div class="cmp-bar">
        ${voiceSupported() ? `<button type="button" class="mic-big" aria-label="Konuş">${icon('mic')}</button>` : ''}
        <div class="cmp-status"><b>${voiceSupported() ? 'Dokun ve konuş' : 'Yaz ve ekle'}</b><span>“Her cuma 12’de babaannemi ara”</span></div>
        <button type="button" class="add-btn" disabled>Ekle${icon('up')}</button>
      </div>
    </div>`,
    onClose: () => abortDictation(),
  });
  const ta = $('textarea', sh.body), pv = $('.cmp-pv', sh.body), picker = $('.picker', sh.body), ex = $('.cmp-ex', sh.body);
  const mic = $('.mic-big', sh.body), addBtn = $('.add-btn', sh.body), status = $('.cmp-status', sh.body);
  ta.value = text;

  const current = () => {
    if (!st.parsed) return null;
    const p = { ...st.parsed, ...st.over };
    if (p.repeat === 'weekly' && !p.weekdays?.length) p.weekdays = [weekday(p.date || today())];
    if (p.repeat !== 'none' && !p.date) p.date = day || today();
    return p;
  };
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 132) + 'px'; };
  const setStatus = (title, sub = '', cls = '') => { status.className = 'cmp-status ' + cls; status.innerHTML = `<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`; };

  let aiTimer;
  function reparse(flash = false) {
    const value = ta.value.trim();
    addBtn.disabled = !value;
    ex.hidden = Boolean(value);
    if (st.kind === 'note' || !value) { st.parsed = null; pv.innerHTML = ''; closePicker(); return; }
    const prev = current();
    if (st.aiFor !== value) { st.ai = false; st.parsed = parse(value, { tz: tz(), items: get().items }); }
    if (!st.parsed.date && !st.parsed.time && st.parsed.repeat === 'none' && day && !st.locks.date) st.parsed.date = day;
    if (st.parsed.kind === 'note' && !st.locks.kind) { setKind('note', false); return; }
    renderPreview(prev, flash);
    clearTimeout(aiTimer);
    if (st.parsed.doubt?.length && linked && !st.ai && value.length > 5) {
      aiTimer = setTimeout(async () => {
        try {
          const { result } = await aiParse(value, tz());
          if (result?.title && ta.value.trim() === value) { st.parsed = { ...st.parsed, ...result, reminders: st.parsed.reminders ?? result.reminders, surprise: null }; st.ai = true; st.aiFor = value; renderPreview(null, true); }
        } catch { /* kural sonucu kalır */ }
      }, 900);
    }
  }

  function renderPreview(prev, flash) {
    const p = current();
    if (!p) return;
    const t = today();
    const changed = k => flash || (prev && JSON.stringify(prev[k]) !== JSON.stringify(p[k]));
    const rem = remOf(p);
    const key = st.over.icon || catOf({ title: p.title, icon: '', bill: p.bill });
    const chip = (pick, ic, label, cls = '') => `<button type="button" class="chip ${cls} ${st.picker === pick ? 'act' : ''}" data-pick="${pick}">${icon(ic)}${esc(label)}</button>`;
    const fl = (...keys) => (keys.some(changed) ? 'flash' : '');
    let chips;
    if (p.bill) {
      chips = [chip('bill', 'bill', whenLabel(p, t), fl('date', 'bill')), chip('time', 'clock', p.time || get().prefs.allDayTime, fl('time')), chip('bill', 'bell', billRemindLabel(p.bill), fl('bill'))];
    } else {
      chips = [chip('when', p.repeat !== 'none' ? 'repeat' : p.date ? 'cal' : 'inbox', whenLabel(p, t), fl('date', 'repeat')),
        chip('time', 'clock', p.time ? (p.endTime ? `${p.time}–${p.endTime}` : p.time) : 'Saat ekle', `${p.time ? '' : 'off'} ${p.timeGuess && !st.locks.time ? 'guess' : ''} ${fl('time')}`)];
      if (p.date) chips.push(chip('remind', 'bell', rem.length ? remindersLabel(rem, !p.time) : p.time ? 'Hatırlatma yok' : 'Hatırlatma ekle', `${rem.length ? '' : 'off'} ${fl('reminders')}`));
      if (p.date && p.nag) chips.push(chip('remind', 'again', nagShort(p.nag), fl('nag')));
    }
    if (p.surprise) chips.push(`<span class="chip ai">${icon('sparkle')}${'time' in st.over || 'date' in st.over ? '' : p.surprise.day ? 'Gün ve saat benden · ' : 'Saat benden · '}Nota da yazılır</span>`);
    if (st.ai) chips.push(`<span class="chip ai">${icon('sparkle')}AI</span>`);
    pv.innerHTML = `<div class="pv-title"><button type="button" class="pv-ico" data-pick="icon" aria-label="İkon seç">${tile(key)}</button><span>${esc(p.title || '…')}</span></div><div class="chips">${chips.join('')}</div>`;
  }

  function openPicker(name) {
    st.picker = st.picker === name ? '' : name;
    if (!st.picker) return closePicker();
    const p = current(), t = today();
    let html = '';
    if (name === 'when') {
      st.month = st.month || (p.date || t).slice(0, 7);
      html = `<div class="picker-row">${quickDays(p.repeat === 'none' ? p.date : '', t)}<button type="button" class="chip ${!p.date ? 'on' : ''}" data-date="">Tarihsiz</button></div>
        ${calendarHTML(p.repeat === 'none' ? p.date : '', st.month, t)}<div class="pk-sub">Tekrar</div>${repeatHTML(p)}`;
    } else if (name === 'time') {
      html = `${wheelHTML(p.time || (p.bill ? get().prefs.allDayTime : ''))}<div class="picker-row center"><button type="button" class="chip" data-time-clear>Saati kaldır</button></div>`;
    } else if (name === 'remind') {
      html = reminderHTML(remOf(p), { allDay: !p.time, at: get().prefs.allDayTime }) + nagHTML(p.nag);
    } else if (name === 'icon') {
      html = iconGridHTML(st.over.icon ?? '', catOf({ title: p.title, icon: '', bill: p.bill }));
    }
    picker.innerHTML = html;
    picker.hidden = false;
    picker.classList.remove('in'); void picker.offsetWidth; picker.classList.add('in');
    if (name === 'time') {
      if (!p.time) setOver('time', p.bill ? get().prefs.allDayTime : '09:00');
      bindWheel(picker, v => { setOver('time', v); renderPreview(null); });
    }
    renderPreview(null);
  }
  function closePicker() { st.picker = ''; picker.hidden = true; picker.innerHTML = ''; }
  const refreshPicker = () => { const n = st.picker; st.picker = ''; openPicker(n); };
  const setOver = (k, v) => { st.over[k] = v; st.locks[k] = true; };
  function setKind(k, lock = true) {
    st.kind = k;
    if (lock) st.locks.kind = true;
    const seg = $('.kind-seg', sh.body);
    seg.style.setProperty('--i', k === 'note' ? 1 : 0);
    $$('button', seg).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
    ta.placeholder = k === 'note' ? 'Aklındakini yaz…' : 'Ne yapacaksın?';
    reparse();
  }

  sh.body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.x === 'close') return sh.close();
    if (b.dataset.k) { haptic(); return setKind(b.dataset.k); }
    if (b.dataset.ex) { ta.value = b.dataset.ex; grow(); haptic(); return reparse(true); }
    if (b.dataset.pick === 'bill') {
      haptic(); ta.blur(); stopDictation();
      return openBill({ draft: { ...current(), icon: st.over.icon || '' }, onSaved: () => sh.close() });
    }
    if (b.dataset.pick) { haptic(); ta.blur(); return openPicker(b.dataset.pick); }
    const p = current();
    if (!p) return;
    if ('date' in b.dataset || b.dataset.calDay) {
      const d = b.dataset.calDay || b.dataset.date;
      setOver('date', d); setOver('repeat', 'none'); setOver('interval', 1); setOver('monthDay', 0); setOver('weekdays', []);
      if (!d) { setOver('time', ''); setOver('endTime', ''); }
      haptic(); refreshPicker(); return;
    }
    if (b.dataset.calNav) { st.month = shiftMonth(st.month, +b.dataset.calNav); haptic(); return refreshPicker(); }
    if (b.dataset.rep) { const n = applyRepeat(p, b.dataset.rep, today()); for (const k of ['date', 'repeat', 'interval', 'weekdays']) setOver(k, n[k]); haptic(); return refreshPicker(); }
    if (b.dataset.wday) { setOver('weekdays', toggleWeekday(p, +b.dataset.wday).weekdays); haptic(); return refreshPicker(); }
    if ('timeClear' in b.dataset) { setOver('time', ''); setOver('endTime', ''); haptic(); closePicker(); return renderPreview(null); }
    if (b.dataset.int) { setOver('interval', intervalOf($('[data-intv]', picker).value, b.dataset.int)); haptic(); return refreshPicker(); }
    if (b.dataset.rem) { setOver('reminders', toggleReminder(remOf(p), b.dataset.rem)); haptic(); return refreshPicker(); }
    if (isNagButton(b)) { setOver('nag', applyNag(p.nag, b)); haptic(); return refreshPicker(); }
    if (b.dataset.rc || b.dataset.unit) {
      const v = handleCustom(b);
      if (v !== null) { const cur = remOf(p); if (!cur.includes(v)) setOver('reminders', sortRems([...cur, v])); haptic('success'); refreshPicker(); }
      return;
    }
    if ('ico' in b.dataset) { setOver('icon', b.dataset.ico); haptic(); closePicker(); return renderPreview(null); }
  });

  sh.body.addEventListener('change', e => {
    if (e.target.dataset.intv !== undefined) { setOver('interval', intervalOf(e.target.value)); refreshPicker(); }
  });
  let t0;
  ta.addEventListener('input', () => { grow(); clearTimeout(t0); t0 = setTimeout(() => reparse(), 90); });
  ta.addEventListener('focus', () => { if (st.picker) closePicker(), renderPreview(null); });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
  addBtn.addEventListener('click', () => submit());

  if (mic) mic.addEventListener('click', () => {
    if (listening()) { stopDictation(); haptic(); return; }
    ta.blur();
    closePicker();
    // Önce başlat (iOS kullanıcı dokunuşunu ister), sonra titreşim.
    startDictation({
      base: ta.value,
      onText: (value, final) => { ta.value = value; grow(); reparse(final); },
      onState: (state, msg) => {
        const busy = state === 'listening' || state === 'starting';
        mic.classList.toggle('on', busy);
        mic.innerHTML = icon(busy ? 'stop' : 'mic');
        if (state === 'starting') setStatus('Hazırlanıyor…', 'İzin sorulursa İzin Ver’e dokun', 'live');
        else if (state === 'listening') setStatus('Dinliyorum…', 'Susunca kendiliğinden durur', 'live');
        else if (state === 'error') setStatus('Ses alınamadı', msg, 'err');
        else setStatus(ta.value.trim() ? 'Hazır' : 'Dokun ve konuş', ta.value.trim() ? 'Kontrol et, Ekle’ye dokun' : '“Her cuma 12’de babaannemi ara”');
      },
    });
    haptic();
  });

  async function submit() {
    const value = ta.value.trim();
    if (!value) return;
    stopDictation();
    ta.blur();
    if (st.kind === 'note') {
      const r = parse(value, { tz: tz() });
      const note = { id: uid(), text: (r.kind === 'note' && r.title) || value, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await commit(s => { s.notes.unshift(note); });
      haptic('success'); sh.close();
      toast('Not eklendi', { label: 'Geri al', run: () => commit(s => { s.notes = s.notes.filter(n => n.id !== note.id); }) });
      sync();
      return;
    }
    if (!st.parsed) reparse();
    // Özel süre yazılıp "Ekle"ye basılmadıysa yine de sayılır.
    const typed = current()?.bill ? null : withTypedReminder(picker, remOf(current() || {}));
    if (typed) setOver('reminders', typed);
    const p = current();
    if (!p?.title) { toast('Ne ekleyeceğimi anlamadım, biraz daha yaz.'); return; }
    let item;
    try { item = cleanItem(toItem({ ...p, icon: st.over.icon || '' })); item.icon = st.over.icon || ''; } catch (e) { toast(e.message); return; }
    // "Bu hafta hatırlat": zamanı ben seçtim, iş ayrıca notlarda dursun
    const note = p.surprise ? { id: uid(), text: surpriseNote(item.title, item.date, item.time), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : null;
    await commit(s => { s.items.push(item); if (note) s.notes.unshift(note); });
    haptic('success');
    ctx.enter = item.id;
    if (item.date && ctx.tab === 'plan' && ctx.mode === 'day' && item.repeat === 'none') ctx.day = item.date;
    sh.close();
    ctx.render();
    setTimeout(() => { ctx.enter = null; }, 700);
    toast(`Eklendi · ${whenLabel(item, today())}${item.time ? ' ' + item.time : ''}${note ? ' · nota da yazıldı' : ''}`, { label: 'Geri al', run: () => commit(s => { s.items = s.items.filter(i => i.id !== item.id); if (note) s.notes = s.notes.filter(n => n.id !== note.id); }).then(() => sync()) });
    sync();
  }

  grow();
  reparse();
  return sh;
}

// ---------------- Plan düzenleme ----------------
export function openItem(id, origin) {
  const base = get().items.find(i => i.id === id);
  if (!base) return;
  if (base.bill) return openBill({ id, origin });
  let d = structuredClone(base);
  const occ = origin && d.repeat !== 'none' ? occurrence(d, origin) : null;
  const t = today(), prefs = get().prefs;
  const remSel = () => remOf(d);
  const isDone = statusOf(base, origin || base.date) === 'done';
  const now0 = Date.now(), cur0 = occ || occurrence(base, base.date);
  const canSnooze = statusOf(base, origin || base.date) === 'pending' && (base.repeat === 'none' ? Boolean(base.date) : Boolean(occ));
  const z = canSnooze ? snoozeOf(cur0) : null;
  const waiting = z && z.until > now0 ? z : null;
  // Saati gelmiş planda erteleme doğrudan açık gelir; ayrıca bir düğmeye basmak gerekmez.
  const due = canSnooze && (waiting || zonedMs(cur0.date, baseTime(cur0, prefs), tz()) <= now0 + 60 * MINUTE);
  let open = due ? 'snooze' : '', month = (d.date || t).slice(0, 7), typed = '';
  const row = (key, ic, label, value, cls = '') => `<button type="button" class="cell ${open === key ? 'opened' : ''} ${cls}" data-x="${key}"><span class="cell-ic soft">${icon(ic)}</span><span class="cell-label">${label}</span><span class="cell-value">${value}</span>${icon('chevD', 'chev rot')}</button>`;
  const body = () => `<div class="form">
    <div class="ed-head"><button type="button" class="pv-ico big" data-x="icon" aria-label="İkon seç">${tile(catOf(d), 'lg')}</button>
      <input class="title-input" value="${esc(d.title)}" data-f="title" aria-label="Başlık" enterkeyhint="done"></div>
    ${open === 'icon' ? `<div class="group pad in">${iconGridHTML(d.icon, catOf({ title: d.title, icon: '' }))}</div>` : ''}
    ${canSnooze ? `<div class="group">${row('snooze', 'again', 'Ertele', waiting ? esc(whenAt(waiting.until, tz(), t)) : '')}
      ${open === 'snooze' ? `<div class="exp in">${snoozeHTML(waiting, typed)}</div>` : ''}</div>` : ''}
    <div class="group">
      ${row('date', 'cal', d.repeat === 'none' ? 'Tarih' : 'Başlangıç', d.date ? esc(longDate(d.date, t)) : 'Yapılacaklar')}
      ${open === 'date' ? `<div class="exp in"><div class="picker-row">${quickDays(d.date, t)}<button type="button" class="chip ${d.date ? '' : 'on'}" data-date="">Tarihsiz</button></div>${calendarHTML(d.date, month, t)}</div>` : ''}
      ${d.date ? row('time', 'clock', 'Saat', d.time || 'Yok') : ''}
      ${open === 'time' ? `<div class="exp in">${wheelHTML(d.time)}<div class="picker-row center"><button type="button" class="chip" data-x="notime">Saati kaldır</button></div></div>` : ''}
      ${d.time ? row('end', 'clock', 'Bitiş', d.endTime || 'Yok') : ''}
      ${open === 'end' ? `<div class="exp in">${wheelHTML(d.endTime || d.time)}<div class="picker-row center"><button type="button" class="chip" data-x="noend">Bitişi kaldır</button></div></div>` : ''}
    </div>
    ${d.date ? `<div class="group" style="margin-top:14px">${row('rep', 'repeat', 'Tekrar', d.repeat === 'none' ? 'Yok' : esc(repeatLabel(d)))}
      ${open === 'rep' ? `<div class="exp in">${repeatHTML(d)}</div>` : ''}</div>` : ''}
    ${d.date ? `<div class="section-h">Telegram hatırlatması</div><div class="group pad">${reminderHTML(remSel(), { allDay: !d.time, at: prefs.allDayTime })}${nagHTML(d.nag)}</div>` : ''}
    <div class="section-h">Not</div><div class="group"><textarea class="note-input" data-f="note" placeholder="Ayrıntı ekle" rows="3">${esc(d.note || '')}</textarea></div>
    <div class="group"><button type="button" class="cell" data-x="done"><span class="cell-ic green">${icon(isDone ? 'undo' : 'check')}</span><span class="cell-label">${isDone ? 'Tamamlanmadı olarak işaretle' : 'Tamamlandı'}${occ ? `<small>Sadece ${esc(dayLabel(occ.date, t))}</small>` : ''}</span></button></div>
    ${occ ? `<div class="section-h">Sadece ${esc(dayLabel(occ.date, t))}</div><div class="group">
      <button type="button" class="cell" data-x="skip"><span class="cell-ic gray">${icon('skip')}</span><span class="cell-label">Bu günü atla</span></button>
      <button type="button" class="cell" data-x="tomorrow"><span class="cell-ic orange">${icon('move')}</span><span class="cell-label">Bu günü yarına taşı</span></button></div>` : ''}
    <div class="group" style="margin-top:26px"><button type="button" class="cell danger" data-x="delete">Planı sil</button></div>
  </div>`;
  const sh = sheet({ title: d.repeat !== 'none' ? 'Tekrarlayan plan' : 'Plan', right: 'Bitti', body: body(), onRight: () => save() });
  const read = () => { for (const el of $$('[data-f]', sh.body)) d[el.dataset.f] = el.value; };
  const rerender = () => {
    read();
    const y = sh.body.scrollTop;
    sh.body.innerHTML = body();
    sh.body.scrollTop = y;
    if (open === 'snooze' && typed) previewSnooze();
    if (open === 'time' || open === 'end') bindWheel($('.exp', sh.body), v => {
      if (open === 'time') d.time = v; else d.endTime = v;
      const val = $(`[data-x="${open}"] .cell-value`, sh.body);
      if (val) val.textContent = v;
    });
  };
  const toggle = key => { open = open === key ? '' : key; if (key === 'time' && !d.time) d.time = '09:00'; if (key === 'end' && !d.endTime) d.endTime = d.time; haptic(); rerender(); };
  function previewSnooze() {
    const input = $('[data-szv]', sh.body);
    if (input) paintSnooze(input, parseUntil(input.value, { now: Date.now(), tz: tz(), bare: true }), tz(), t);
  }
  // Her zaman dokunulan / yazılan andan sayılır.
  async function snoozeTo(until) {
    read();
    const now = Date.now();
    let item;
    try { item = merged(); } catch (err) { toast(err.message); return; }
    if (!item) return;
    const key = item.repeat === 'none' ? item.date : origin || item.date;
    if (!item.date || !activeOn(item, key)) { toast('Bu gün artık tekrarın içinde değil.'); return; }
    const o = occurrence(item, key), prev = o.snooze || null;
    const write = snooze => commit(s => { const i = s.items.findIndex(x => x.id === id); if (i >= 0) s.items[i] = patchOccurrence(s.items[i], key, { snooze }); });
    await commit(s => { const i = s.items.findIndex(x => x.id === id); if (i >= 0) s.items[i] = patchOccurrence(item, key, { snooze: until ? makeSnooze(o, until, now) : null }); });
    haptic('success'); sh.close(); sync(true);
    toast(until ? `Ertelendi · ${whenAt(until, tz(), today())}${link() ? '' : ' · Telegram bağlı değil'}` : 'Erteleme kaldırıldı', { label: 'Geri al', run: () => write(prev).then(() => sync(true)) });
  }
  sh.body.addEventListener('input', e => {
    if (e.target.dataset.szv !== undefined) { typed = e.target.value; previewSnooze(); }
  });
  sh.body.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.dataset.szv === undefined) return;
    e.preventDefault();
    $('[data-sz="typed"]:not([disabled])', sh.body)?.click();
  });
  sh.body.addEventListener('change', e => {
    if (e.target.dataset.intv !== undefined) { d.interval = intervalOf(e.target.value); rerender(); }
  });
  sh.body.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const x = b.dataset.x;
    if (['icon', 'date', 'time', 'end', 'rep', 'snooze'].includes(x)) return toggle(x);
    read();
    if (b.dataset.sz) {
      const v = b.dataset.sz, now = Date.now();
      const until = v === 'clear' ? null : v === 'typed' ? parseUntil(typed, { now, tz: tz(), bare: true }) : now + Number(v) * MINUTE;
      if (v !== 'clear' && !until) return previewSnooze();
      return snoozeTo(until);
    }
    if ('ico' in b.dataset) { d.icon = b.dataset.ico; open = ''; haptic(); return rerender(); }
    if ('date' in b.dataset || b.dataset.calDay) {
      d.date = b.dataset.calDay || b.dataset.date;
      d.monthDay = 0;
      if (!d.date) { d.time = ''; d.endTime = ''; d.repeat = 'none'; d.interval = 1; d.weekdays = []; open = ''; }
      else if (d.repeat === 'weekly' && d.weekdays.length === 1) d.weekdays = [weekday(d.date)];
      haptic(); return rerender();
    }
    if (b.dataset.calNav) { month = shiftMonth(month, +b.dataset.calNav); haptic(); return rerender(); }
    if (b.dataset.rep) { d = applyRepeat(d, b.dataset.rep, t); haptic(); return rerender(); }
    if (b.dataset.wday) { d = toggleWeekday(d, +b.dataset.wday); haptic(); return rerender(); }
    if (b.dataset.int) { d.interval = intervalOf($('[data-intv]', sh.body).value, b.dataset.int); haptic(); return rerender(); }
    if (b.dataset.rem) { d.reminders = toggleReminder(remSel(), b.dataset.rem); haptic(); return rerender(); }
    if (isNagButton(b)) { d.nag = applyNag(d.nag, b); haptic(); return rerender(); }
    if (b.dataset.rc || b.dataset.unit) { const v = handleCustom(b); if (v !== null && !remSel().includes(v)) { d.reminders = sortRems([...remSel(), v]); haptic('success'); rerender(); } return; }
    if (x === 'notime') { d.time = ''; d.endTime = ''; open = ''; return rerender(); }
    if (x === 'noend') { d.endTime = ''; open = ''; return rerender(); }
    if (x === 'done') {
      const next = isDone ? 'pending' : 'done';
      await commit(s => {
        const i = s.items.findIndex(z => z.id === id);
        s.items[i] = base.date ? patchOccurrence(s.items[i], origin || base.date, donePatch(base, next, t)) : { ...s.items[i], status: next, updatedAt: new Date().toISOString() };
      });
      haptic('success'); sh.close(); toast(next === 'done' ? 'Tamamlandı' : 'Geri alındı'); sync(); return;
    }
    if (x === 'skip' || x === 'tomorrow') {
      const patch = x === 'skip' ? { status: 'cancelled' } : { date: dayAdd(occ.date, 1) };
      await commit(s => { const i = s.items.findIndex(z => z.id === id); s.items[i] = patchOccurrence(s.items[i], origin, patch); });
      haptic(); sh.close(); toast(x === 'skip' ? 'Bu gün atlandı' : 'Yarına taşındı'); sync(); return;
    }
    if (x === 'delete') {
      let choice;
      if (d.repeat !== 'none' && origin) choice = await actions('Tekrarlayan plan', [{ label: 'Sadece bu günü sil', value: 'one' }, { label: 'Tüm seriyi sil', value: 'all', danger: true }]);
      else choice = (await confirmDanger('Bu plan silinsin mi?', 'Planı sil')) ? 'all' : null;
      if (!choice) return;
      const before = structuredClone(base);
      await commit(s => {
        if (choice === 'one') { const i = s.items.findIndex(z => z.id === id); s.items[i] = patchOccurrence(s.items[i], origin, { status: 'cancelled' }); }
        else s.items = s.items.filter(z => z.id !== id);
      });
      haptic(); sh.close();
      toast(choice === 'one' ? 'Bu gün silindi' : 'Plan silindi', { label: 'Geri al', run: () => commit(s => { s.items = s.items.filter(z => z.id !== id).concat(before); }).then(() => sync()) });
      sync();
    }
  });
  // Bu sayfa açıkken Telegram'dan tamamlanmış ya da ertelenmiş olabilir: o alanlar güncel kayıttan gelir.
  function merged() {
    const cur = get().items.find(i => i.id === id);
    if (!cur) return null;
    const rem = withTypedReminder(sh.body, remSel());
    return cleanItem({
      ...d, ...(rem ? { reminders: rem } : {}), endTime: d.time ? d.endTime : '', status: d.repeat === 'none' ? cur.status : 'pending', exceptions: cur.exceptions,
      snooze: cur.repeat === 'none' ? cur.snooze : null, updatedAt: new Date().toISOString(),
    });
  }
  async function save() {
    read();
    if (!d.title.trim()) { toast('Başlık boş olamaz.'); return; }
    let item;
    try { item = merged(); } catch (e) { toast(e.message); return; }
    if (item) await commit(s => { const i = s.items.findIndex(z => z.id === id); if (i >= 0) s.items[i] = item; });
    haptic('success'); sh.close(); sync();
  }
}

// ---------------- Not ----------------
export function openNote(id) {
  const note = get().notes.find(n => n.id === id);
  if (!note) return;
  const sh = sheet({
    title: 'Not', right: 'Bitti',
    body: `<div class="form"><div class="group" style="margin-top:8px"><textarea class="note-input" style="min-height:38vh" aria-label="Not">${esc(note.text)}</textarea></div>
      <div class="group" style="margin-top:20px"><button type="button" class="cell" data-x="plan"><span class="cell-ic">${icon('plan')}</span><span class="cell-label">Plana çevir</span>${icon('chevR', 'chev')}</button></div>
      <div class="group" style="margin-top:20px"><button type="button" class="cell danger" data-x="del">Notu sil</button></div>
      <p class="section-f">${new Date(note.createdAt).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' })}</p></div>`,
    onRight: async api => {
      const value = $('textarea', api.body).value.trim();
      if (!value) await commit(s => { s.notes = s.notes.filter(n => n.id !== id); });
      else if (value !== note.text) await commit(s => { const n = s.notes.find(z => z.id === id); n.text = value; n.updatedAt = new Date().toISOString(); });
      api.close();
    },
  });
  sh.body.addEventListener('click', async e => {
    const x = e.target.closest('[data-x]')?.dataset.x;
    if (x === 'del') {
      await commit(s => { s.notes = s.notes.filter(n => n.id !== id); });
      haptic(); sh.close();
      toast('Not silindi', { label: 'Geri al', run: () => commit(s => { s.notes.unshift(note); }) });
    }
    if (x === 'plan') {
      const value = $('textarea', sh.body).value.trim();
      sh.close();
      setTimeout(() => openCompose({ text: value }), 250);
    }
  });
}
