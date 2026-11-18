// Türkçe sesle yazma (Web Speech). iOS ana ekran uygulamasında izin her açılışta bir kez sorulabilir;
// bu bir WebKit sınırı. Adres değişmediği sürece aynı oturumda tekrar sorulmaz.
const Engine = () => window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = () => Boolean(Engine());

let rec = null;
export const listening = () => Boolean(rec);

// onText(metin, kesin mi), onState('listening'|'idle'|'error', mesaj)
export function startDictation({ base = '', onText, onState }) {
  stopDictation();
  const R = Engine();
  if (!R) { onState('error', 'Bu cihazda sesle yazma yok. Klavyedeki mikrofonu kullan.'); return; }
  const r = new R();
  rec = r;
  r.lang = 'tr-TR';
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let finalText = '';
  const join = (a, b) => [a.trim(), b.trim()].filter(Boolean).join(' ');
  r.onstart = () => onState('listening');
  r.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText = join(finalText, t); else interim = join(interim, t);
    }
    onText(join(base, join(finalText, interim)), false);
  };
  r.onerror = e => {
    const msg = {
      'not-allowed': 'Mikrofon izni verilmedi. Klavyedeki mikrofon izin sormadan çalışır.',
      'service-not-allowed': 'Sesle yazma kapalı. Ayarlar → Genel → Klavye → Dikte açık olmalı.',
      'no-speech': 'Ses duyulmadı, tekrar dene.',
      'network': 'Sesle yazma için internet gerekli.',
      'audio-capture': 'Mikrofon kullanılamıyor.',
    }[e.error] || 'Sesle yazma durdu.';
    if (e.error !== 'aborted') onState('error', msg);
  };
  r.onend = () => {
    if (rec === r) rec = null;
    onText(join(base, finalText), true);
    onState('idle');
  };
  try { r.start(); } catch { rec = null; onState('error', 'Sesle yazma başlatılamadı.'); }
}
export function stopDictation() {
  if (!rec) return;
  const r = rec;
  try { r.stop(); } catch { /* zaten durdu */ }
}
export function abortDictation() {
  if (!rec) return;
  const r = rec; rec = null;
  try { r.abort(); } catch { /* yok */ }
}
