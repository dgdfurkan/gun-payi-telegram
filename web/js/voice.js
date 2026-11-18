// Türkçe sesle yazma (Web Speech). iOS ana ekran uygulamasında izin her soğuk açılışta bir kez
// sorulabilir (WebKit hatası). Adres değişmediği sürece aynı oturumda tekrar sorulmaz.
//
// iOS bazen "bitti" (onend) olayını hiç göndermez ya da izin penceresinden sonra sessizce düşer.
// Bu yüzden her oturum kendi kimliğini taşır, eski olaylar yok sayılır ve bekçi zamanlayıcılar
// takılan oturumu kapatır. Sonuç: her dokunuş ya başlatır ya durdurur, asla boşa gitmez.
const Engine = () => window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = () => Boolean(Engine());
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const SILENCE = 2200;     // sonuç gelmeyince durdur
const MAX = 30000;        // en uzun dinleme
const START_WAIT = 12000; // izin penceresi dahil başlama beklemesi
const STOP_WAIT = 1500;   // durdurduktan sonra "bitti" gelmezse kapat
let cur = null;           // { r, started, heard, err, finish }
export const listening = () => Boolean(cur);

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

function message(code, started) {
  if (code === 'not-allowed') return started ? 'Mikrofon izni kapalı. Klavyedeki mikrofon izin sormadan yazar.' : 'İzin verdiysen bir kez daha dokun.';
  return {
    'service-not-allowed': 'Dikte kapalı: Ayarlar → Genel → Klavye → Dikte.',
    'no-speech': 'Ses duyulmadı, bir kez daha dokun.',
    'network': 'Sesle yazma için internet gerekli.',
    'audio-capture': 'Mikrofon şu an kullanılamıyor.',
  }[code] || 'Ses alınamadı, bir kez daha dokun.';
}

// onText(metin, kesin mi); onState('starting'|'listening'|'idle'|'error', mesaj)
export function startDictation({ base = '', onText, onState }) {
  resetDictation();
  const R = Engine();
  if (!R) { onState('error', 'Bu cihazda sesle yazma yok. Klavyedeki mikrofonu kullan.'); return; }
  const r = new R();
  const me = { r, started: false, heard: '', err: '', done: false };
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  let silence;
  const join = (a, b) => [a.trim(), b.trim()].filter(Boolean).join(' ');
  me.finish = () => {
    if (me.done) return;
    me.done = true;
    timers.forEach(clearTimeout); clearTimeout(silence);
    if (cur === me) cur = null;
    try { r.abort(); } catch { /* zaten kapalı */ }
    onText(join(base, me.heard), true);
    if (me.err && !me.heard) onState('error', me.err); else onState('idle');
  };
  me.stop = () => {
    if (!me.started) { me.finish(); return; } // başlamadan dokunulursa iptal
    try { r.stop(); } catch { /* yok */ }
    later(() => me.finish(), STOP_WAIT);
  };
  cur = me;
  r.lang = 'tr-TR';
  r.interimResults = true;
  r.continuous = !IOS; // iOS'ta tek cümle modu daha kararlı; motor susunca kendisi bitirir
  r.maxAlternatives = 1;
  r.onstart = () => {
    if (me.done) return;
    me.started = true;
    onState('listening');
    later(() => me.stop(), MAX);
  };
  r.onresult = e => {
    if (me.done) return;
    me.heard = transcriptOf(e.results);
    onText(join(base, me.heard), false);
    clearTimeout(silence);
    silence = setTimeout(() => me.stop(), SILENCE);
  };
  r.onerror = e => { if (!me.done && e.error !== 'aborted') me.err = message(e.error, me.started); };
  r.onend = () => me.finish();
  onState('starting');
  later(() => { if (!me.started) { me.err = me.err || 'Mikrofon başlamadı, bir kez daha dokun.'; me.finish(); } }, START_WAIT);
  try { r.start(); } catch { me.err = 'Sesle yazma başlatılamadı, bir kez daha dokun.'; me.finish(); }
}
export function stopDictation() { cur?.stop(); }
export function abortDictation() { if (cur) { cur.err = ''; cur.finish(); } }
export function resetDictation() { abortDictation(); }

// Uygulama arka plana geçince açık oturumu kapat; dönüşte temiz başlansın.
document.addEventListener('visibilitychange', () => { if (document.hidden) abortDictation(); });
window.addEventListener('pagehide', () => abortDictation());
