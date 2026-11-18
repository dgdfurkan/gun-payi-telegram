// Türkçe sesle yazma (Web Speech). iOS ana ekran uygulamasında izin her soğuk açılışta bir kez
// sorulabilir (WebKit hatası). Adres değişmediği sürece aynı oturumda tekrar sorulmaz.
const Engine = () => window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = () => Boolean(Engine());

const SILENCE = 1800;   // susunca bu kadar sonra durur
const MAX = 30000;      // en uzun dinleme
let rec = null, silenceTimer = null, maxTimer = null;
export const listening = () => Boolean(rec);

// Sonuçlardan tam metni çıkarır. iOS bazen her sonuca baştan beri olan metni koyar (birikimli);
// bu durumda son sonucu, değilse hepsini birleştirir. Böylece aynı cümle iki kez yazılmaz.
export function transcriptOf(results) {
  const parts = [];
  for (let i = 0; i < results.length; i++) parts.push(String(results[i][0]?.transcript || '').trim());
  const clean = parts.filter(Boolean);
  if (clean.length > 1) {
    const last = clean.at(-1).toLocaleLowerCase('tr'), first = clean[0].toLocaleLowerCase('tr');
    if (last.startsWith(first)) return clean.at(-1);
  }
  return clean.join(' ').replace(/\s+/g, ' ');
}

// onText(metin, kesin mi), onState('listening'|'idle'|'error', mesaj)
export function startDictation({ base = '', onText, onState }) {
  abortDictation();
  const R = Engine();
  if (!R) { onState('error', 'Bu cihazda sesle yazma yok. Klavyedeki mikrofonu kullan.'); return; }
  const r = new R();
  rec = r;
  r.lang = 'tr-TR';
  r.interimResults = true;
  r.continuous = true;
  r.maxAlternatives = 1;
  let heard = '';
  const join = (a, b) => [a.trim(), b.trim()].filter(Boolean).join(' ');
  const arm = () => { clearTimeout(silenceTimer); silenceTimer = setTimeout(() => stopDictation(), SILENCE); };
  r.onstart = () => { onState('listening'); maxTimer = setTimeout(() => stopDictation(), MAX); };
  r.onresult = e => {
    heard = transcriptOf(e.results);
    onText(join(base, heard), false);
    arm();
  };
  r.onerror = e => {
    const msg = {
      'not-allowed': 'Mikrofon izni verilmedi. Klavyedeki mikrofon izin sormadan yazar.',
      'service-not-allowed': 'Dikte kapalı: Ayarlar → Genel → Klavye → Dikte.',
      'no-speech': 'Ses duyulmadı, tekrar dene.',
      'network': 'Sesle yazma için internet gerekli.',
      'audio-capture': 'Mikrofon kullanılamıyor.',
    }[e.error] || 'Sesle yazma durdu.';
    if (e.error !== 'aborted') onState('error', msg);
  };
  r.onend = () => {
    clearTimeout(silenceTimer); clearTimeout(maxTimer);
    if (rec === r) rec = null;
    onText(join(base, heard), true);
    onState('idle');
  };
  try { r.start(); } catch { rec = null; onState('error', 'Sesle yazma başlatılamadı.'); }
}
export function stopDictation() {
  clearTimeout(silenceTimer); clearTimeout(maxTimer);
  if (!rec) return;
  try { rec.stop(); } catch { /* zaten durdu */ }
}
export function abortDictation() {
  clearTimeout(silenceTimer); clearTimeout(maxTimer);
  if (!rec) return;
  const r = rec; rec = null;
  try { r.abort(); } catch { /* yok */ }
}
