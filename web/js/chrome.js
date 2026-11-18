// Ortak sayfa iskeleti: üst çubuk, başlık bölümü, durum rozeti.
import { clockAt } from './core.js';
import { get } from './store.js';
import { esc } from './ui.js';
import { link } from './api.js';
import { tz } from './ctx.js';

export function greeting() {
  const h = clockAt(Date.now(), tz()).minutes / 60;
  return h < 5 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
}
export function appbar(title, right = '') {
  const name = get().prefs.name || '';
  const initial = (name.trim()[0] || 'G').toLocaleUpperCase('tr');
  return `<header class="appbar"><h1>${esc(title)}</h1><div class="appbar-r">${right}<button type="button" class="avatar-sm" data-tab="settings" aria-label="Ayarlar">${esc(initial)}</button></div></header>`;
}
export function statusChip() {
  const name = get().prefs.name;
  return link()
    ? '<span class="status-chip live"><i></i>Telegram bağlı</span>'
    : `<span class="status-chip off"><i></i>${esc(name ? `${greeting()}, ${name}` : greeting())}</span>`;
}
export const hero = (kicker, title, right = '') => `<div class="hero"><div><span class="kicker">${esc(kicker)}</span><h2>${esc(title)}</h2></div>${right}</div>`;
