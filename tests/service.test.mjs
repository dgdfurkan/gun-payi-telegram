import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {ReminderHub, routeService} from '../telegram-worker/worker.mjs';
import {cleanCalendar, jobsFor, zonedMs, parseCommand} from '../telegram-worker/core.mjs';

const BASE='https://example.workers.dev';
const ORIGIN='https://gun-payi.gunduz.chatgpt.site';
const TOKEN='123456:'+'A'.repeat(35), USER='100001';
class Storage {
  constructor(){this.values=new Map();this.alarm=null;}
  async get(key){return structuredClone(this.values.get(key));}
  async put(key,value){if(typeof key==='object'){for(const [k,v] of Object.entries(key))this.values.set(k,structuredClone(v));}else this.values.set(key,structuredClone(value));}
  async delete(keys){for(const k of Array.isArray(keys)?keys:[keys])this.values.delete(k);}
  async list({prefix='',startAfter='',limit=1000}={}){return new Map([...this.values].filter(([k])=>k.startsWith(prefix)&&k>startAfter).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit).map(([k,v])=>[k,structuredClone(v)]));}
  async getAlarm(){return this.alarm;}
  async setAlarm(value){this.alarm=value;}
  async deleteAlarm(){this.alarm=null;}
}
function calendar(){
  return {prefs:{timeZone:'Europe/Istanbul',reminderDefaults:[10]},items:[{
    id:'walk-1',title:'Sabah yürüyüşü',date:'2026-11-16',time:'11:00',endTime:'',
    kind:'event',repeat:'none',weekdays:[],area:'movement',icon:'walk',
    optional:true,priority:false,status:'pending',buffer:0,exceptions:{},history:[],
    detail:'',reminders:[10],createdAt:'2026-11-16T06:00:00Z',updatedAt:'2026-11-16T06:00:00Z'
  }]};
}
async function fixture({updates=[],invalid=false,otherHook='',rateLimited=false}={}){
  const hubs=new Map(),calls=[],hooks=new Map();
  let now=Date.parse('2026-11-16T07:49:00Z');
  const net=async(url,opts)=>{
    const match=new URL(url).pathname.match(/^\/bot(\d+):[^/]+\/(\w+)$/);
    assert.ok(match,'Only Telegram Bot API calls are permitted in the mock');
    const [,botId,method]=match,data=JSON.parse(opts.body);calls.push({botId,method,data});
    if(invalid&&method==='getMe')return Response.json({ok:false},{status:401});
    const result=method==='getMe'?{id:Number(botId),is_bot:true,username:'test_'+botId}
      :method==='getChat'?{id:Number(data.chat_id),type:'private',first_name:'Test'}
      :method==='getWebhookInfo'?{url:hooks.get(botId)||otherHook}
      :method==='getUpdates'?updates
      :method==='setWebhook'?(hooks.set(botId,data.url),true)
      :method==='sendMessage'?{message_id:calls.length}:true;
    return Response.json({ok:true,result});
  };
  const env={
    ALLOWED_ORIGIN:ORIGIN,
    SETUP_LIMITER:{limit:async()=>({success:!rateLimited})},
    HUB:{idFromName:name=>name,get:name=>{
      if(!hubs.has(name)){
        const storage=new Storage();let queue=Promise.resolve();
        const ctx={storage,blockConcurrencyWhile:fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;}};
        hubs.set(name,new ReminderHub(ctx,{}, {fetch:net,now:()=>now}));
      }
      return hubs.get(name);
    }}
  };
  const request=async(path,data,key,origin=ORIGIN)=>{
    const response=await routeService(new Request(BASE+path,{
      method:data===undefined?'GET':'POST',
      headers:{origin,...key?{authorization:'Bearer '+key}:{},'content-type':'application/json'},
      body:data===undefined?undefined:JSON.stringify(data)
    }),env,net);
    return {status:response.status,data:await response.json()};
  };
  const connect=async()=>{const response=await request('/api/configure',{botToken:TOKEN,userId:USER});assert.equal(response.status,200);return response.data;};
  const hook=async(update,secret)=>{
    const hub=hubs.get('bot:123456'),cfg=await hub.storage.get('config');
    const response=await routeService(new Request(BASE+'/bot/123456/telegram/webhook',{
      method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret??cfg.hookSecret},
      body:JSON.stringify(update)
    }),env,net);
    return {status:response.status,data:await response.json()};
  };
  return {request,connect,hook,hubs,calls,hooks,env,advance:ms=>{now+=ms;}};
}

test('Two-field setup isolates each bot and rejects another bot token or device key',async()=>{
  const f=await fixture(),a=await f.connect();
  assert.equal(a.botId,'123456');
  assert.equal(f.hooks.get('123456'),BASE+'/bot/123456/telegram/webhook');
  const other='654321:'+'B'.repeat(35);
  const b=await f.request('/api/configure',{botToken:other,userId:'200002'});
  assert.equal(b.status,200);assert.equal(f.hubs.size,2);
  assert.equal((await f.request('/bot/123456/api/status',undefined,b.data.deviceKey)).status,401);
  assert.equal((await f.request('/bot/123456/api/configure',{botToken:other,userId:'200002'})).status,403);
  const status=await f.request('/bot/123456/api/status',undefined,a.deviceKey);
  assert.equal(status.data.userId,USER);
  assert.ok(!JSON.stringify(status.data).includes(TOKEN));
  assert.ok(!JSON.stringify(status.data).includes('hookSecret'));
});

test('The native alarm sends ten minutes before Istanbul time without a browser, once',async()=>{
  const f=await fixture(),a=await f.connect();
  await f.request('/bot/123456/api/sync',{calendar:calendar(),cursor:0},a.deviceKey);
  const hub=f.hubs.get('bot:123456');
  assert.equal(hub.storage.alarm,Date.parse('2026-11-16T07:50:00Z'));
  f.advance(60000);await hub.alarm();await hub.alarm();
  const messages=f.calls.filter(c=>c.method==='sendMessage');
  assert.equal(messages.length,1);
  assert.match(messages[0].data.text,/10 dakika kaldı/);
  assert.match(messages[0].data.text,/11:00/);
});

test('One-minute closed-app test is a server alarm; pause and cancellation prevent delivery',async()=>{
  const f=await fixture(),a=await f.connect();
  await f.request('/bot/123456/api/test',{delayed:true},a.deviceKey);
  const hub=f.hubs.get('bot:123456');
  assert.equal(hub.storage.alarm,Date.parse('2026-11-16T07:50:00Z'));
  f.advance(60000);await hub.alarm();
  assert.equal(f.calls.filter(c=>c.method==='sendMessage').length,1);
  const g=await fixture(),b=await g.connect(),c=calendar();c.items[0].status='cancelled';
  await g.request('/bot/123456/api/sync',{calendar:c,cursor:0},b.deviceKey);
  g.advance(60000);await g.hubs.get('bot:123456').alarm();
  assert.equal(g.calls.filter(c=>c.method==='sendMessage').length,0);
  await g.request('/bot/123456/api/pause',{paused:true},b.deviceKey);
  assert.equal(g.hubs.get('bot:123456').storage.alarm,null);
});

test('ID lookup filters group/bot updates and never modifies an existing third-party webhook',async()=>{
  const msg=(id,name)=>({message:{from:{id,is_bot:false,first_name:name},chat:{id,type:'private'},text:'/start'}});
  const f=await fixture({updates:[msg(100001,'Furkan'),{message:{from:{id:900001},chat:{id:-1,type:'group'}}},msg(200002,'İkinci'),msg(100001,'Furkan'),{message:{from:{id:123456,is_bot:true},chat:{id:123456,type:'private'}}}]});
  const result=await f.request('/api/identify',{botToken:TOKEN});
  assert.equal(result.status,200);assert.deepEqual(result.data.users.map(u=>u.userId),['100001','200002']);
  assert.equal(f.calls.some(c=>['setWebhook','deleteWebhook','sendMessage'].includes(c.method)),false);
  const other=await fixture({otherHook:'https://another.example/webhook'});
  assert.equal((await other.request('/api/identify',{botToken:TOKEN})).status,400);
  assert.equal(other.calls.some(c=>['getUpdates','setWebhook','deleteWebhook'].includes(c.method)),false);
});

test('Wrong tokens, unknown origins and setup rate limits fail before allocating an account',async()=>{
  const f=await fixture({invalid:true});
  assert.equal((await f.request('/api/configure',{botToken:TOKEN,userId:USER})).status,400);
  assert.equal(f.hubs.size,0);
  const g=await fixture({rateLimited:true});
  assert.equal((await g.request('/api/identify',{botToken:TOKEN})).status,429);
  assert.equal(g.hubs.size,0);assert.equal(g.calls.length,0);
  const h=await fixture();
  assert.equal((await h.request('/api/configure',{botToken:TOKEN,userId:USER},undefined,'https://attacker.example')).status,403);
  assert.equal(h.hubs.size,0);
});

test('Webhook secret and exact private-chat identity protect commands, which stay queued until committed',async()=>{
  const f=await fixture(),a=await f.connect();
  const update={update_id:1,message:{from:{id:100001},chat:{id:100001,type:'private'},text:'/not Aklımdaki fikir'}};
  assert.equal((await f.hook(update,'wrong')).status,403);
  await f.hook({...update,message:{...update.message,from:{id:200002}}});
  assert.equal(await f.hubs.get('bot:123456').storage.get('sequence'),undefined);
  await f.hook(update);await f.hook(update);
  const sync=await f.request('/bot/123456/api/sync',{calendar:calendar(),cursor:0},a.deviceKey);
  assert.equal(sync.data.pending,true);assert.equal(sync.data.events.length,1);
  assert.equal(sync.data.events[0].note.text,'Aklımdaki fikir');
  const committed=await f.request('/bot/123456/api/sync',{calendar:calendar(),cursor:sync.data.cursor},a.deviceKey);
  assert.equal(committed.data.pending,false);
});

test('Reconnect revokes the old device key and a valid token can retrieve its own saved ID',async()=>{
  const f=await fixture(),old=await f.connect(),next=await f.connect();
  assert.equal((await f.request('/bot/123456/api/status',undefined,old.deviceKey)).status,401);
  assert.equal((await f.request('/bot/123456/api/status',undefined,next.deviceKey)).status,200);
  const id=await f.request('/api/identify',{botToken:TOKEN});
  assert.equal(id.data.users[0].userId,USER);
});

test('Time zones, expired reminders and supported Turkish commands retain their meaning',()=>{
  assert.equal(zonedMs('2026-11-16','11:00','Europe/Istanbul'),Date.parse('2026-11-16T08:00:00Z'));
  assert.equal(zonedMs('2026-07-15','09:00','America/New_York'),Date.parse('2026-07-15T13:00:00Z'));
  const c=cleanCalendar(calendar());
  assert.equal(jobsFor(c,Date.parse('2026-11-16T08:10:00Z')).length,0);
  assert.deepEqual(parseCommand('/ekle yarın 09:00 Spor',Date.parse('2026-11-16T12:00:00Z')),{type:'add',date:'2026-11-17',time:'09:00',title:'Spor'});
  assert.equal(parseCommand('Fikrim').type,'note');
  assert.equal(parseCommand('/delete everything').type,'help');
});
