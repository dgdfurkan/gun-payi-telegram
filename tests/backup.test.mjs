import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,setOccurrence} from '../dist/core.js';
import {backupText,parseBackup,readDevice,writeDevice} from '../dist/backup.js';

function storage(){const map=new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
test('Full JSON backup retains user data, recurring exceptions, preferences and local drafts',()=>{
 const s=initial('2026-11-16'),local=storage(),now='2026-11-16T10:00:00Z';
 s.prefs.name='Furkan';s.prefs.plannerMode='month';s.prefs.quickVoice=true;
 setOccurrence(s,'work-shift','2026-11-16',{date:'2026-12-01',status:'done'});
 s.notes.push({id:'note',text:'Türkçe ı İ ğ ş ç ö ü',kind:'idea',tag:'test',recall:'',use:'',reviewDates:[],reviewedDates:[],createdAt:now,updatedAt:now});
 s.goals.push({id:'goal',area:'movement',title:'Yürü',why:'İyi gelir',step:'10 dk',normal:'Yürü',hard:'Esne',log:[{date:'2026-11-16',mode:'hard'}],createdAt:now,updatedAt:now});
 s.days['2026-11-16']={reflection:'Bugün iyiydi',energy:'good'};
 s.reviews.push({week:'2026-11-16',answers:['a','b','c','d','e'],updatedAt:now});
 local.setItem('gun-payi-quick',JSON.stringify({text:'Yarım görev',kind:'task',time:'09:30'}));
 local.setItem('gun-payi-draft',JSON.stringify({kind:'note',meta:{},fields:[['text','Yarım not']],at:1}));
 local.setItem('gun-payi-voice',JSON.stringify({text:'Uzun konuşma metni',at:1}));
 const result=parseBackup(backupText(s,local));assert.deepEqual(result.state,s);assert.deepEqual(result.storage,readDevice(local));
 const destination=storage();writeDevice(destination,result.storage);assert.deepEqual(readDevice(destination),readDevice(local));
});
test('Legacy JSON backups without new preferences or device data still restore',()=>{
 const s=initial('2026-11-16');delete s.prefs.quickVoice;delete s.prefs.plannerMode;
 assert.deepEqual(parseBackup(JSON.stringify(s)).state,s);
 assert.ok(Object.values(parseBackup(JSON.stringify(s)).storage).every(v=>v===null));
});
test('Malformed clipboard and invalid settings or drafts are rejected before mutation',()=>{
 const s=initial('2026-11-16'),local=storage(),before=JSON.stringify(s);
 for(const text of ['', 'hello',JSON.stringify({...s,prefs:{...s.prefs,plannerMode:'bad'}}),JSON.stringify({...s,prefs:{...s.prefs,quickVoice:'yes'}}),JSON.stringify({...s,device:{storage:{'gun-payi-draft':JSON.stringify({kind:'goal',meta:{area:'bad'},fields:[]})}}})])assert.throws(()=>parseBackup(text));
 assert.equal(JSON.stringify(s),before);assert.deepEqual(readDevice(local),Object.fromEntries(['gun-payi-quick','gun-payi-draft','gun-payi-voice'].map(k=>[k,null])));
});
test('Draft storage rolls back if quota fails, and never touches unrelated keys',()=>{
 const local=storage();local.setItem('other-app','unchanged');local.setItem('gun-payi-quick','old');
 const original=local.setItem;let thrown=false;local.setItem=(k,v)=>{if(k==='gun-payi-draft'&&!thrown){thrown=true;throw Error('quota');}return original(k,v);};
 assert.throws(()=>writeDevice(local,{'gun-payi-quick':'new','gun-payi-draft':'new'}));
 assert.equal(local.getItem('gun-payi-quick'),'old');assert.equal(local.getItem('gun-payi-draft'),null);assert.equal(local.getItem('other-app'),'unchanged');
});
