// Notlar, Özet (haftalık değerlendirme) ve Ayarlar.
import { itemsOn, dayAdd, mondayOf, dayLabel, MONTHS, remindersLabel, patchOccurrence, isTime } from './core.js';
import { get, commit, backupText, parseBackup } from './store.js';
import { icon } from './icons.js';
import { $, esc, haptic, toast, sheet, confirmDanger, copyText, actions, applyTheme } from './ui.js';
import { ctx, today } from './ctx.js';
import * as api from './api.js';
import { appbar, hero } from './chrome.js';
import { avatarHTML, openAvatarSheet } from './avatar.js';
import { catOf } from './categories.js';
import { tile } from './pickers.js';
import { VERSION } from './version.js';

const COLOR_DOTS = [['yesil', 'Nane', '#006c49', '#10b981'], ['indigo', 'İndigo', '#5140c8', '#7c6cf2'], ['mor', 'Lavanta', '#6b2fd3', '#9a6bff'], ['mavi', 'Okyanus', '#0b57d0', '#3b8bff'], ['gunbatimi', 'Gün batımı', '#b8430d', '#fb7a2b']];
const MODE_LIST = [['light', 'Açık'], ['dark', 'Koyu'], ['system', 'Sistem']];
const searchIcon = '<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>';

// ---------------- Notlar ----------------
export function renderNotes() {
  const q = ctx.noteQuery.trim().toLocaleLowerCase('tr');
  const notes = [...get().notes].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const list = q ? notes.filter(n => n.text.toLocaleLowerCase('tr').includes(q)) : notes;
  const fmt = iso => { const d = new Date(iso); const t = today(); const day = d.toLocaleDateString('sv-SE'); return day === t ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }); };
  let body = '';
  if (!notes.length) body = `<div class="empty"><div class="em-ic">${icon('notes')}</div><b>Henüz not yok</b>Aklına geleni yaz ya da Telegram'dan “not: …” gönder.<br><button type="button" data-act="add-note">+ Not ekle</button></div>`;
  else if (!list.length) body = `<div class="empty">Sonuç yok.</div>`;
  else body = `<div class="notes">${list.map(n => {
    const [first, ...rest] = n.text.split('\n');
    return `<button type="button" class="note" data-act="note" data-id="${esc(n.id)}"><b>${esc(first)}</b><span><time>${fmt(n.updatedAt || n.createdAt)}</time>${esc(rest.join(' ').trim() || '')}</span></button>`;
  }).join('')}</div>`;
  return `${appbar('Notlar')}<div class="page">
    ${hero('Aklındakiler', notes.length ? `${notes.length} Not` : 'Boş Defter')}
    ${notes.length ? `<label class="search">${searchIcon}<input type="search" placeholder="Notlarda ara" value="${esc(ctx.noteQuery)}" data-input="note-q" enterkeyhint="search"></label>` : ''}
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
  return `${appbar('Özet')}<div class="page">
    ${hero('Bu hafta', range)}
    <div class="stats">
      <div class="stat"><b>${done}<small> / ${total}</small></b><span>Tamamlanan Plan</span><div class="track"><i style="width:${pct}%"></i></div></div>
      <div class="stat"><b>${upcoming}</b><span>Gelecek Hafta Plan${inbox ? ` · ${inbox} Yapılacak` : ''}</span></div>
    </div>
    ${open.length ? `<div class="sec-h"><h3>Açık Kalanlar</h3><span>${open.length}</span></div><div class="tasks">${open.slice(0, 12).map(o => `<div class="task" data-act="open" data-id="${esc(o.id)}" data-origin="${esc(o.origin)}">
        ${tile(catOf(o))}<div class="task-main"><div class="task-title">${esc(o.title)}</div><div class="tags"><span class="tag">${icon('cal')}${esc(dayLabel(o.date, t))}${o.time ? ' ' + o.time : ''}</span></div></div>
        <div class="mini-actions"><button type="button" data-act="carry" data-id="${esc(o.id)}" data-origin="${esc(o.origin)}">Bugüne</button><button type="button" data-act="toggle" data-id="${esc(o.id)}" data-origin="${esc(o.origin)}" aria-label="Tamamla">${icon('check')}</button></div></div>`).join('')}</div>
      <p class="section-f">Bitmeyenler kendiliğinden taşınmaz; istersen bugüne al.</p>` : ''}
    <div class="sec-h"><h3>Haftalık Değerlendirme</h3></div>
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
      <label class="cell"><span class="cell-ic green">${icon('sun')}</span><span class="cell-label">Sabah özeti${s.prefs.digest.on ? `<small>Her gün ${s.prefs.digest.time}</small>` : ''}</span><span class="switch"><input type="checkbox" data-input="digest" ${s.prefs.digest.on ? 'checked' : ''}><span></span></span></label>
      <label class="cell"><span class="cell-ic gray">${icon('pause')}</span><span class="cell-label">Hatırlatmaları duraklat</span><span class="switch"><input type="checkbox" data-input="pause" ${sync?.paused || statusCache?.paused ? 'checked' : ''}><span></span></span></label>
    </div>
    <p class="section-f">${sync?.error ? `Son eşitleme hatası: ${esc(sync.error)}` : 'Bota yazarak ya da sesli mesajla da ekleyebilirsin.'}</p>`;
  } else {
    const waiting = api.linking();
    tg = linkErr
      ? `<div class="group"><div class="cell"><span class="cell-ic tg">${icon('tg')}</span><span class="cell-label">Telegram botu hazır değil<small>${esc(linkErr)}</small></span></div></div>`
      : `${linkInfo ? `<a class="big-btn tg" href="${esc(linkInfo.url)}" target="_blank" rel="noopener" data-act="tg-go">${icon('tg')}${waiting ? 'Telegram’ı tekrar aç' : 'Telegram’a bağlan'}</a>` : `<button type="button" class="big-btn tg" disabled>${icon('tg')}Hazırlanıyor…</button>`}
         <p class="section-f">${waiting ? '<b>Telegram’da Başlat’a dokun</b>, sonra buraya dön.' : 'Telegram açılır, <b>Başlat</b>’a dokunursun; hepsi bu.'}</p>`;
  }
  const rem = s.prefs.reminderDefaults;
  const modeIdx = Math.max(0, MODE_LIST.findIndex(([k]) => k === s.prefs.mode));
  return `${appbar('Ayarlar')}<div class="page">
    <div class="group"><div class="profile"><button type="button" class="profile-av" data-act="avatar" aria-label="Profil fotoğrafı">${avatarHTML('lg')}<span class="cam">${icon('camera')}</span></button><label style="flex:1;min-width:0"><input type="text" value="${esc(s.prefs.name)}" placeholder="Adın" data-input="name" enterkeyhint="done" autocomplete="given-name"><small>Fotoğrafa dokun: resim ve çerçeve seç</small></label></div></div>
    <div class="section-h">Görünüm</div>
    <div class="group">
      <div class="look"><span>Renk</span><div class="dots-pick">${COLOR_DOTS.map(([k, label, p, pc]) => `<button type="button" class="dot-c ${s.prefs.color === k ? 'on' : ''}" data-act="color" data-c="${k}" style="--dp:${p};--dc:${pc}" aria-label="${label}"></button>`).join('')}</div></div>
      <div class="look"><span>Mod</span><div class="seg" style="--i:${modeIdx}">${MODE_LIST.map(([k, label]) => `<button type="button" data-act="ui-mode" data-m="${k}" aria-pressed="${s.prefs.mode === k}">${label}</button>`).join('')}</div></div>
    </div>
    <div class="section-h">Telegram</div>${tg}
    <div class="section-h">Varsayılan hatırlatma</div>
    <div class="group pad"><div class="picker-row">${[[0, 'Vaktinde'], [5, '5 dk'], [10, '10 dk'], [15, '15 dk'], [30, '30 dk'], [60, '1 saat'], [1440, '1 gün']].map(([v, lb]) => `<button type="button" class="chip ${rem.includes(v) ? 'on' : ''}" data-act="def-rem" data-v="${v}">${lb}</button>`).join('')}</div></div>
    <div class="section-h">Hızlı ekleme</div>
    <div class="group"><button type="button" class="cell" data-act="widget"><span class="cell-ic">${icon('widget')}</span><span class="cell-label">Ana ekrandan ekle<small>Telegram widget’ı ya da Siri kısayolu</small></span>${icon('chevR', 'chev')}</button></div>
    <div class="section-h">Veri</div>
    <div class="group">
      <button type="button" class="cell" data-act="backup-copy"><span class="cell-ic green">${icon('copy')}</span><span class="cell-label">Yedeği kopyala</span></button>
      <button type="button" class="cell" data-act="backup-paste"><span class="cell-ic orange">${icon('inbox')}</span><span class="cell-label">Yedeği yapıştır<small>Eski Gün Payı yedeği de olur</small></span></button>
      ${l ? `<button type="button" class="cell danger" data-act="tg-unlink">Telegram bağlantısını kes</button>` : ''}
      <button type="button" class="cell danger" data-act="wipe">Tüm verileri sil</button>
    </div>
    <p class="version">Gün Payı ${VERSION} · Veriler bu telefonda</p></div>`;
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
  // Ana ekran uygulaması dış bağlantıları kendi içindeki tarayıcıda açar; o pencere kısayol dosyasını
  // Kısayollar'a veremez. x-safari-https gerçek Safari'yi açar, Safari dosyayı Kısayollar'a aktarır.
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const scHref = standalone ? `x-safari-https://${location.host}/kisayol.shortcut` : '/kisayol.shortcut';
  const bot = l?.bot || 'hatirlat_gunduz_bot';
  sheet({
    title: 'Ana ekrandan ekle', left: 'Kapat',
    body: `<div class="form">
      <div class="wg-hero"><div class="wg-ic">${icon('mic')}</div><div><b>Ana ekrandan tek dokunuşla ekle</b><span>İki yol var. İkisi de mikrofon iznini her seferinde sormaz.</span></div></div>
      ${l ? `
      <div class="section-h">1 · Telegram widget’ı · kurulumsuz</div>
      <div class="step"><span class="step-n">${icon('tg')}</span><div class="step-b"><b>Bot sohbetini ana ekrana koy</b>
        <div class="howto"><div>${icon('plan')}Ana ekranda boş yere basılı tut</div><div>${icon('plus')}Düzenle → Widget Ekle → Telegram</div><div>${icon('tg')}Widget’ı düzenle → Gün Payı botu</div></div>
        <p>Widget’a dokun, mikrofona basılı tutup konuş. Bot taslağı gösterir, <b>Ekle</b> dersin.</p>
        <a class="big-btn tg" href="https://t.me/${esc(bot)}" target="_blank" rel="noopener">${icon('tg')}Botu aç</a></div></div>
      <div class="section-h">2 · Siri kısayolu · uygulama açılmaz</div>
      <div class="step" data-step="1"><span class="step-n">1</span><div class="step-b"><b>Kısayolu ekle</b>
          <p>Dokununca kodun kopyalanır ve <b>Safari</b> açılır. İndirmek isterse <b>İndir</b>, sonra dosyaya dokun. Kısayollar “Bağlantı kodu” sorunca <b>yapıştır</b> → <b>Kısayol Ekle</b>.</p>
          <a class="big-btn" href="${scHref}" rel="noopener" data-x="sc">${icon('widget')}Kısayolu ekle</a></div></div>
      <div class="step"><span class="step-n">2</span><div class="step-b"><b>Widget’ı koy</b>
          <div class="howto"><div>${icon('plan')}Ana ekranda boş yere basılı tut</div><div>${icon('plus')}Düzenle → Widget Ekle</div><div>${icon('widget')}Kısayollar → Gün Payı’na ekle</div></div>
          <p>Dokun, “Yarın 9’da spor” de. Plana eklenir. “Hey Siri, Gün Payı’na ekle” de çalışır.</p></div></div>
      <details class="manual"><summary>Kısayol yine açılmazsa elle kur</summary><ol class="steps">
          <li>Kısayollar → <b>+</b> → <b>Metni Dikte Et</b> (Türkçe).</li>
          <li><b>URL’nin İçeriğini Al</b>: <code>${esc(url)}</code>, Yöntem <b>POST</b>, Başlık <b>Authorization</b> = <code>Bearer</code> + boşluk + kod, Gövde <b>JSON</b>: <b>text</b> = Dikte Edilen Metin.</li>
          <li><b>Bildirim Göster</b>: URL’nin İçeriği.</li></ol>
          <button type="button" class="chip" data-x="copy" style="margin:4px 0 6px">${icon('copy')}Kodu kopyala</button></details>`
      : `<div class="empty"><div class="em-ic">${icon('tg')}</div><b>Önce Telegram’a bağlan</b>İki yol da planı senin sunucuna gönderir; bunun için tek seferlik bağlantı gerekir.</div>`}
    </div>`,
    onMount: sh => sh.body.addEventListener('click', e => {
      const x = e.target.closest('[data-x]')?.dataset.x;
      if (x === 'sc') {
        copyText(token).then(ok => toast(ok ? 'Kod kopyalandı, Kısayollar’da yapıştır' : 'Kod kopyalanamadı, elle kopyala'));
        sh.body.querySelector('[data-step="1"]')?.classList.add('done');
        haptic('success');
      }
      if (x === 'copy') { haptic(); copyText(token).then(ok => toast(ok ? 'Kod kopyalandı' : 'Kopyalanamadı')); }
    }),
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
  avatar: () => { haptic(); openAvatarSheet(() => ctx.render()); },
  color: el => {
    const c = el.dataset.c;
    haptic();
    applyTheme(c, get().prefs.mode, true);
    commit(s => { s.prefs.color = c; });
  },
  'ui-mode': el => {
    const m = el.dataset.m;
    haptic();
    applyTheme(get().prefs.color, m, true);
    commit(s => { s.prefs.mode = m; });
  },
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
