// Yerel veri: IndexedDB 'gun-payi' / 'local' / 'state'. Her değişiklik tek işlemle yazılır.
import { cleanItem, cleanPrefs, isDate, uid } from './core.js';

const DB = 'gun-payi', STORE = 'local', KEY = 'state';
let db, state, listeners = new Set(), queue = Promise.resolve();

export const fresh = () => ({ schema: 2, revision: 0, onboarded: false, prefs: cleanPrefs({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }), items: [], notes: [], reviews: [], sync: { cursor: 0 } });

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const tx = (mode, fn) => new Promise((resolve, reject) => {
  const t = db.transaction(STORE, mode);
  const r = fn(t.objectStore(STORE));
  t.oncomplete = () => resolve(r?.result);
  t.onerror = () => reject(t.error);
  t.onabort = () => reject(t.error || Error('Kayıt iptal edildi.'));
});

export async function load() {
  try {
    db = await open();
    const saved = await tx('readonly', s => s.get(KEY));
    state = saved?.schema === 2 ? { ...fresh(), ...saved, prefs: cleanPrefs(saved.prefs) } : fresh();
  } catch {
    state = fresh(); // gizli sekme vb.: bellekte çalış
  }
  try { navigator.storage?.persist?.(); } catch { /* isteğe bağlı */ }
  return state;
}

export const get = () => state;
export const subscribe = fn => (listeners.add(fn), () => listeners.delete(fn));

// fn taslağı değiştirir; yazma başarılı olunca durum güncellenir.
export function commit(fn, { silent = false } = {}) {
  const run = async () => {
    const draft = structuredClone(state);
    const out = fn(draft);
    draft.revision = (state.revision || 0) + 1;
    if (db) await tx('readwrite', s => s.put(draft, KEY));
    state = draft;
    if (!silent) for (const l of listeners) l(state);
    return out;
  };
  const p = queue.then(run);
  queue = p.catch(() => {});
  return p;
}

// --- Sunucu olaylarını uygula (Telegram / Kısayol) ---
export function applyEvent(s, e) {
  switch (e.type) {
    case 'add': try { const item = cleanItem(e.item); s.items = s.items.filter(i => i.id !== item.id).concat(item); } catch { /* atla */ } break;
    case 'remove': s.items = s.items.filter(i => i.id !== e.id); break;
    case 'patch': {
      const i = s.items.findIndex(x => x.id === e.id);
      if (i < 0) break;
      const item = s.items[i];
      if (item.repeat === 'none') Object.assign(item, e.patch);
      else item.exceptions = { ...item.exceptions, [e.origin]: { ...item.exceptions?.[e.origin], ...e.patch } };
      item.updatedAt = new Date().toISOString();
      break;
    }
    case 'note': if (e.note?.text && !s.notes.some(n => n.id === e.note.id)) s.notes.unshift({ id: e.note.id, text: String(e.note.text).slice(0, 4000), createdAt: e.note.createdAt, updatedAt: e.note.createdAt }); break;
    case 'removeNote': s.notes = s.notes.filter(n => n.id !== e.id); break;
  }
}

// --- Yedek ---
export function backupText() {
  const { prefs, items, notes, reviews } = state;
  return JSON.stringify({ app: 'gun-payi', schema: 2, exportedAt: new Date().toISOString(), prefs, items, notes, reviews });
}

// Yeni (schema 2) ve eski uygulamanın (schema 1) yedeklerini okur.
export function parseBackup(text) {
  let raw;
  try { raw = JSON.parse(String(text).trim()); } catch { throw Error('Panodaki metin geçerli bir yedek değil.'); }
  if (!raw || typeof raw !== 'object' || ![1, 2].includes(raw.schema) || !Array.isArray(raw.items)) throw Error('Bu bir Gün Payı yedeği değil.');
  if (raw.items.length > 20000) throw Error('Yedek çok büyük.');
  const items = [], skipped = [];
  const seen = new Set();
  for (const r of raw.items) {
    try {
      const id = typeof r.id === 'string' && /^[-_:a-zA-Z0-9]{1,150}$/.test(r.id) && !seen.has(r.id) ? r.id : uid();
      seen.add(id);
      items.push(cleanItem({ ...r, id }));
    } catch { skipped.push(r?.title || '?'); }
  }
  const notes = (Array.isArray(raw.notes) ? raw.notes : []).filter(n => n && typeof n.text === 'string' && n.text.trim()).slice(0, 20000).map(n => ({
    id: typeof n.id === 'string' ? n.id.slice(0, 150) : uid(),
    text: (n.tag && raw.schema === 1 ? `${n.text}${n.tag ? `\n#${n.tag}` : ''}` : n.text).slice(0, 100000),
    createdAt: n.createdAt || new Date().toISOString(), updatedAt: n.updatedAt || n.createdAt || new Date().toISOString(),
  }));
  const reviews = (Array.isArray(raw.reviews) ? raw.reviews : []).filter(r => r && isDate(r.week)).map(r => ({
    week: r.week, answers: Array.isArray(r.answers) ? r.answers.map(a => String(a || '').slice(0, 2000)) : [], updatedAt: r.updatedAt || new Date().toISOString(),
  }));
  const p = raw.prefs || {};
  const prefs = cleanPrefs({ ...p, plannerMode: p.plannerMode === 'list' ? 'day' : p.plannerMode, timeZone: p.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone });
  return { prefs, items, notes, reviews, skipped, legacy: raw.schema === 1 };
}
