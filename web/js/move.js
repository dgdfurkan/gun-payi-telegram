// "Açılış ekranını yenile": iOS açılış görselini yalnız "Ana Ekrana Ekle" anında simgenin içine kopyalar.
// Yenilemenin tek yolu yeniden eklemek, ama her simgenin verisi ayrıdır. Bu akış veriyi eskiden yeniye taşır.
// Taşıma sürerken eski kopya donar ve eşitlemez: iki kopya sunucudaki plan aynasını birbirinin üstüne yazmasın.
import { get, commit, backupText, parseBackup } from './store.js';
import * as api from './api.js';
import { icon } from './icons.js';
import { haptic, toast, copyText, confirmDanger, applyTheme, esc } from './ui.js';
import { loadAvatar, restoreAvatar } from './avatar.js';

const RENEWED = 'gp-launch';
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
export const installedApp = () => isIOS() && standalone();
export function markRenewed() { try { localStorage.setItem(RENEWED, '2'); } catch { /* özel mod */ } }
export function canRenew() {
  try { return installedApp() && localStorage.getItem(RENEWED) !== '2'; } catch { return false; }
}

// Panoya giden metin: yedek + bağlantı, fotoğraf ve olay imleci
export function moveText() {
  const data = JSON.parse(backupText());
  data.move = { v: 1, cursor: get().sync.cursor || 0, link: api.link(), avatar: loadAvatar() };
  return JSON.stringify(data);
}
export function readMove(raw) {
  if (raw?.move?.v !== 1) return null;
  const { link, avatar, cursor } = raw.move;
  const okLink = link && /^\d{1,20}$/.test(String(link.chatId)) && /^[a-f0-9]{64}$/.test(link.secret);
  const okImg = typeof avatar?.img === 'string' && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar.img);
  return {
    cursor: Number.isInteger(cursor) && cursor >= 0 ? cursor : 0,
    link: okLink ? { chatId: Number(link.chatId), secret: link.secret, name: String(link.name || '').slice(0, 80), bot: /^\w{3,64}$/.test(link.bot) ? link.bot : '', at: Number(link.at) || Date.now() } : null,
    avatar: avatar ? { ...(okImg ? { img: avatar.img } : {}), frame: /^[a-z]{2,10}$/.test(avatar.frame) ? avatar.frame : 'none' } : null,
  };
}
// Taşınacak metin yeni simgede eksiksiz geri okunabiliyor mu?
export function checkLossless(text, state) {
  const d = parseBackup(text);
  const sameNotes = d.notes.length === state.notes.length && d.notes.every((n, i) => n.text === state.notes[i].text);
  return !d.skipped.length && d.items.length === state.items.length && sameNotes && d.reviews.length === state.reviews.length;
}
export async function applyMove(data, move) {
  // Fotoğraf ve işaret önce yazılır ki kayıttan sonraki ilk çizimde görünsün
  if (move.avatar) restoreAvatar(move.avatar);
  markRenewed();
  await commit(d => {
    Object.assign(d, { prefs: data.prefs, items: data.items, notes: data.notes, reviews: data.reviews, onboarded: true });
    d.sync = { cursor: move.cursor };
  });
  applyTheme(data.prefs.color, data.prefs.mode);
  if (move.link) api.restoreLink(move.link);
  api.sync(true);
}

let el = null, state = 'sync';

function paint() {
  if (!el) return;
  const dark = document.documentElement.dataset.theme === 'dark';
  const path = `${location.host}/api/kur${dark ? '?koyu=1' : ''}`;
  // Safari bu şemayı yalnız https için tanır (x-safari-http yoktur)
  const href = `x-safari-https://${path}`;
  if (api.moving()) {
    el.innerHTML = `<h1>Bu, eski simge</h1>
      <p>Verilerin kopyalandı. Bitene kadar <b>başka bir şey kopyalama</b>.</p>
      <ol class="move-steps">
        <li><b>Safari’de aç</b><a class="big-btn" href="${esc(href)}" rel="noopener">${icon('share')}Safari’de aç</a>
          <small>Açılmazsa Safari’ye yaz: ${esc(path)}</small></li>
        <li><b>Paylaş → Ana Ekrana Ekle → Ekle</b></li>
        <li><b>Yeni simgeyi aç → “Eski simgeden taşı”</b><small>iPhone sorarsa “Yapıştır”a dokun.</small></li>
        <li><b>Planların gelince eski simgeyi sil</b><small>Açınca bu ekranı gösteren eskisidir. Basılı tut → Yer İşaretini Sil. “Verilerini de siler” uyarısı eskisi içindir.</small></li>
      </ol>
      <div class="grow"></div>
      <button type="button" class="big-btn soft" data-mv="copy">${icon('copy')}Yeniden kopyala</button>
      <button type="button" class="link" data-mv="cancel">Vazgeç, bu simgeyle devam et</button>`;
    return;
  }
  el.innerHTML = `<h1>Açılış ekranını yenile</h1>
    <p>Siyah zemindeki logo, uygulamayı ana ekrana ilk eklediğinde iPhone’un kopyaladığı eski görsel. Yalnız yeniden ekleyince değişir.</p>
    <div class="feat">${icon('check')}<div><b>Hiçbir şey kaybolmaz</b><span>Planlar, faturalar, notlar, fotoğraf, ayarlar ve Telegram taşınır.</span></div></div>
    <div class="feat">${icon('widget')}<div><b>Kısayolun aynen çalışır</b><span>Bağlantı kodu değişmez.</span></div></div>
    ${state === 'error' ? '<p class="hint err">Son değişiklikler alınamadı. İnternete bağlanıp yeniden dene.</p>' : ''}
    <div class="grow"></div>
    <button type="button" class="big-btn" data-mv="${state === 'error' ? 'retry' : 'start'}" ${state === 'sync' ? 'disabled' : ''}>${state === 'sync' ? 'Hazırlanıyor…' : state === 'error' ? 'Yeniden dene' : `${icon('copy')}Verilerimi kopyala, başla`}</button>
    <button type="button" class="link" data-mv="close">Şimdi değil</button>`;
}

function close() { el?.remove(); el = null; }

// Bekleyen Telegram olayları taşınan veriye girsin
async function prepare() {
  state = 'sync'; paint();
  state = !api.link() || (await api.sync(true)) ? 'ready' : 'error';
  paint();
}

async function start() {
  if (api.syncing()) { toast('Eşitleme bitiyor, bir saniye sonra dokun.'); return; }
  // iOS pano yazmayı yalnız dokunuşun içinde kabul eder: yazmadan önce bekleme yok.
  const text = moveText();
  if (!checkLossless(text, get())) { toast('Veriler eksiksiz kopyalanamıyor, taşıma başlamadı.'); return; }
  if (!api.setMoving(true)) { toast('Bu telefonda taşıma başlatılamadı.'); return; }
  if (!(await copyText(text))) {
    api.setMoving(false);
    toast('Kopyalanamadı, yeniden dokun.');
    return;
  }
  haptic('success');
  paint();
}

export function openMove() {
  if (el) return;
  el = document.createElement('div');
  el.className = 'welcome move';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Açılış ekranını yenile');
  el.addEventListener('click', async e => {
    const act = e.target.closest('[data-mv]')?.dataset.mv;
    if (!act) return;
    if (act === 'close') { haptic(); close(); }
    if (act === 'retry') { haptic(); prepare(); }
    if (act === 'start') start();
    if (act === 'copy') toast((await copyText(moveText())) ? 'Yeniden kopyalandı' : 'Kopyalanamadı');
    if (act === 'cancel') {
      if (!(await confirmDanger('Yeni simgeye yapıştırdıysan vazgeçme: iki simge planlarını birbirinin üstüne yazar.', 'Bu simgeyle devam et'))) return;
      api.setMoving(false);
      close();
      api.sync(true);
    }
  });
  document.body.append(el);
  if (api.moving()) paint(); else prepare();
}
