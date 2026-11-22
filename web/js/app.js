// Gün Payı · uygulama kabuğu: sekmeler, olay yönlendirme, karşılama, senkron.
import { load, get, subscribe, commit } from './store.js';
import * as api from './api.js';
import { ctx, today } from './ctx.js';
import { icon } from './icons.js';
import { $, $$, esc, haptic, applyTheme } from './ui.js';
import { renderPlan, planActs, bindSwipe, closeOpenRow } from './plan.js';
import { openCompose, openItem } from './compose.js';
import { openMove, installedApp, markRenewed } from './move.js';
import { bindHold } from './pickers.js';
import { renderNotes, renderReview, renderSettings, pageActs, onInput, onChange, prepareLink, linkState, watchLink, checkLinkNow, refreshStatus } from './pages.js';

const TABS = [['plan', 'Plan'], ['notes', 'Notlar'], ['add', ''], ['review', 'Özet'], ['settings', 'Ayarlar']];
const RENDER = { plan: renderPlan, notes: renderNotes, review: renderReview, settings: renderSettings };
const views = {};
let pending = false, renderedDay = '';

function shell() {
  $('#app').innerHTML = Object.keys(RENDER).map(k => `<main class="view" id="v-${k}" ${k === ctx.tab ? '' : 'hidden'}></main>`).join('')
    + `<nav class="tabbar" role="tablist">${TABS.map(([k, label]) => k === 'add'
      ? `<button type="button" class="tab add" data-act="add" aria-label="Ekle"><span class="plus">${icon('plus')}</span></button>`
      : `<button type="button" class="tab" role="tab" data-tab="${k}" aria-selected="${k === ctx.tab}">${icon(k)}<span>${label}</span></button>`).join('')}</nav>`;
  for (const k of Object.keys(RENDER)) {
    views[k] = $('#v-' + k);
    views[k].addEventListener('scroll', e => stick(e.currentTarget), { passive: true });
  }
  bindSwipe(views.plan);
}
const stick = v => v.querySelector('.appbar')?.classList.toggle('stuck', v.scrollTop > 4);

function render() {
  const v = views[ctx.tab];
  if (!v) return;
  const a = document.activeElement;
  if (a && v.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== 'checkbox') { pending = true; return; }
  pending = false;
  renderedDay = today();
  v.innerHTML = RENDER[ctx.tab]();
  stick(v);
  if (ctx.tab === 'review') for (const t of v.querySelectorAll('textarea[data-q]')) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
}
ctx.render = render;

function go(tab) {
  if (tab === ctx.tab) {
    views[tab].scrollTo({ top: 0, behavior: 'smooth' });
    if (tab === 'plan' && ctx.day !== today()) { ctx.day = today(); render(); }
    return;
  }
  views[ctx.tab].hidden = true;
  ctx.tab = tab;
  const v = views[tab];
  v.hidden = false;
  v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
  $$('.tab[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  render();
  if (tab === 'settings') { prepareLink(); refreshStatus(); }
}
ctx.go = go;

// --- olay yönlendirme ---
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab],[data-act]');
  if (!t || t.closest('.sheet-root')) return;
  if (t.dataset.tab) { haptic(); go(t.dataset.tab); return; }
  const act = t.dataset.act;
  if (act === 'add') {
    haptic();
    const day = t.dataset.day || (ctx.tab === 'plan' && ctx.day && ctx.day !== today() ? ctx.day : '');
    openCompose({ day, text: t.dataset.text || '', kind: ctx.tab === 'notes' ? 'note' : 'plan' });
    return;
  }
  if (act === 'open') {
    if (Date.now() - (ctx.swipedAt || 0) < 450) return;
    if (t.closest('.swipe.open, .swipe.open-l')) { closeOpenRow(); return; }
    haptic(); openItem(t.dataset.id, t.dataset.origin); return;
  }
  (planActs[act] || pageActs[act] || welcomeActs[act])?.(t, e);
});
document.addEventListener('input', e => { if (!e.target.closest('.sheet-root') && (e.target.dataset.input !== undefined || e.target.dataset.q !== undefined)) onInput(e.target); });
document.addEventListener('change', e => { if (!e.target.closest('.sheet-root') && e.target.dataset.input !== undefined) onChange(e.target); });
document.addEventListener('focusout', () => setTimeout(() => { if (pending) render(); }, 0));

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { api.flush(); return; }
  checkLinkNow();
  api.syncIfStale();
  if (renderedDay && renderedDay !== today()) { if (ctx.day === renderedDay) ctx.day = today(); render(); }
});

// --- karşılama ---
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
let welcomeEl = null, welcomeStep = 1;

function paintWelcome() {
  if (!welcomeEl) return;
  if (welcomeStep === 1) {
    welcomeEl.innerHTML = `${!standalone() && isIOS() ? `<div class="install-tip">${icon('share')}<span>Uygulama gibi açılması için Safari’de <b>Paylaş</b> → <b>Ana Ekrana Ekle</b>.</span></div>` : ''}
      <img class="logo" src="/icons/icon-192.png" alt="" width="84" height="84">
      <h1>Gün Payı</h1><p>Gününü planla. Söyle, eklensin. Saatinde Telegram’dan hatırlatsın.</p>
      <div class="feat">${icon('mic')}<div><b>Söyle, eklensin</b><span>“Her cuma 12’de babaannemi ara” yeter.</span></div></div>
      <div class="feat">${icon('tg')}<div><b>Telegram’dan hatırlatma</b><span>Uygulama kapalıyken de, saatine de gelir.</span></div></div>
      <div class="feat">${icon('inbox')}<div><b>Veriler telefonunda</b><span>Hesap yok, şifre yok.</span></div></div>
      <div class="grow"></div>
      <input type="text" placeholder="Adın (isteğe bağlı)" data-w="name" enterkeyhint="go" autocomplete="given-name" value="${esc(get().prefs.name)}">
      ${installedApp()
        ? `<button type="button" class="big-btn" data-act="backup-paste">${icon('copy')}Eski simgeden taşı</button>
      <button type="button" class="link" data-act="w-next">İlk kez kuruyorum, başla</button>`
        : `<button type="button" class="big-btn" data-act="w-next">Başla</button>
      <button type="button" class="link" data-act="backup-paste">Eski uygulamadan yedeğim var</button>`}`;
  } else {
    const { info, err } = linkState();
    welcomeEl.innerHTML = `<div style="font-size:64px;line-height:1;color:#2aabee">${icon('tg').replace('class="i ', 'style="width:72px;height:72px" class="i ')}</div>
      <h1>Hatırlatmalar Telegram’dan</h1><p>Telefon bildirimleri saate gelmeyebilir; Telegram gelir. Telegram açılır, <b>Başlat</b>’a dokunursun, bağlanır.</p>
      <div class="feat">${icon('bell')}<div><b>Saatinde haber</b><span>10 dk önce, 15 dk önce… sen seç.</span></div></div>
      <div class="feat">${icon('send')}<div><b>Bota yaz ya da konuş</b><span>Sesli mesajla da plan eklenir.</span></div></div>
      <div class="grow"></div>
      ${err ? `<p class="hint err">${esc(err)}</p>` : info ? `<a class="big-btn tg" href="${esc(info.url)}" target="_blank" rel="noopener" data-act="w-tg">${icon('tg')}${api.linking() ? 'Telegram’ı tekrar aç' : 'Telegram’a bağlan'}</a>` : `<button type="button" class="big-btn tg" disabled>${icon('tg')}Hazırlanıyor…</button>`}
      <button type="button" class="link" data-act="w-done">${api.linking() ? 'Başlat’a dokundum, devam' : 'Şimdilik geç'}</button>`;
  }
}
function welcome() {
  welcomeEl = document.createElement('div');
  welcomeEl.className = 'welcome';
  document.body.append(welcomeEl);
  paintWelcome();
}
async function finishWelcome() {
  await commit(s => { s.onboarded = true; });
  if (installedApp()) markRenewed();
  welcomeEl?.remove();
  welcomeEl = null;
  render();
}
const welcomeActs = {
  'w-next': async () => {
    haptic();
    const name = welcomeEl.querySelector('[data-w=name]').value.trim().slice(0, 40);
    await commit(s => { s.prefs.name = name; }, { silent: true });
    if (api.link()) return finishWelcome();
    welcomeStep = 2;
    paintWelcome();
    await prepareLink();
    paintWelcome();
  },
  'w-tg': () => { watchLink(); setTimeout(paintWelcome, 400); },
  'w-done': async () => { await checkLinkNow(); finishWelcome(); },
};
// --- açılış ---
(async () => {
  await load();
  const s = get();
  applyTheme(s.prefs.color, s.prefs.mode);
  ctx.mode = s.prefs.plannerMode;
  ctx.day = today();
  shell();
  render();
  subscribe(() => {
    // Yedek ya da taşıma karşılama ekranından yüklendiyse karşılama biter
    if (welcomeEl && get().onboarded) { welcomeEl.remove(); welcomeEl = null; }
    render();
  });
  bindHold();
  api.onLinkChange(() => { render(); if (welcomeEl && api.link()) finishWelcome(); });
  if (!s.onboarded) welcome();
  if (api.moving()) openMove();
  api.sync(true).then(r => { if (r) render(); });
  if ('serviceWorker' in navigator) {
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
    else {
      // Açılışın hemen ardından yeni sürüm devreye girerse bir kez yenile: eski stil ile yeni kod karışmasın.
      const hadController = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController && performance.now() < 10000 && !document.querySelector('.sheet-root, .welcome')) location.reload();
      });
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }
})();
