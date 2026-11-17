/** Turkish dictation lifecycle, independent of the DOM and the recognition provider. */
export const ACTIVE_PHASES = new Set(['starting', 'listening', 'stopping']);
export function cleanSpeechText(text) {
  return String(text ?? '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\t ]+/g, ' ').replace(/ +([,;!?])/g, '$1').replace(/ *\n */g, '\n').trim();
}
export function joinSpeech(a, b) {
  if (!a) return String(b || '').trim();
  if (!b) return String(a).trim();
  return `${String(a).trimEnd()} ${String(b).trimStart()}`;
}
export function readSpeechResults(results) {
  let final = '', interim = '';
  for (let i = 0; i < results.length; i++) {
    const result = results[i], text = result?.[0]?.transcript || '';
    if (result?.isFinal) final = joinSpeech(final, text);
    else interim = joinSpeech(interim, text);
  }
  return { final, interim };
}
export function insertionForSpeech({current = '', spoken = '', original = current, start, end, multiline = false, maxLength = Infinity}) {
  const cleaned = cleanSpeechText(spoken);
  const text = multiline ? cleaned : cleaned.replace(/\n+/g, ' ');
  if (!text) return {ok:false, reason:'empty'};
  const replace = current === original && Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= current.length;
  const left = replace ? current.slice(0, start) : current;
  const right = replace ? current.slice(end) : '';
  const before = left && !/\s$/.test(left) ? (multiline && !replace ? '\n' : ' ') : '';
  const after = right && !/^[\s,.;:!?)]/.test(right) ? ' ' : '';
  const value = left + before + text + after + right;
  if (value.length > maxLength) return {ok:false, reason:'length', overflow:value.length-maxLength};
  return {ok:true, value};
}
export function speechErrorMessage(code) {
  return ({
    'not-allowed':'Mikrofon izni verilmedi. Tarayıcıdaki site izinlerinden mikrofonu açıp yeniden deneyebilirsin.',
    'service-not-allowed':'Bu tarayıcıda ses tanıma açılamadı. Android’de Chrome, iPhone’da Safari ile dene; klavyenin mikrofonunu da kullanabilirsin.',
    'audio-capture':'Mikrofona ulaşılamadı. Mikrofonunu ve onu kullanan diğer uygulamaları kontrol et.',
    network:'Ses tanıma hizmetine ulaşılamadı. İnternet bağlantını kontrol edip yeniden dene.',
    'no-speech':'Konuşma algılanmadı. Mikrofona biraz yaklaşıp yeniden deneyebilirsin.',
    'language-not-supported':'Bu cihazın ses hizmeti Türkçe tanımayı açamadı. Telefon klavyendeki Türkçe dikteyi kullanabilirsin.',
    'phrases-not-supported':'Ses hizmeti başlatılamadı. Yeniden deneyebilir veya klavyenin mikrofonunu kullanabilirsin.',
    aborted:'Dinleme durduruldu. Çevrilen metin korunuyor.',
    timeout:'Ses hizmeti yanıt vermedi. Yeniden deneyebilir veya klavyenin mikrofonunu kullanabilirsin.',
    unsupported:'Bu tarayıcı uygulama içinden sesle yazmayı desteklemiyor. Android’de Chrome, iPhone’da Safari ile açmayı ya da telefon klavyendeki mikrofonu deneyebilirsin.'
  })[code] || 'Ses tanıma tamamlanamadı. Çevrilen metin korunuyor; yeniden deneyebilirsin.';
}
export class DictationSession {
  constructor({createRecognition, onChange=()=>{}, initialText='', now=()=>Date.now(), timers=globalThis, limitMs=120000}) {
    this.factory=createRecognition;this.onChange=onChange;this.now=now;this.timers=timers;this.limitMs=limitMs;
    this.state={phase:initialText?'review':'idle',text:initialText,interim:'',error:'',message:'',elapsed:0,capturing:false};
    this.rec=null;this.base='';this.startedAt=null;this.elapsedBase=0;this.destroyed=false;
  }
  get active(){return ACTIVE_PHASES.has(this.state.phase)}
  get text(){return joinSpeech(this.state.text,this.state.interim)}
  emit(){if(!this.destroyed)this.onChange({...this.state,preview:this.text})}
  clearTimers(){for(const t of [this.watchdog,this.limit,this.stopTimer])if(t!==undefined)this.timers.clearTimeout(t);if(this.clock!==undefined)this.timers.clearInterval(this.clock);this.watchdog=this.limit=this.stopTimer=this.clock=undefined;}
  finishElapsed(){if(this.startedAt!==null){this.state.elapsed=this.elapsedBase+Math.max(0,this.now()-this.startedAt);this.startedAt=null;}}
  start(){
    if(this.destroyed||this.active)return false;
    let rec;try{rec=this.factory?.();}catch{}
    if(!rec){this.state.phase='error';this.state.error='unsupported';this.emit();return false;}
    this.clearTimers();this.base=this.text;this.state.text=this.base;this.state.interim='';this.state.error='';this.state.message='';this.state.phase='starting';this.state.capturing=false;this.rec=rec;
    rec.lang='tr-TR';rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;
    // Prefer the engine's own punctuation when the optional capability exists.
    if('unspokenPunctuation' in rec)try{rec.unspokenPunctuation=true}catch{}
    rec.onstart=()=>{if(this.rec!==rec)return;if(this.watchdog!==undefined)this.timers.clearTimeout(this.watchdog);if(this.state.phase==='stopping'){try{rec.stop()}catch{}return;}
      this.state.phase='listening';this.startedAt=this.now();this.elapsedBase=this.state.elapsed;
      this.clock=this.timers.setInterval(()=>{this.state.elapsed=this.elapsedBase+Math.max(0,this.now()-this.startedAt);this.emit()},500);
      this.limit=this.timers.setTimeout(()=>{this.state.message='Biraz ara verdik. İstersen konuşmaya devam edebilirsin.';this.stop()},this.limitMs);this.emit();};
    rec.onaudiostart=()=>{if(this.rec!==rec)return;this.state.capturing=true;this.emit()};rec.onaudioend=()=>{if(this.rec!==rec)return;this.state.capturing=false;this.emit()};
    rec.onresult=e=>{if(this.rec!==rec)return;this.state.capturing=true;const result=readSpeechResults(e.results);this.state.text=joinSpeech(this.base,result.final);this.state.interim=result.interim;this.emit()};
    rec.onerror=e=>{if(this.rec!==rec)return;this.clearTimers();this.finishElapsed();this.state.text=this.text;this.state.interim='';this.rec=null;try{rec.abort()}catch{}this.state.phase='error';this.state.capturing=false;this.state.error=e.error||'unknown';this.emit()};
    rec.onend=()=>{if(this.rec!==rec)return;this.finish(rec)};
    this.emit();this.watchdog=this.timers.setTimeout(()=>{if(this.rec!==rec)return;rec.onerror({error:'timeout'})},45000);
    try{rec.start();return true}catch(error){rec.onerror({error:error.name==='NotAllowedError'?'not-allowed':'service-not-allowed'});return false}
  }
  stop(){if(!this.rec||this.state.phase==='stopping')return;const rec=this.rec;this.state.phase='stopping';this.emit();this.stopTimer=this.timers.setTimeout(()=>{if(this.rec===rec)this.finish(rec,true)},3000);try{rec.stop()}catch{this.finish(rec,true)}}
  finish(rec,abort=false){if(this.rec!==rec)return;this.clearTimers();this.finishElapsed();if(this.state.interim)this.state.message='Son birkaç kelime henüz kesinleşmemiş olabilir; metni gözden geçir.';this.state.text=this.text;this.state.interim='';this.rec=null;if(abort)try{rec.abort()}catch{}this.state.capturing=false;this.state.phase=this.state.text?'review':'idle';if(!this.state.text&&!this.state.message)this.state.message='Henüz bir metin oluşmadı. Yeniden deneyebilirsin.';this.emit()}
  edit(text){if(this.active)return;this.state.text=String(text);this.state.interim='';this.state.error='';this.state.phase=text?'review':'idle';this.emit()}
  suspend(){if(this.rec)this.finish(this.rec,true)}
  dispose(){this.suspend();this.clearTimers();this.destroyed=true}
}
