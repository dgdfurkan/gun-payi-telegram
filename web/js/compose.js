// Ekleme (doğal dil + ses), plan düzenleme ve not sayfaları.
import { parse, toItem } from './parse.js';
import { cleanItem, dayAdd, dayLabel, repeatLabel, remindersLabel, summary, weekday, uid, occurrence, patchOccurrence, DAY_SHORT, isDate } from './core.js';
import { get, commit } from './store.js';
import { icon } from './icons.js';
import { $, $$, esc, haptic, toast, sheet, actions, confirmDanger } from './ui.js';
import { ctx, today, tz } from './ctx.js';
import { startDictation, stopDictation, abortDictation, listening, voiceSupported } from './voice.js';
import { link, aiParse, sync } from './api.js';

const REM_OPTS = [[0, 'Tam vaktinde'], [5, '5 dk'], [10, '10 dk'], [15, '15 dk'], [30, '30 dk'], [60, '1 saat'], [120, '2 saat'], [1440, '1 gün']];
const EXAMPLES = ["Her cuma 12'de babaannemi ara", "Yarın 9'da spor, 10 ve 15 dk önce hatırlat", 'Hafta içi her gün 07:30 ilaç', "Her ayın 5'inde kira öde", 'Ekmek al'];

// ---------------- Ekleme ----------------
export function openCompose({ day = '', text = '', kind = 'plan' } = {}) {
  const st = { kind, parsed: null, locks: {}, over: {}, picker: '', ai: false, aiFor: '', voiceMsg: '' };
  const linked = Boolean(link());
  const sh = sheet({
    title: 'Yeni', right: 'Ekle', rightDisabled: true, cls: 'compose-sheet',
    body: `<div class="compose">
      <div class="seg kind-seg" role="group"><button type="button" data-k="plan" aria-pressed="${kind === 'plan'}">Plan</button><button type="button" data-k="note" aria-pressed="${kind === 'note'}">Not</button></div>
      <div class="compose-box"><textarea rows="3" enterkeyhint="done" autocapitalize="sentences" autocomplete="off" spellcheck="true" placeholder="${kind === 'note' ? 'Aklındakini yaz…' : 'Ne yapacaksın? Örn: Her cuma 12’de babaannemi ara'}"></textarea>
      ${voiceSupported() ? `<button type="button" class="mic" aria-label="Sesle yaz">${icon('mic')}</button>` : ''}</div>
      <p class="hint">${icon('mic')}<span>Klavyedeki mikrofon izin sormadan yazar. Gün, saat, tekrar ve hatırlatmayı cümleden anlarım.</span></p>
      <div class="chips"></div><div class="picker" hidden></div>
      <div class="examples"><p>Örnekler</p>${EXAMPLES.map(e => `<button type="button" data-ex="${esc(e)}">${esc(e)}</button>`).join('')}</div>
    </div>`,
    onRight: () => submit(),
    onClose: () => abortDictation(),
  });
  const ta = $('textarea', sh.body), chipsEl = $('.chips', sh.body), picker = $('.picker', sh.body), hint = $('.hint span', sh.body), mic = $('.mic', sh.body), ex = $('.examples', sh.body);
  ta.value = text;
  ta.focus({ preventScroll: true });

  const current = () => {
    if (!st.parsed) return null;
    const p = { ...st.parsed, ...st.over };
    if (p.repeat === 'weekly' && !p.weekdays?.length) p.weekdays = [weekday(p.date || today())];
    if (p.repeat !== 'none' && !p.date) p.date = day || today();
    return p;
  };
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, innerHeight * .4) + 'px'; };

  let aiTimer;
  function reparse(flash = false) {
    const text = ta.value.trim();
    sh.setRight(!text);
    ex.hidden = Boolean(text);
    if (st.kind === 'note') { chipsEl.innerHTML = ''; picker.hidden = true; return; }
    if (!text) { st.parsed = null; chipsEl.innerHTML = ''; picker.hidden = true; return; }
    const prev = current();
    if (st.aiFor !== text) { st.ai = false; st.parsed = parse(text, { tz: tz() }); }
    if (!st.parsed.date && !st.parsed.time && st.parsed.repeat === 'none' && day && !st.locks.date) st.parsed.date = day;
    if (st.parsed.kind === 'note' && !st.locks.kind) { setKind('note', false); return; }
    renderChips(prev, flash);
    clearTimeout(aiTimer);
    if (st.parsed.doubt?.length && linked && !st.ai && text.length > 5) {
      aiTimer = setTimeout(async () => {
        try {
          const { result } = await aiParse(text, tz());
          if (result && ta.value.trim() === text && result.title) {
            st.parsed = { ...st.parsed, ...result };
            st.ai = true; st.aiFor = text;
            renderChips(null, true);
          }
        } catch { /* kural sonucu kalır */ }
      }, 900);
    }
  }

  function renderChips(prev, flash) {
    const p = current();
    if (!p) return;
    const defaults = get().prefs.reminderDefaults;
    const t = today();
    const changed = k => flash || (prev && JSON.stringify(prev[k]) !== JSON.stringify(p[k]));
    const when = p.repeat !== 'none' ? `${icon('repeat')}${esc(repeatLabel(p))}` : p.date ? `${icon('cal')}${esc(dayLabel(p.date, t))}` : `${icon('inbox')}Yapılacaklar`;
    const parts = [
      p.title ? `<div class="pv">${icon('check')}<span>${esc(p.title)}</span></div>` : '',
      `<button type="button" class="chip ${changed('date') || changed('repeat') ? 'flash' : ''}" data-pick="when">${when}</button>`,
      `<button type="button" class="chip ${p.time ? '' : 'off'} ${p.timeGuess && !st.locks.time ? 'guess' : ''} ${changed('time') ? 'flash' : ''}" data-pick="time">${icon('clock')}${p.time ? (p.endTime ? `${p.time}–${p.endTime}` : p.time) : 'Saat yok'}</button>`,
    ];
    if (p.time) {
      const rem = p.reminders ?? defaults;
      parts.push(`<button type="button" class="chip ${rem.length ? '' : 'off'} ${changed('reminders') ? 'flash' : ''}" data-pick="remind">${icon('bell')}${esc(rem.length ? remindersLabel(rem) : 'Hatırlatma yok')}</button>`);
    }
    if (st.ai) parts.push(`<span class="chip ai">${icon('sparkle')}AI</span>`);
    chipsEl.innerHTML = parts.join('');
    if (st.picker) renderPicker();
  }

  function renderPicker() {
    const p = current();
    if (!p || !st.picker) { picker.hidden = true; return; }
    const t = today();
    let html = '';
    if (st.picker === 'when') {
      const opt = (label, v) => `<button type="button" class="chip ${p.repeat === 'none' && p.date === v ? 'on' : ''}" data-date="${v}">${label}</button>`;
      html += `<div class="picker-row">${opt('Bugün', t)}${opt('Yarın', dayAdd(t, 1))}${opt('Yapılacaklar', '')}<input type="date" value="${p.date || ''}" data-dateinput aria-label="Tarih seç"></div>`;
      const rep = (label, v, wd = '') => `<button type="button" class="chip ${p.repeat === v && (!wd || p.weekdays.join() === wd) ? 'on' : ''}" data-rep="${v}" data-wd="${wd}">${label}</button>`;
      html += `<div class="picker-row">${rep('Tekrar yok', 'none')}${rep('Her gün', 'daily')}${rep('Hafta içi', 'weekly', '1,2,3,4,5')}${rep('Hafta sonu', 'weekly', '6,0')}${rep('Haftalık', 'weekly')}${rep('Aylık', 'monthly')}</div>`;
      if (p.repeat === 'weekly') html += `<div class="picker-row"><div class="wdays" style="width:100%">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" data-wday="${d}" aria-pressed="${p.weekdays.includes(d)}">${DAY_SHORT[d]}</button>`).join('')}</div></div>`;
    } else if (st.picker === 'time') {
      html += `<div class="picker-row"><input type="time" value="${p.time || ''}" data-timeinput aria-label="Saat">${['09:00', '12:00', '18:00', '21:00'].map(v => `<button type="button" class="chip ${p.time === v ? 'on' : ''}" data-time="${v}">${v}</button>`).join('')}<button type="button" class="chip ${p.time ? '' : 'on'}" data-time="">Saat yok</button></div>`;
    } else if (st.picker === 'remind') {
      const rem = p.reminders ?? get().prefs.reminderDefaults;
      html += `<div class="picker-row">${REM_OPTS.map(([v, l]) => `<button type="button" class="chip ${rem.includes(v) ? 'on' : ''}" data-rem="${v}">${l}</button>`).join('')}<button type="button" class="chip ${rem.length ? '' : 'on'}" data-rem="none">Yok</button></div>`;
    }
    picker.innerHTML = html;
    picker.hidden = false;
  }

  const setOver = (k, v) => { st.over[k] = v; st.locks[k] = true; };
  function setKind(k, lock = true) {
    st.kind = k;
    if (lock) st.locks.kind = true;
    $$('.kind-seg button', sh.body).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
    ta.placeholder = k === 'note' ? 'Aklındakini yaz…' : 'Ne yapacaksın? Örn: Her cuma 12’de babaannemi ara';
    reparse();
  }

  sh.body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k) { haptic(); setKind(b.dataset.k); return; }
    if (b.dataset.ex) { ta.value = b.dataset.ex; grow(); reparse(true); return; }
    if (b.dataset.pick) { haptic(); st.picker = st.picker === b.dataset.pick ? '' : b.dataset.pick; renderPicker(); return; }
    if ('date' in b.dataset) { setOver('date', b.dataset.date); setOver('repeat', 'none'); haptic(); renderChips(null); return; }
    if (b.dataset.rep) {
      const p = current();
      setOver('repeat', b.dataset.rep);
      if (b.dataset.wd) setOver('weekdays', b.dataset.wd.split(',').map(Number));
      else if (b.dataset.rep === 'weekly') setOver('weekdays', p.weekdays?.length ? p.weekdays : [weekday(p.date || today())]);
      if (b.dataset.rep !== 'none' && !p.date) setOver('date', today());
      haptic(); renderChips(null); return;
    }
    if (b.dataset.wday) {
      const d = +b.dataset.wday, p = current();
      const set = new Set(p.weekdays); set.has(d) ? set.delete(d) : set.add(d);
      if (!set.size) return;
      setOver('weekdays', [...set]); haptic(); renderChips(null); return;
    }
    if ('time' in b.dataset) { setOver('time', b.dataset.time); if (!b.dataset.time) setOver('endTime', ''); haptic(); renderChips(null); return; }
    if (b.dataset.rem) {
      const p = current();
      let rem = [...(p.reminders ?? get().prefs.reminderDefaults)];
      if (b.dataset.rem === 'none') rem = [];
      else { const v = +b.dataset.rem; rem = rem.includes(v) ? rem.filter(x => x !== v) : [...rem, v]; }
      setOver('reminders', rem); haptic(); renderChips(null); return;
    }
  });
  sh.body.addEventListener('change', e => {
    if (e.target.matches('[data-dateinput]') && isDate(e.target.value)) { setOver('date', e.target.value); if (current().repeat === 'none') setOver('repeat', 'none'); renderChips(null); }
    if (e.target.matches('[data-timeinput]')) { setOver('time', e.target.value || ''); renderChips(null); }
  });

  let t0;
  ta.addEventListener('input', () => { grow(); clearTimeout(t0); t0 = setTimeout(() => reparse(), 90); });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });

  if (mic) mic.addEventListener('click', () => {
    if (listening()) { stopDictation(); return; }
    haptic();
    startDictation({
      base: ta.value,
      onText: (text, final) => { ta.value = text; grow(); reparse(final); },
      onState: (state, msg) => {
        mic.classList.toggle('on', state === 'listening');
        mic.innerHTML = icon(state === 'listening' ? 'stop' : 'mic');
        $('.hint', sh.body).classList.toggle('err', state === 'error');
        hint.textContent = state === 'listening' ? 'Dinliyorum… bitince dokun.' : state === 'error' ? msg : 'Klavyedeki mikrofon izin sormadan yazar. Gün, saat, tekrar ve hatırlatmayı cümleden anlarım.';
      },
    });
  });

  async function submit() {
    const text = ta.value.trim();
    if (!text) return;
    stopDictation();
    if (st.kind === 'note') {
      const clean = text.replace(/^not\s*:\s*/i, '');
      const note = { id: uid(), text: clean, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await commit(s => { s.notes.unshift(note); });
      haptic('success');
      sh.close();
      toast('Not eklendi', { label: 'Geri al', run: () => commit(s => { s.notes = s.notes.filter(n => n.id !== note.id); }) });
      sync();
      return;
    }
    reparse();
    const p = current();
    if (!p?.title) { toast('Başlık bulamadım, biraz daha yaz.'); return; }
    let item;
    try { item = cleanItem(toItem(p)); } catch (e) { toast(e.message); return; }
    await commit(s => { s.items.push(item); });
    haptic('success');
    ctx.enter = item.id;
    if (item.date && ctx.tab === 'plan' && ctx.mode === 'day' && item.repeat === 'none') ctx.day = item.date;
    sh.close();
    ctx.render();
    setTimeout(() => { ctx.enter = null; }, 600);
    toast(`Eklendi · ${summary(item, today()).split(' · ')[0] || 'Yapılacaklar'}`, { label: 'Geri al', run: () => commit(s => { s.items = s.items.filter(i => i.id !== item.id); }).then(() => sync()) });
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
  const d = structuredClone(base);
  const occ = origin && d.repeat !== 'none' ? occurrence(d, origin) : null;
  const t = today();
  const remSel = () => d.reminders ?? get().prefs.reminderDefaults;
  const body = () => `<div class="form">
    <div class="group" style="margin-top:8px"><input class="title-input" value="${esc(d.title)}" data-f="title" aria-label="Başlık" enterkeyhint="done"></div>
    <div class="section-h">Zaman</div>
    <div class="group">
      <label class="cell">${icon('cal')}<span class="cell-label">${d.repeat === 'none' ? 'Tarih' : 'Başlangıç'}</span>${d.date ? `<input type="date" value="${d.date}" data-f="date">` : `<button type="button" class="cell-value" data-x="setdate" style="color:var(--accent)">Tarih ekle</button>`}</label>
      ${d.date ? `<label class="cell">${icon('clock')}<span class="cell-label">Saat</span><input type="time" value="${d.time}" data-f="time"></label>` : ''}
      ${d.time ? `<label class="cell">${icon('clock')}<span class="cell-label">Bitiş</span><input type="time" value="${d.endTime}" data-f="endTime"></label>` : ''}
      ${d.date && d.repeat === 'none' ? `<button type="button" class="cell" data-x="nodate"><span class="cell-label" style="color:var(--accent)">Yapılacaklara taşı</span></button>` : ''}
    </div>
    ${d.date ? `<div class="section-h">Tekrar</div><div class="group"><div class="cell" style="flex-wrap:wrap;gap:8px">${[['none', 'Yok'], ['daily', 'Her gün'], ['weekly', 'Haftalık'], ['monthly', 'Aylık']].map(([v, l]) => `<button type="button" class="chip ${d.repeat === v ? 'on' : ''}" data-rep="${v}" style="box-shadow:none;background:${d.repeat === v ? '' : 'var(--fill)'}">${l}</button>`).join('')}</div>
      ${d.repeat === 'weekly' ? `<div class="cell"><div class="wdays" style="width:100%">${[1, 2, 3, 4, 5, 6, 0].map(x => `<button type="button" data-wday="${x}" aria-pressed="${d.weekdays.includes(x)}">${DAY_SHORT[x]}</button>`).join('')}</div></div>` : ''}
      ${d.repeat !== 'none' ? `<div class="cell"><span class="cell-label">${esc(repeatLabel(d))}</span></div>` : ''}</div>` : ''}
    ${d.time ? `<div class="section-h">Telegram hatırlatması</div><div class="group"><div class="cell" style="flex-wrap:wrap;gap:8px">${REM_OPTS.map(([v, l]) => `<button type="button" class="chip ${remSel().includes(v) ? 'on' : ''}" data-rem="${v}" style="box-shadow:none;${remSel().includes(v) ? '' : 'background:var(--fill)'}">${l}</button>`).join('')}</div></div>` : ''}
    <div class="section-h">Not</div><div class="group"><textarea class="note-input" data-f="note" placeholder="Ayrıntı ekle" rows="3">${esc(d.note || '')}</textarea></div>
    ${occ ? `<div class="section-h">Sadece ${esc(dayLabel(occ.date, t))}</div><div class="group">
      <button type="button" class="cell" data-x="skip"><span class="cell-ic gray">${icon('skip')}</span><span class="cell-label">Bu günü atla</span></button>
      <button type="button" class="cell" data-x="tomorrow"><span class="cell-ic orange">${icon('move')}</span><span class="cell-label">Bu günü yarına taşı</span></button></div>` : ''}
    <div class="group" style="margin-top:28px"><button type="button" class="cell danger" data-x="delete">Planı sil</button></div>
  </div>`;
  const sh = sheet({ title: d.repeat !== 'none' ? 'Tekrarlayan plan' : 'Plan', right: 'Bitti', body: body(), onRight: () => save() });
  const rerender = () => { const y = sh.body.scrollTop; sh.body.innerHTML = body(); sh.body.scrollTop = y; };
  const read = () => {
    for (const el of $$('[data-f]', sh.body)) d[el.dataset.f] = el.value;
    if (!d.time) d.endTime = '';
  };
  sh.body.addEventListener('change', () => { read(); if (!d.date && d.repeat !== 'none') d.repeat = 'none'; });
  sh.body.addEventListener('input', e => { if (e.target.matches('[data-f=time]')) { read(); } });
  sh.body.addEventListener('focusout', e => { if (e.target.matches('[data-f=time]')) { read(); rerender(); } });
  sh.body.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    read();
    if (b.dataset.rep) { d.repeat = b.dataset.rep; if (d.repeat === 'weekly' && !d.weekdays.length) d.weekdays = [weekday(d.date)]; haptic(); rerender(); return; }
    if (b.dataset.wday) { const x = +b.dataset.wday; const s = new Set(d.weekdays); s.has(x) ? s.delete(x) : s.add(x); if (s.size) d.weekdays = [...s]; haptic(); rerender(); return; }
    if (b.dataset.rem) { const v = +b.dataset.rem; const r = [...remSel()]; d.reminders = r.includes(v) ? r.filter(x => x !== v) : [...r, v]; haptic(); rerender(); return; }
    const x = b.dataset.x;
    if (x === 'setdate') { d.date = today(); rerender(); return; }
    if (x === 'nodate') { d.date = ''; d.time = ''; d.endTime = ''; d.repeat = 'none'; rerender(); return; }
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
  async function save() {
    read();
    if (!d.title.trim()) { toast('Başlık boş olamaz.'); return; }
    let item;
    try { item = cleanItem({ ...d, updatedAt: new Date().toISOString() }); } catch (e) { toast(e.message); return; }
    await commit(s => { const i = s.items.findIndex(z => z.id === id); if (i >= 0) s.items[i] = item; });
    haptic(); sh.close(); sync();
  }
}

// ---------------- Not ----------------
export function openNote(id) {
  const note = get().notes.find(n => n.id === id);
  if (!note) return;
  const sh = sheet({
    title: 'Not', right: 'Bitti',
    body: `<div class="form"><div class="group" style="margin-top:8px"><textarea class="note-input" style="min-height:40vh" aria-label="Not">${esc(note.text)}</textarea></div>
      <div class="group" style="margin-top:22px"><button type="button" class="cell" data-x="plan"><span class="cell-ic">${icon('plan')}</span><span class="cell-label">Plana çevir</span>${icon('chevR', 'chev')}</button></div>
      <div class="group" style="margin-top:22px"><button type="button" class="cell danger" data-x="del">Notu sil</button></div>
      <p class="section-f">${new Date(note.createdAt).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' })}</p></div>`,
    onRight: async api => {
      const text = $('textarea', api.body).value.trim();
      if (!text) await commit(s => { s.notes = s.notes.filter(n => n.id !== id); });
      else if (text !== note.text) await commit(s => { const n = s.notes.find(z => z.id === id); n.text = text; n.updatedAt = new Date().toISOString(); });
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
      const text = $('textarea', sh.body).value.trim();
      sh.close();
      setTimeout(() => openCompose({ text }), 200);
    }
  });
}
