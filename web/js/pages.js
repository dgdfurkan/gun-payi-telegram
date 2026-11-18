// Notlar, Özet (haftalık değerlendirme) ve Ayarlar.
import { itemsOn, dayAdd, mondayOf, dayLabel, MONTHS, remindersLabel, patchOccurrence, isTime } from './core.js';
import { get, commit, backupText, parseBackup } from './store.js';
import { icon } from './icons.js';
import { $, esc, haptic, toast, sheet, confirmDanger, copyText, actions } from './ui.js';
import { ctx, today } from './ctx.js';
import * as api from './api.js';
import { itemRow } from './plan.js';
import { VERSION } from './version.js';

const head = (title, sub = '') => `<div class="topbar"><h2>${esc(title)}</h2></div><div class="large"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;

// ---------------- Notlar ----------------
export function renderNotes() {
  const q = ctx.noteQuery.trim().toLocaleLowerCase('tr');
  const notes = [...get().notes].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const list = q ? notes.filter(n => n.text.toLocaleLowerCase('tr').includes(q)) : notes;
  const fmt = iso => { const d = new Date(iso); const t = today(); const day = d.toLocaleDateString('sv-SE'); return day === t ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }); };
  let body = '';
  if (!notes.length) body = `<div class="empty">${icon('notes')}<b>Henüz not yok</b>Aklına geleni yaz ya da Telegram'dan “not: …” gönder.<br><button type="button" data-act="add-note">+ Not ekle</button></div>`;
  else if (!list.length) body = `<div class="empty">Sonuç yok.</div>`;
  else body = `<div class="group">${list.map(n => {
    const [first, ...rest] = n.text.split('\n');
    return `<button type="button" class="note" data-act="note" data-id="${esc(n.id)}"><b>${esc(first)}</b><span><time>${fmt(n.updatedAt || n.createdAt)}</time>${esc(rest.join(' ').trim() || '')}</span></button>`;
  }).join('')}</div>`;
  return `${head('Notlar', notes.length ? `${notes.length} not` : '')}<div class="page">
    ${notes.length ? `<label class="search"><svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg><input type="search" placeholder="Ara" value="${esc(ctx.noteQuery)}" data-input="note-q" enterkeyhint="search"></label>` : ''}
    ${body}</div>`;
}

// ---------------- Özet ----------------
const QUESTIONS = ['Bu hafta iyi giden ne oldu?', 'Seni en çok ne zorladı?', 'Neyi erteledin, neden?', 'Gelecek hafta en önemli üç şey?', 'Kendine nasıl iyi bakacaksın?'];
export function renderReview() {
  const s = get(), t = today(), mon = mondayOf(t);
  let total = 0, done = 0;
  const open = [];
  for (let i = 0; i < 7; i++) {
    const d = dayAdd(mon, i);
    if (d > t) break;
    for (const o of itemsOn(s.items, d)) {
      total++;
      if (o.status === 'done') done++;
      else if (d < t) open.push(o);
    }
  }
  const upcoming = Array.from({ length: 7 }, (_, i) => itemsOn(s.items, dayAdd(mon, 7 + i)).length).reduce((a, b) => a + b, 0);
  const inbox = s.items.filter(i => !i.date && i.status === 'pending').length;
  const review = s.reviews.find(r => r.week === mon) || { answers: [] };
  const end = dayAdd(mon, 6);
  const range = `${+mon.slice(8)} ${MONTHS[+mon.slice(5, 7) - 1]} – ${+end.slice(8)} ${MONTHS[+end.slice(5, 7) - 1]}`;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const past = s.reviews.filter(r => r.week !== mon && r.answers.some(a => a?.trim())).sort((a, b) => b.week.localeCompare(a.week)).slice(0, 8);
  return `${head('Özet', range)}<div class="page">
    <div class="stats">
      <div class="stat"><b>${done}<small style="font-size:17px;color:var(--label-2);font-weight:500"> / ${total}</small></b><span>Bu hafta tamamlanan</span><div class="bar"><i style="width:${pct}%"></i></div></div>
      <div class="stat"><b>${upcoming}</b><span>Gelecek hafta plan${inbox ? ` · ${inbox} yapılacak` : ''}</span></div>
    </div>
    ${open.length ? `<div class="section-h">Açık kalanlar</div><div class="list">${open.slice(0, 12).map(o => `<div class="item" data-act="open" data-id="${esc(o.id)}" data-origin="${esc(o.origin)}">
        <div class="item-main"><div class="item-title">${esc(o.title)}</div><div class="item-meta"><span>${icon('cal')}${esc(dayLabel(o.date, t))}${o.time ? ' ' + o.time : ''}</span></div></div>
        <div class="mini-actions"><button type="button" data-act="carry" data-id="${esc(o.id)}" data-origin="${esc(o.origin)}">Bugüne</button><button type="button" data-act="toggle" data-id="${esc(o.id)}" data-origin="${esc(o.origin)}">${icon('check')}</button></div></div>`).join('')}</div>
      <p class="section-f">Bitmeyenler kendiliğinden taşınmaz; istersen bugüne al.</p>` : ''}
    <div class="section-h">Haftalık değerlendirme</div>
    <div class="group">${QUESTIONS.map((q, i) => `<div class="q"><label for="q${i}">${esc(q)}</label><textarea id="q${i}" rows="1" data-q="${i}" placeholder="Kısa bir not…">${esc(review.answers[i] || '')}</textarea></div>`).join('')}</div>
    <p class="section-f">Cevaplar yalnız bu cihazda saklanır.</p>
    ${past.length ? `<div class="section-h">Önceki haftalar</div><div class="group">${past.map(r => `<button type="button" class="cell" data-act="past-review" data-week="${r.week}"><span class="cell-label">${+r.week.slice(8)} ${MONTHS[+r.week.slice(5, 7) - 1]} haftası<small>${esc((r.answers.find(a => a?.trim()) || '').slice(0, 60))}</small></span>${icon('chevR', 'chev')}</button>`).join('')}</div>` : ''}
  </div>`;
}

// ---------------- Ayarlar ----------------
let linkInfo = null, linkErr = '', statusCache = null;
export function renderSettings() {
  const s = get(), l = api.link();
  const initial = (s.prefs.name || 'G').trim()[0].toLocaleUpperCase('tr');
  const sync = api.lastSync();
  let tg = '';
  if (l) {
    const nx = sync?.next || statusCache?.next;
    const nextText = nx ? new Date(nx).toLocaleString('tr-TR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'yok';
    tg = `<div class="group">
      <div class="cell"><span class="cell-ic tg">${icon('tg')}</span><span class="cell-label"><span class="status-dot on"></span>Bağlı${l.name ? ` · ${esc(l.name)}` : ''}<small>Sıradaki hatırlatma: ${esc(nextText)}</small></span></div>
      <button type="button" class="cell" data-act="tg-test" data-delay="0"><span class="cell-ic">${icon('send')}</span><span class="cell-label">Deneme mesajı gönder</span></button>
      <button type="button" class="cell" data-act="tg-test" data-delay="60"><span class="cell-ic orange">${icon('clock')}</span><span class="cell-label">1 dk sonra dene<small>Uygulamayı kapat, mesaj yine gelsin</small></span></button>
      <label class="cell"><span class="cell-ic green">${icon('sun')}</span><span class="cell-label">Sabah özeti</span>${s.prefs.digest.on ? `<input type="time" value="${s.prefs.digest.time}" data-input="digest-time" style="margin-right:8px">` : ''}<span class="switch"><input type="checkbox" data-input="digest" ${s.prefs.digest.on ? 'checked' : ''}><span></span></span></label>
      <label class="cell"><span class="cell-ic gray">${icon('pause')}</span><span class="cell-label">Hatırlatmaları duraklat</span><span class="switch"><input type="checkbox" data-input="pause" ${sync?.paused || statusCache?.paused ? 'checked' : ''}><span></span></span></label>
    </div>
    <p class="section-f">${sync?.error ? `Son eşitleme hatası: ${esc(sync.error)}` : 'Planların hatırlatma için kendi sunucuna eşitlenir. Bota yazarak ya da sesli mesajla da ekleyebilirsin.'}</p>`;
  } else {
    const waiting = api.linking();
    tg = linkErr
      ? `<div class="group"><div class="cell"><span class="cell-ic tg">${icon('tg')}</span><span class="cell-label">Telegram botu hazır değil<small>${esc(linkErr)}</small></span></div></div>`
      : `${linkInfo ? `<a class="big-btn tg" href="${esc(linkInfo.url)}" target="_blank" rel="noopener" data-act="tg-go">${icon('tg')}${waiting ? 'Telegram’ı tekrar aç' : 'Telegram’a bağlan'}</a>` : `<button type="button" class="big-btn tg" disabled>${icon('tg')}Hazırlanıyor…</button>`}
         <p class="section-f">${waiting ? '<b>Telegram’da Başlat’a dokun</b>, sonra buraya dön. Bağlantı kendiliğinden tamamlanır.' : 'Telegram açılır, <b>Başlat</b>’a dokunursun; hepsi bu. Hatırlatmalar saatine de gelir.'}</p>`;
  }
  const rem = s.prefs.reminderDefaults;
  return `${head('Ayarlar')}<div class="page">
    <div class="group"><div class="profile"><div class="avatar">${esc(initial)}</div><label style="flex:1;min-width:0"><input type="text" value="${esc(s.prefs.name)}" placeholder="Adın" data-input="name" enterkeyhint="done" autocomplete="given-name"><small>Selamlamada ve sabah özetinde kullanılır</small></label></div></div>
    <div class="section-h">Telegram</div>${tg}
    <div class="section-h">Varsayılan hatırlatma</div>
    <div class="group"><div class="cell" style="flex-wrap:wrap;gap:8px">${[[0, 'Tam vaktinde'], [5, '5 dk'], [10, '10 dk'], [15, '15 dk'], [30, '30 dk'], [60, '1 saat'], [1440, '1 gün']].map(([v, lb]) => `<button type="button" class="chip ${rem.includes(v) ? 'on' : ''}" data-act="def-rem" data-v="${v}" style="box-shadow:none;${rem.includes(v) ? '' : 'background:var(--fill)'}">${lb}</button>`).join('')}</div></div>
    <p class="section-f">Saatli planlarda, ayrıca seçmediysen: ${esc(rem.length ? remindersLabel(rem) : 'hatırlatma yok')}.</p>
    <div class="section-h">Hızlı ekleme</div>
    <div class="group"><button type="button" class="cell" data-act="widget"><span class="cell-ic">${icon('widget')}</span><span class="cell-label">Ana ekran widget’ı<small>Uygulamayı açmadan sesle ekle</small></span>${icon('chevR', 'chev')}</button></div>
    <div class="section-h">Veri</div>
    <div class="group">
      <button type="button" class="cell" data-act="backup-copy"><span class="cell-ic green">${icon('copy')}</span><span class="cell-label">Yedeği kopyala</span></button>
      <button type="button" class="cell" data-act="backup-paste"><span class="cell-ic orange">${icon('inbox')}</span><span class="cell-label">Yedeği yapıştır<small>Eski Gün Payı yedeği de olur</small></span></button>
    </div>
    <p class="section-f">Veriler bu telefonda saklanır. Yedek, Telegram bağlantı anahtarını içermez.</p>
    <div class="group" style="margin-top:28px"><button type="button" class="cell danger" data-act="${l ? 'tg-unlink' : 'wipe'}">${l ? 'Telegram bağlantısını kes' : 'Tüm verileri sil'}</button></div>
    ${l ? `<div class="group" style="margin-top:12px"><button type="button" class="cell danger" data-act="wipe">Tüm verileri sil</button></div>` : ''}
    <p class="version">Gün Payı ${VERSION}</p></div>`;
}

// Bağlantı linkini önceden hazırla: iOS, kullanıcının dokunduğu gerçek bir linki daha güvenle açar.
export async function prepareLink(force = false) {
  if (api.link()) return;
  if (linkInfo && !force && Date.now() < linkInfo.until) return;
  try {
    const r = await api.startLink();
    linkInfo = { ...r, until: Date.now() + 13 * 60000 };
    linkErr = '';
  } catch (e) {
    linkInfo = null;
    linkErr = e.code === 'no-bot' ? 'Sunucuda BOT_TOKEN tanımlı değil. Cloudflare → Worker → Ayarlar → Değişkenler’e ekle.' : e.message;
  }
  if (ctx.tab === 'settings') ctx.render();
  return linkInfo;
}
export const linkState = () => ({ info: linkInfo, err: linkErr });

let poll = null;
export function watchLink() {
  clearInterval(poll);
  poll = setInterval(async () => {
    if (document.hidden) return;
    const st = await api.checkLink().catch(() => 'pending');
    if (st === 'linked') { clearInterval(poll); haptic('success'); toast('Telegram bağlandı ✓'); linkInfo = null; ctx.render(); }
    if (st === 'expired' || st === 'none') { clearInterval(poll); linkInfo = null; prepareLink(true); }
  }, 2500);
}
export async function checkLinkNow() {
  if (!api.linking()) return;
  const st = await api.checkLink().catch(() => 'pending');
  if (st === 'linked') { clearInterval(poll); haptic('success'); toast('Telegram bağlandı ✓'); linkInfo = null; ctx.render(); }
}

export async function refreshStatus() {
  if (!api.link()) return;
  try { statusCache = await api.status(); if (ctx.tab === 'settings') ctx.render(); } catch { /* çevrimdışı */ }
}

function widgetSheet() {
  const l = api.link();
  const token = api.token();
  const url = location.origin + '/api/quick';
  sheet({
    title: 'Widget', left: 'Kapat',
    body: `<div class="form">
      <p class="section-f" style="padding-top:12px;font-size:15px;color:var(--label)">Ana ekrandaki tek dokunuşla konuş: <i>“Her cuma 12’de babaannemi ara”</i>. Uygulama açılmadan plana eklenir, Telegram’dan hatırlatılır. Siri dikte eder, izin bir kez sorulur.</p>
      ${l ? `<div class="section-h">1 · Bağlantı kodunu kopyala</div>
      <div class="code-box"><span style="flex:1">${esc(token.slice(0, 10))}••••••</span><button type="button" data-x="copy">Kopyala</button></div>
      <div class="section-h">2 · Kısayolu kur</div>
      <div data-shortcut hidden><a class="big-btn" href="/kisayol.shortcut">${icon('widget')}Kısayolu ekle</a>
      <p class="section-f">Kısayollar açılınca “Bağlantı kodu” sorusuna kopyaladığın kodu yapıştır.</p></div>
      <ol class="steps" data-manual><li>Kısayollar → <b>+</b> → adını <b>Gün Payı’na ekle</b> yap.</li><li><b>Metni Dikte Et</b> ekle, Dil: <b>Türkçe</b>.</li><li><b>URL’nin İçeriğini Al</b> ekle. URL: <code style="word-break:break-all">${esc(url)}</code><br>Yöntem <b>POST</b> · Başlıklar: <b>Authorization</b> = <code>Bearer</code> + boşluk + kod · İstek Gövdesi <b>JSON</b>: <b>text</b> = Dikte Edilen Metin.</li><li><b>Bildirim Göster</b> ekle: URL’nin İçeriği.</li></ol>
      <div class="section-h">3 · Ana ekrana koy</div>
      <ol class="steps"><li>Ana ekranda boş bir yere basılı tut.</li><li>Sol üstte <b>+</b> → <b>Kısayollar</b>.</li><li><b>Gün Payı’na ekle</b> kısayolunu seç, <b>Widget Ekle</b>.</li></ol>`
      : `<div class="empty">${icon('tg')}<b>Önce Telegram’a bağlan</b>Widget, planı senin sunucuna gönderir; bunun için bağlantı gerekir.</div>`}
    </div>`,
    onMount: sh => {
      sh.body.addEventListener('click', async e => {
        if (e.target.closest('[data-x=copy]')) { haptic(); toast((await copyText(token)) ? 'Kod kopyalandı' : 'Kopyalanamadı'); }
      });
      // İmzalı kısayol dosyası yayımlandıysa tek dokunuşla kurulum; yoksa elle adımlar.
      fetch('/kisayol.shortcut', { method: 'HEAD', cache: 'no-store' }).then(r => {
        const ok = r.ok && !(r.headers.get('content-type') || '').includes('html');
        const box = sh.body.querySelector('[data-shortcut]'), manual = sh.body.querySelector('[data-manual]');
        if (ok && box) { box.hidden = false; manual.hidden = true; }
      }).catch(() => {});
    },
  });
}

async function pasteBackup() {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch { /* izin yok, elle */ }
  const apply = async raw => {
    let data;
    try { data = parseBackup(raw); } catch (e) { toast(e.message); return false; }
    const s = get();
    const sum = `${data.items.length} plan, ${data.notes.length} not${data.legacy ? ' (eski uygulama)' : ''}`;
    const choice = s.items.length || s.notes.length
      ? await actions(`Yedekte ${sum} var.`, [{ label: 'Mevcut verilere ekle', value: 'merge' }, { label: 'Her şeyi yedekle değiştir', value: 'replace', danger: true }])
      : 'replace';
    if (!choice) return false;
    const before = structuredClone({ items: s.items, notes: s.notes, reviews: s.reviews, prefs: s.prefs });
    await commit(d => {
      if (choice === 'replace') { d.items = data.items; d.notes = data.notes; d.reviews = data.reviews; d.prefs = { ...data.prefs, timeZone: d.prefs.timeZone }; }
      else {
        const ids = new Set(d.items.map(i => i.id)); d.items.push(...data.items.filter(i => !ids.has(i.id)));
        const nids = new Set(d.notes.map(n => n.id)); d.notes.push(...data.notes.filter(n => !nids.has(n.id)));
        const weeks = new Set(d.reviews.map(r => r.week)); d.reviews.push(...data.reviews.filter(r => !weeks.has(r.week)));
      }
      d.onboarded = true;
    });
    haptic('success');
    toast(`Yüklendi: ${sum}`, { label: 'Geri al', run: () => commit(d => Object.assign(d, before)) });
    api.sync();
    return true;
  };
  if (text.trim().startsWith('{')) { await apply(text); return; }
  const sh = sheet({
    title: 'Yedeği yapıştır', right: 'Yükle',
    body: `<div class="form"><p class="section-f" style="padding-top:12px">Eski uygulamada <b>Ayarlar → Yedeği kopyala</b>’ya dokun, sonra buraya yapıştır.</p><div class="group" style="margin-top:10px"><textarea class="note-input" style="min-height:30vh;font:13px ui-monospace,Menlo,monospace" placeholder="{ … }" aria-label="Yedek"></textarea></div></div>`,
    onRight: async api2 => { if (await apply($('textarea', api2.body).value)) api2.close(); },
  });
  $('textarea', sh.body).focus({ preventScroll: true });
}

function pastReview(week) {
  const r = get().reviews.find(x => x.week === week);
  if (!r) return;
  sheet({ title: `${+week.slice(8)} ${MONTHS[+week.slice(5, 7) - 1]} haftası`, left: 'Kapat', body: `<div class="form"><div class="group" style="margin-top:8px">${QUESTIONS.map((q, i) => `<div class="q"><label>${esc(q)}</label><div style="white-space:pre-wrap;-webkit-user-select:text;user-select:text">${esc(r.answers[i] || 'Boş')}</div></div>`).join('')}</div></div>` });
}

let qTimer, nameTimer;
export const pageActs = {
  note: el => import('./compose.js').then(m => m.openNote(el.dataset.id)),
  'add-note': () => import('./compose.js').then(m => m.openCompose({ kind: 'note' })),
  carry: async el => {
    const { id, origin } = el.dataset;
    await commit(s => { const i = s.items.findIndex(x => x.id === id); if (i < 0) return; s.items[i] = s.items[i].repeat === 'none' ? { ...s.items[i], date: today() } : patchOccurrence(s.items[i], origin, { date: today() }); });
    haptic(); toast('Bugüne alındı'); api.sync();
  },
  'past-review': el => pastReview(el.dataset.week),
  'tg-go': () => { watchLink(); setTimeout(() => ctx.render(), 400); },
  'tg-test': async el => {
    haptic();
    try { await api.test(+el.dataset.delay); toast(+el.dataset.delay ? '1 dk içinde Telegram’a gelecek' : 'Gönderildi, Telegram’a bak'); } catch (e) { toast(e.message); }
  },
  'tg-unlink': async () => {
    if (!(await confirmDanger('Telegram bağlantısı kesilsin mi? Planların telefonda kalır.', 'Bağlantıyı kes'))) return;
    await api.unlink(); toast('Bağlantı kesildi'); prepareLink(true); ctx.render();
  },
  'def-rem': el => {
    const v = +el.dataset.v; haptic();
    commit(s => { const r = s.prefs.reminderDefaults; s.prefs.reminderDefaults = r.includes(v) ? r.filter(x => x !== v) : [...r, v].sort((a, b) => b - a); });
    api.sync();
  },
  widget: () => widgetSheet(),
  'backup-copy': async () => { haptic(); toast((await copyText(backupText())) ? 'Yedek panoya kopyalandı' : 'Kopyalanamadı'); },
  'backup-paste': () => pasteBackup(),
  wipe: async () => {
    if (!(await confirmDanger('Bu telefondaki tüm planlar ve notlar silinsin mi? Geri alınamaz.', 'Hepsini sil'))) return;
    if (api.link()) await api.unlink();
    await commit(s => { s.items = []; s.notes = []; s.reviews = []; s.sync = { cursor: 0 }; });
    toast('Silindi');
  },
};

// Yazma alanları (yeniden çizimde odak kaybolmasın diye sessiz kayıt).
export function onInput(el) {
  const k = el.dataset.input;
  if (k === 'note-q') {
    ctx.noteQuery = el.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      const pos = el.selectionStart;
      ctx.render();
      const n = document.querySelector('[data-input=note-q]');
      if (n) { n.focus({ preventScroll: true }); n.setSelectionRange(pos, pos); }
    }, 180);
  }
  if (k === 'name') { clearTimeout(nameTimer); nameTimer = setTimeout(() => { commit(s => { s.prefs.name = el.value.trim().slice(0, 40); }, { silent: true }); api.sync(); }, 400); }
  if (el.dataset.q !== undefined) {
    el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px';
    clearTimeout(qTimer);
    const i = +el.dataset.q, mon = mondayOf(today()), v = el.value;
    qTimer = setTimeout(() => commit(s => {
      let r = s.reviews.find(x => x.week === mon);
      if (!r) { r = { week: mon, answers: ['', '', '', '', ''], updatedAt: '' }; s.reviews.push(r); }
      r.answers[i] = v.slice(0, 2000); r.updatedAt = new Date().toISOString();
    }, { silent: true }), 500);
  }
}
export async function onChange(el) {
  const k = el.dataset.input;
  if (k === 'digest') { haptic(); await commit(s => { s.prefs.digest.on = el.checked; }); api.sync(true); }
  if (k === 'digest-time' && isTime(el.value)) { await commit(s => { s.prefs.digest.time = el.value; }, { silent: true }); api.sync(true); }
  if (k === 'pause') { haptic(); try { statusCache = await api.pause(el.checked); } catch (e) { toast(e.message); el.checked = !el.checked; } }
}
