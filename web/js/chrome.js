// Ortak sayfa iskeleti: üst çubuk (profil fotoğrafıyla) ve başlık bölümü.
import { clockAt } from './core.js';
import { esc } from './ui.js';
import { tz } from './ctx.js';
import { avatarHTML } from './avatar.js';

export function greeting() {
  const h = clockAt(Date.now(), tz()).minutes / 60;
  return h < 5 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
}
// "2 plan" → "2 Plan", "bu ay 7 plan" → "Bu Ay 7 Plan"
export const titleCase = s => String(s).replace(/(^|[\s·/(-])(\p{Ll})/gu, (m, a, b) => a + b.toLocaleUpperCase('tr'));
export function appbar(title, right = '') {
  return `<header class="appbar"><h1>${esc(title)}</h1><div class="appbar-r">${right}<button type="button" class="avatar-btn" data-tab="settings" aria-label="Ayarlar">${avatarHTML('sm')}</button></div></header>`;
}
export const hero = (kicker, title, right = '') => `<div class="hero"><div><span class="kicker">${esc(kicker)}</span><h2>${esc(title)}</h2></div>${right}</div>`;
