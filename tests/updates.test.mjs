import test from 'node:test';
import assert from 'node:assert/strict';
import {setupUpdates} from '../dist/updates.js';
function harness(controlled=true){
 const events={},regEvents={},timers=new Map();let now=100000,busy=false,visible=true,saved=0,reloads=0,activations=0,checks=0,id=0,persist=async()=>{saved++;return true;};
 const container={controller:controlled?{}:null,addEventListener:(n,fn)=>events[n]=fn};
 const registration={waiting:null,addEventListener:(n,fn)=>regEvents[n]=fn,update:async()=>{checks++;}};
 const api=setupUpdates({container,registration,busy:()=>busy,persist:()=>persist(),announce:()=>{},reload:()=>reloads++,visible:()=>visible,online:()=>true,clock:()=>now,schedule:fn=>{timers.set(++id,fn);return id;},cancel:id=>timers.delete(id)});
 return {api,events,registration,get saved(){return saved;},get reloads(){return reloads;},get activations(){return activations;},get checks(){return checks;},advance:n=>now+=n,setBusy:x=>busy=x,setVisible:x=>visible=x,setPersist:fn=>persist=fn,worker:()=>registration.waiting={postMessage:()=>activations++},async tick(){const [id,fn]=timers.entries().next().value;timers.delete(id);await fn();},async settle(){await Promise.resolve();await Promise.resolve();await Promise.resolve();}};
}
test('Automatic update waits for typing/microphone/form work, then reloads exactly once',async()=>{
 const h=harness();h.setBusy(true);h.events.controllerchange();await h.settle();assert.equal(h.reloads,0);
 h.advance(3000);await h.tick();assert.equal(h.reloads,0);h.setBusy(false);await h.tick();assert.equal(h.saved,1);assert.equal(h.reloads,1);await h.tick();assert.equal(h.reloads,1);h.api.dispose();
});
test('A recent gesture or hidden PWA defers reload; foreground idle resumes it',async()=>{
 const h=harness();h.events.controllerchange();await h.settle();assert.equal(h.reloads,0);h.advance(2000);h.api.touch();await h.tick();assert.equal(h.reloads,0);h.advance(2000);h.setVisible(false);await h.tick();assert.equal(h.reloads,0);h.setVisible(true);await h.tick();assert.equal(h.reloads,1);h.api.dispose();
});
test('New input while draft persistence is pending prevents a mid-edit reload',async()=>{
 const h=harness();h.advance(2000);h.setPersist(async()=>{h.api.touch();return true;});h.events.controllerchange();await h.settle();assert.equal(h.reloads,0);h.api.dispose();
});
test('An explicit update persists first and can restore a still open form',async()=>{
 const h=harness();h.setBusy(true);h.worker();assert.equal(await h.api.apply(),false);assert.equal(await h.api.apply(true),true);assert.equal(h.activations,1);h.events.controllerchange();await h.settle();assert.equal(h.reloads,0);assert.equal(await h.api.apply(true),true);assert.equal(h.reloads,1);h.api.dispose();
});
test('Failed draft persistence blocks both automatic and requested reloads',async()=>{
 const h=harness();h.advance(2000);h.setPersist(async()=>false);h.events.controllerchange();await h.settle();assert.equal(await h.api.apply(true),false);assert.equal(h.reloads,0);h.api.dispose();
});
test('Initial service worker claim does not unnecessarily reload the first launch',async()=>{
 const h=harness(false);h.advance(3000);h.events.controllerchange();await h.settle();await h.tick();assert.equal(h.reloads,0);h.events.controllerchange();await h.settle();assert.equal(h.reloads,1);h.api.dispose();
});

test('Concurrent controller events persist and reload once',async()=>{
 const h=harness();h.advance(3000);let finish;h.setPersist(()=>new Promise(resolve=>finish=resolve));h.events.controllerchange();h.events.controllerchange();await h.settle();assert.equal(h.reloads,0);finish(true);await h.settle();assert.equal(h.reloads,1);h.api.dispose();
});

test('Automatic checks and controller changes never announce an update prompt',async()=>{let announcements=0;const listeners={},reg={waiting:{postMessage:()=>{}},addEventListener:()=>{},update:async()=>{}};const api=setupUpdates({container:{controller:{},addEventListener:(n,fn)=>listeners[n]=fn},registration:reg,busy:()=>true,persist:async()=>true,announce:()=>announcements++,reload:()=>{},visible:()=>true,online:()=>true,schedule:()=>1,cancel:()=>{}});await api.check(true);listeners.controllerchange();await Promise.resolve();assert.equal(announcements,0);api.dispose();});
