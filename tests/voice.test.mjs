import test from 'node:test';
import assert from 'node:assert/strict';

// Tarayıcı ortamını taklit et: iOS'taki takılma durumlarını yeniden üretebilen sahte tanıma motoru.
const instances = [];
class FakeRecognition {
  constructor() { instances.push(this); this.stopped = false; this.aborted = false; }
  start() { this.startedCall = true; }
  stop() { this.stopped = true; if (this.endOnStop) this.onend?.(); }
  abort() { this.aborted = true; }
  emitStart() { this.onstart?.(); }
  emitResult(...texts) { this.onresult?.({ results: texts.map(t => [{ transcript: t }]) }); }
}
globalThis.window = { webkitSpeechRecognition: FakeRecognition, addEventListener() {} };
globalThis.document = { addEventListener() {} };
const { startDictation, stopDictation, listening, transcriptOf } = await import('../web/js/voice.js');

function run() {
  const log = { text: '', states: [] };
  startDictation({ base: '', onText: t => { log.text = t; }, onState: (s, m) => log.states.push(m ? `${s}:${m}` : s) });
  return { log, rec: instances.at(-1) };
}
const wait = ms => new Promise(r => setTimeout(r, ms));

test('normal akış: başlar, metin gelir, biter', () => {
  const { log, rec } = run();
  rec.emitStart();
  rec.emitResult('her cuma 12de babaannemi ara');
  rec.onend();
  assert.equal(log.text, 'her cuma 12de babaannemi ara');
  assert.deepEqual(log.states, ['starting', 'listening', 'idle']);
  assert.equal(listening(), false);
});

test('"bitti" sinyali hiç gelmezse bekçi kapatır, ikinci dokunuş çalışır', async () => {
  const { log, rec } = run();
  rec.emitStart();
  rec.emitResult('spor');
  stopDictation();              // iOS onend göndermiyor
  assert.equal(listening(), true);
  await wait(1700);
  assert.equal(listening(), false);
  assert.equal(log.states.at(-1), 'idle');
  const second = run();
  assert.equal(second.log.states[0], 'starting');
  assert.notEqual(second.rec, rec);
  second.rec.emitStart();
  assert.equal(listening(), true);
  stopDictation();
  second.rec.onend();
});

test('izin penceresinden sonra hiç başlamazsa dokunuş iptal eder, sonraki yeniden başlatır', () => {
  const first = run();
  assert.equal(listening(), true);
  stopDictation();               // kullanıcı tekrar dokundu
  assert.equal(listening(), false);
  assert.equal(first.log.states.at(-1), 'idle');
  const second = run();
  second.rec.emitStart();
  assert.equal(second.log.states.at(-1), 'listening');
  second.rec.onend();
});

test('izin ilk kez verilirken gelen not-allowed yanıltıcı mesaj göstermez', () => {
  const { log, rec } = run();
  rec.onerror({ error: 'not-allowed' });
  rec.onend();
  assert.equal(log.states.at(-1), 'error:İzin verdiysen bir kez daha dokun.');
});

test('eski oturumdan geç gelen olaylar yok sayılır', () => {
  const old = run();
  old.rec.emitStart();
  const fresh = run();           // eski oturum iptal edildi
  old.rec.emitResult('eski metin');
  old.rec.onend();
  assert.equal(fresh.log.text, '');
  assert.equal(listening(), true);
  fresh.rec.emitStart();
  fresh.rec.emitResult('yeni metin');
  fresh.rec.onend();
  assert.equal(fresh.log.text, 'yeni metin');
});

test('iOS birikimli sonuçları tekrar yazılmaz', () => {
  assert.equal(transcriptOf([[{ transcript: 'her cuma' }], [{ transcript: 'her cuma saat 12de' }]]), 'her cuma saat 12de');
  assert.equal(transcriptOf([[{ transcript: 'yarın' }], [{ transcript: 'spor' }]]), 'yarın spor');
});
