// Profil fotoğrafı: seç, daire içinde kaydır/yakınlaştır, çerçeve seç. Yalnız bu telefonda (localStorage)
// tutulur; böylece uygulama açılır açılmaz beklemeden görünür. Yedeğe girmez.
import { get } from './store.js';
import { icon } from './icons.js';
import { $, $$, esc, haptic, toast, sheet } from './ui.js';

const KEY = 'gp-avatar';
export const FRAMES = [['none', 'Yok'], ['gold', 'Altın'], ['silver', 'Gümüş'], ['rose', 'Rose gold'], ['theme', 'Tema'], ['neon', 'Neon']];

export function loadAvatar() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function saveAvatar(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch { return false; }
}

// Her yerde aynı görünüm: fotoğraf varsa resim, yoksa adın baş harfi; seçilen çerçeve halkası.
export function avatarHTML(cls = '') {
  const a = loadAvatar();
  const name = get().prefs.name || '';
  const initial = esc((name.trim()[0] || 'G').toLocaleUpperCase('tr'));
  const frame = FRAMES.some(([k]) => k === a.frame) ? a.frame : 'none';
  return `<span class="av av-${frame} ${cls}">${a.img ? `<img src="${a.img}" alt="">` : `<b>${initial}</b>`}</span>`;
}

const V = 260; // kırpma dairesi (px)

export function openAvatarSheet(onDone) {
  let a = loadAvatar();
  let frame = a.frame || 'none';
  let crop = null; // { img, w, h, s, min, x, y }
  const sh = sheet({
    title: 'Profil fotoğrafı', right: 'Kaydet',
    body: `<div class="form av-form">
      <div class="crop-wrap"><div class="crop" aria-label="Fotoğrafı kaydır ve yakınlaştır">${a.img ? `<img class="crop-img static" src="${a.img}" alt="">` : `<div class="crop-empty">${icon('camera')}<span>Fotoğraf seç</span></div>`}</div>
        <div class="crop-ring av-${frame}"></div></div>
      <input type="range" class="zoom" min="1" max="4" step="0.01" value="1" aria-label="Yakınlaştır" hidden>
      <p class="crop-hint" hidden>Parmağınla kaydır, iki parmakla yakınlaştır</p>
      <div class="section-h">Çerçeve</div>
      <div class="frames">${FRAMES.map(([k, l]) => `<button type="button" class="fr ${frame === k ? 'on' : ''}" data-fr="${k}"><span class="av av-${k}">${a.img ? `<img src="${a.img}" alt="">` : '<b></b>'}</span><span>${l}</span></button>`).join('')}</div>
      <div class="group">
        <label class="cell"><span class="cell-ic">${icon('camera')}</span><span class="cell-label">${a.img ? 'Yeni fotoğraf seç' : 'Fotoğraf seç'}</span><input type="file" accept="image/*" hidden></label>
        ${a.img ? `<button type="button" class="cell danger" data-x="remove">Fotoğrafı kaldır</button>` : ''}
      </div>
    </div>`,
    onRight: api => {
      if (crop) a = { ...a, img: exportCrop() };
      a.frame = frame;
      if (!saveAvatar(a)) { toast('Fotoğraf kaydedilemedi, daha küçük bir fotoğraf dene.'); return; }
      haptic('success');
      api.close();
      onDone?.();
    },
  });
  const box = $('.crop', sh.body), ring = $('.crop-ring', sh.body), zoom = $('.zoom', sh.body), hint = $('.crop-hint', sh.body);

  sh.body.addEventListener('click', e => {
    const fr = e.target.closest('[data-fr]');
    if (fr) {
      frame = fr.dataset.fr;
      $$('.fr', sh.body).forEach(b => b.classList.toggle('on', b === fr));
      ring.className = `crop-ring av-${frame}`;
      haptic();
    }
    if (e.target.closest('[data-x=remove]')) {
      a = { frame };
      saveAvatar(a);
      haptic();
      sh.close();
      toast('Fotoğraf kaldırıldı');
      onDone?.();
    }
    if (e.target.closest('.crop-empty')) $('input[type=file]', sh.body).click();
  });

  $('input[type=file]', sh.body).addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.src = URL.createObjectURL(file);
    try { await img.decode(); } catch { toast('Bu fotoğraf açılamadı.'); return; }
    const w = img.naturalWidth, h = img.naturalHeight, min = Math.max(V / w, V / h);
    crop = { img, w, h, s: min, min, x: 0, y: 0 };
    img.className = 'crop-img';
    img.style.width = w + 'px';
    img.style.height = h + 'px';
    box.innerHTML = '';
    box.append(img);
    zoom.hidden = false; hint.hidden = false; zoom.value = 1;
    draw();
    for (const el of sh.body.querySelectorAll('.fr .av')) el.innerHTML = `<img src="${img.src}" alt="">`;
  });

  function clamp() {
    const mx = Math.max(0, (crop.w * crop.s - V) / 2), my = Math.max(0, (crop.h * crop.s - V) / 2);
    crop.x = Math.min(mx, Math.max(-mx, crop.x));
    crop.y = Math.min(my, Math.max(-my, crop.y));
  }
  function draw() {
    clamp();
    crop.img.style.transform = `translate(-50%, -50%) translate(${crop.x}px, ${crop.y}px) scale(${crop.s})`;
  }
  zoom.addEventListener('input', () => { if (!crop) return; crop.s = crop.min * +zoom.value; draw(); });

  // Tek parmak kaydırır, iki parmak yakınlaştırır.
  let t0 = null;
  box.addEventListener('touchstart', e => {
    if (!crop) return;
    const t = [...e.touches];
    t0 = { x: crop.x, y: crop.y, s: crop.s, px: t[0].clientX, py: t[0].clientY, d: t[1] ? Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY) : 0 };
  }, { passive: true });
  box.addEventListener('touchmove', e => {
    if (!crop || !t0) return;
    e.preventDefault();
    const t = [...e.touches];
    if (t[1] && t0.d) {
      const d = Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
      crop.s = Math.min(crop.min * 4, Math.max(crop.min, t0.s * (d / t0.d)));
      zoom.value = crop.s / crop.min;
    } else {
      crop.x = t0.x + (t[0].clientX - t0.px);
      crop.y = t0.y + (t[0].clientY - t0.py);
    }
    draw();
  }, { passive: false });
  box.addEventListener('touchend', e => { if (!e.touches.length) t0 = null; else if (crop) { const t = e.touches[0]; t0 = { x: crop.x, y: crop.y, s: crop.s, px: t.clientX, py: t.clientY, d: 0 }; } });
  // Fare ile de (masaüstü önizleme).
  box.addEventListener('pointerdown', e => {
    if (!crop || e.pointerType === 'touch') return;
    const start = { x: crop.x, y: crop.y, px: e.clientX, py: e.clientY };
    const move = ev => { crop.x = start.x + ev.clientX - start.px; crop.y = start.y + ev.clientY - start.py; draw(); };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });

  function exportCrop() {
    const out = 360, c = document.createElement('canvas');
    c.width = c.height = out;
    const size = V / crop.s;
    const sx = crop.w / 2 - crop.x / crop.s - size / 2, sy = crop.h / 2 - crop.y / crop.s - size / 2;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(crop.img, sx, sy, size, size, 0, 0, out, out);
    return c.toDataURL('image/jpeg', 0.86);
  }
}
