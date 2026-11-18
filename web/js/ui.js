// Ortak arayüz parçaları: alt sayfa, işlem menüsü, bildirim, dokunsal geri bildirim.
import { icon } from './icons.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// iOS 18+: gizli "switch" etiketine tıklamak sistem titreşimini tetikler. Android'de vibrate.
let hapticLabel;
export function haptic(kind = 'light') {
  try {
    if (navigator.vibrate) { navigator.vibrate(kind === 'success' ? [8, 40, 8] : 8); return; }
    if (!hapticLabel) {
      const input = document.createElement('input');
      input.type = 'checkbox'; input.setAttribute('switch', ''); input.id = 'haptic-x'; input.hidden = true;
      hapticLabel = document.createElement('label');
      hapticLabel.htmlFor = 'haptic-x'; hapticLabel.hidden = true;
      document.body.append(input, hapticLabel);
    }
    hapticLabel.click();
    if (kind === 'success') setTimeout(() => hapticLabel.click(), 90);
  } catch { /* desteklenmiyor */ }
}

// --- Bildirim (toast) ---
let toastTimer;
export function toast(text, action) {
  const el = $('#toast');
  clearTimeout(toastTimer);
  el.innerHTML = `<span>${esc(text)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { hide(); action.run(); };
  el.classList.add('show');
  const hide = () => el.classList.remove('show');
  toastTimer = setTimeout(hide, action ? 4500 : 2400);
}

// --- Alt sayfa (iOS kart modalı) ---
const stack = [];
export function sheet({ title = '', left = 'Vazgeç', right = '', rightDisabled = false, body = '', cls = '', onRight, onClose, onMount, full = true, nav = true }) {
  const root = document.createElement('div');
  root.className = 'sheet-root';
  root.innerHTML = `<div class="sheet-backdrop"></div>
    <section class="sheet ${full ? 'full' : 'auto'} ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="grabber"></div>
      ${nav ? `<header class="sheet-nav">
        <button type="button" class="nav-btn" data-sheet="close">${esc(left)}</button>
        <h2>${esc(title)}</h2>
        ${right ? `<button type="button" class="nav-btn strong" data-sheet="right" ${rightDisabled ? 'disabled' : ''}>${esc(right)}</button>` : '<span class="nav-btn"></span>'}
      </header>` : ''}
      <div class="sheet-body">${body}</div>
    </section>`;
  document.body.append(root);
  const el = root.querySelector('.sheet');
  const untrack = trackKeyboard(el);
  const api = {
    root, el, body: root.querySelector('.sheet-body'),
    setRight(disabled) { const b = root.querySelector('[data-sheet=right]'); if (b) b.disabled = disabled; },
    close(result) {
      if (api.closed) return;
      api.closed = true;
      document.activeElement?.blur?.();
      untrack();
      root.classList.remove('open');
      root.classList.add('closing');
      stack.splice(stack.indexOf(api), 1);
      if (!stack.length) document.documentElement.classList.remove('sheet-open');
      onClose?.(result);
      setTimeout(() => root.remove(), reduced() ? 0 : 320);
    },
  };
  root.querySelector('.sheet-backdrop').onclick = () => api.close();
  root.querySelector('[data-sheet=close]')?.addEventListener('click', () => api.close());
  root.querySelector('[data-sheet=right]')?.addEventListener('click', () => onRight?.(api));
  dragToClose(api);
  stack.push(api);
  document.documentElement.classList.add('sheet-open');
  onMount?.(api);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
  return api;
}

// Klavye açılınca sayfa klavyenin üstüne çıkar (iOS'ta görünür alan küçülür, düzen alanı küçülmez).
function trackKeyboard(el) {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const update = () => {
    const kb = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
    el.style.setProperty('--kb', kb + 'px');
    el.classList.toggle('kb', kb > 80);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
  return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
}
export const topSheet = () => stack.at(-1);

// Sayfayı tutamaktan veya başlıktan aşağı sürükleyerek kapatma.
function dragToClose(api) {
  const el = api.el, handle = el.querySelector('.sheet-nav') || el.querySelector('.cmp-head') || el.querySelector('.grabber'), grab = el.querySelector('.grabber');
  let y0 = null, dy = 0;
  const down = e => { if (e.target.closest('button,input,textarea')) return; y0 = e.touches[0].clientY; dy = 0; el.style.transition = 'none'; };
  const move = e => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    el.style.transform = `translateY(${dy}px)`;
  };
  const up = () => {
    if (y0 === null) return;
    el.style.transition = '';
    el.style.transform = '';
    if (dy > 110) api.close();
    y0 = null;
  };
  for (const h of new Set([handle, grab])) {
    h.addEventListener('touchstart', down, { passive: true });
    h.addEventListener('touchmove', move, { passive: true });
    h.addEventListener('touchend', up);
  }
}

// --- İşlem menüsü (iOS action sheet) ---
export function actions(title, list) {
  return new Promise(resolve => {
    const root = document.createElement('div');
    root.className = 'sheet-root action-root';
    root.innerHTML = `<div class="sheet-backdrop"></div><div class="action-sheet" role="dialog" aria-modal="true">
      <div class="action-group">${title ? `<p class="action-title">${esc(title)}</p>` : ''}
      ${list.map((a, i) => `<button type="button" data-i="${i}" class="${a.danger ? 'danger' : ''}">${esc(a.label)}</button>`).join('')}</div>
      <div class="action-group"><button type="button" data-i="-1" class="strong">Vazgeç</button></div></div>`;
    document.body.append(root);
    const finish = i => {
      root.classList.remove('open');
      root.classList.add('closing');
      setTimeout(() => root.remove(), reduced() ? 0 : 300);
      resolve(i >= 0 ? list[i].value ?? i : null);
    };
    root.querySelector('.sheet-backdrop').onclick = () => finish(-1);
    root.querySelectorAll('button').forEach(b => { b.onclick = () => { haptic(); finish(+b.dataset.i); }; });
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
  });
}
export const confirmDanger = async (title, label) => (await actions(title, [{ label, danger: true, value: true }])) === true;

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export const row = ({ ic, label, value = '', act = '', chev = true, cls = '', data = '' }) =>
  `<button type="button" class="cell ${cls}" ${act ? `data-act="${act}"` : ''} ${data}>${ic ? `<span class="cell-ic">${icon(ic)}</span>` : ''}<span class="cell-label">${label}</span><span class="cell-value">${value}</span>${chev ? icon('chevR', 'chev') : ''}</button>`;

// Tema: data-theme + durum çubuğu rengi. "system" telefonun açık/koyu ayarını izler.
let followSystem = null;
export function applyTheme(name = 'light', animate = false) {
  try { localStorage.setItem('gp-theme', name); } catch { /* özel mod */ }
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const set = () => {
    document.documentElement.dataset.theme = name === 'system' ? (mq.matches ? 'dark' : 'light') : name;
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', bg || '#f3f4f8');
  };
  if (followSystem) mq.removeEventListener('change', followSystem);
  followSystem = name === 'system' ? set : null;
  if (followSystem) mq.addEventListener('change', followSystem);
  if (animate && document.startViewTransition && !reduced()) document.startViewTransition(set); else set();
}
