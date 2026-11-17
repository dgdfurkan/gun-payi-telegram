import test from 'node:test';
import assert from 'node:assert/strict';
import {DictationSession,insertionForSpeech,cleanSpeechText,readSpeechResults} from '../dist/dictation-core.js';
const result=(text,isFinal=true)=>Object.assign([{transcript:text}],{isFinal});
function fixture(initialText=''){
 const timersMap=new Map();let nextId=0,now=0;const states=[],recorders=[];
 const timers={setTimeout:(fn,ms)=>{const id=++nextId;timersMap.set(id,{fn,ms,type:'timeout'});return id},setInterval:(fn,ms)=>{const id=++nextId;timersMap.set(id,{fn,ms,type:'interval'});return id},clearTimeout:id=>timersMap.delete(id),clearInterval:id=>timersMap.delete(id)};
 const session=new DictationSession({initialText,timers,now:()=>now,onChange:s=>states.push(s),createRecognition:()=>{const rec={unspokenPunctuation:false,start(){this.started=true},stop(){this.stopped=true},abort(){this.aborted=true}};recorders.push(rec);return rec}});
 return {session,recorders,states,timersMap,advance:n=>now+=n,fire:ms=>{const t=[...timersMap.values()].find(t=>t.ms===ms);assert.ok(t);t.fn()}};
}
test('Turkish is fixed explicitly, results are interim and punctuation is optional',()=>{
 const f=fixture();assert.equal(f.session.start(),true);const r=f.recorders[0];assert.equal(r.lang,'tr-TR');assert.equal(r.interimResults,true);assert.equal(r.unspokenPunctuation,true);assert.equal(f.session.state.phase,'starting');r.onstart();assert.equal(f.session.state.phase,'listening');f.session.dispose();assert.equal(f.timersMap.size,0);
});
test('Repeated full result lists never append the same finalized transcript twice',()=>{
 const f=fixture();f.session.start();const r=f.recorders[0];r.onstart();r.onresult({results:[result('Yarın İstanbul’a gideceğim.'),result('Bir de',false)]});assert.equal(f.session.text,'Yarın İstanbul’a gideceğim. Bir de');r.onresult({results:[result('Yarın İstanbul’a gideceğim.'),result('Bir de annemi arayacağım.')]});assert.equal(f.session.text,'Yarın İstanbul’a gideceğim. Bir de annemi arayacağım.');r.onresult({results:[result('Yarın İstanbul’a gideceğim.'),result('Bir de annemi arayacağım.')]});assert.equal(f.session.text,'Yarın İstanbul’a gideceğim. Bir de annemi arayacağım.');r.onend();assert.equal(f.session.state.phase,'review');assert.equal(f.timersMap.size,0);
});
test('Final results arriving after Stop are kept; resume appends a new session once',()=>{
 const f=fixture();f.session.start();const a=f.recorders[0];a.onstart();a.onresult({results:[result('Kitap oku',false)]});f.session.stop();assert.equal(f.session.state.phase,'stopping');a.onresult({results:[result('Kitap oku.')]});a.onend();f.session.edit('Kitap oku. Düzeltildi.');f.session.start();const b=f.recorders[1];b.onstart();b.onresult({results:[result('Sonra dinlen.')]});b.onend();assert.equal(f.session.text,'Kitap oku. Düzeltildi. Sonra dinlen.');
});
test('Timeout and permission denial preserve recognized words and stop the microphone',()=>{
 const f=fixture();f.session.start();const r=f.recorders[0];r.onstart();r.onresult({results:[result('Önemli not',false)]});r.onerror({error:'network'});assert.equal(f.session.text,'Önemli not');assert.equal(f.session.state.error,'network');assert.equal(r.aborted,true);assert.equal(f.timersMap.size,0);r.onresult({results:[result('GEÇ GELEN SONUÇ')]});assert.equal(f.session.text,'Önemli not');
 const g=fixture('Korunan metin');g.session.start();g.fire(45000);assert.equal(g.session.state.error,'timeout');assert.equal(g.session.text,'Korunan metin');assert.equal(g.recorders[0].aborted,true);
});
test('Stop watchdog and page hiding preserve interim text without restarting recognition',()=>{
 const f=fixture();f.session.start();const r=f.recorders[0];r.onstart();f.advance(1500);r.onresult({results:[result('yarım kalan',false)]});f.session.stop();f.fire(3000);assert.equal(r.aborted,true);assert.equal(f.session.state.phase,'review');assert.equal(f.session.text,'yarım kalan');assert.ok(f.session.state.message);assert.equal(f.session.state.elapsed,1500);f.session.start();const b=f.recorders[1];b.onstart();f.session.suspend();assert.equal(b.aborted,true);assert.equal(f.recorders.length,2);assert.equal(f.timersMap.size,0);
});
test('Double starts and stale callbacks cannot revive a disposed microphone',()=>{
 const f=fixture();f.session.start();f.session.start();assert.equal(f.recorders.length,1);const r=f.recorders[0];f.session.dispose();r.onstart();r.onend();r.onresult({results:[result('Yeni metin')]});assert.equal(f.session.start(),false);assert.equal(f.session.text,'');assert.equal(f.timersMap.size,0);
});
test('Voice insertion preserves existing text, Turkish Unicode, selected ranges and length limits',()=>{
 assert.equal(insertionForSpeech({current:'Önceki not.',spoken:'İstanbul, Çankırı, Iğdır. Şükür.',multiline:true}).value,'Önceki not.\nİstanbul, Çankırı, Iğdır. Şükür.');
 assert.equal(insertionForSpeech({current:'Bugün eski plan',original:'Bugün eski plan',start:6,end:10,spoken:'yeni'}).value,'Bugün yeni plan');
 assert.equal(insertionForSpeech({current:'Bu alan değişti',original:'Eski alan',start:0,end:4,spoken:'ek metin'}).value,'Bu alan değişti ek metin');
 assert.deepEqual(insertionForSpeech({current:'12345',spoken:'67890',maxLength:8}),{ok:false,reason:'length',overflow:3});
 assert.equal(insertionForSpeech({spoken:'Birinci satır.\nİkinci satır.'}).value,'Birinci satır. İkinci satır.');
 assert.equal(cleanSpeechText('  İyi\t   ki  varsın ! '),'İyi ki varsın!');assert.equal(insertionForSpeech({spoken:'   '}).reason,'empty');
});
test('Unsupported engines fail without losing a recoverable text draft',()=>{
 const session=new DictationSession({createRecognition:()=>null,initialText:'Taslak'});assert.equal(session.start(),false);assert.equal(session.text,'Taslak');assert.equal(session.state.error,'unsupported');assert.deepEqual(readSpeechResults([result('aynı'),result('aynı')]),{final:'aynı aynı',interim:''});
});
test('The two-minute safety limit stops recognition and clears every timer on completion',()=>{
 const f=fixture();f.session.start();const r=f.recorders[0];r.onstart();f.fire(120000);assert.equal(f.session.state.phase,'stopping');assert.equal(r.stopped,true);r.onend();assert.equal(f.session.active,false);assert.equal(f.timersMap.size,0);assert.match(f.session.state.message,/ara verdik/);
});
