const SESSION='gun-payi-telegram-session';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function serviceUrl(value,{local=false}={}){
 let url;try{url=new URL(value);}catch{throw Error('Bilgisayardaki Telegram bağlantısı tamamlanmalı.');}
 if(url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname)||!(url.protocol==='https:'&&url.hostname.endsWith('.workers.dev')||local&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('Telegram servis adresi geçersiz. Bilgisayardaki bağlantıyı kontrol et.');
 return url.origin;
}
export function mirrorCalendar(state,tz=Intl.DateTimeFormat().resolvedOptions().timeZone){return {prefs:{timeZone:tz||'Europe/Istanbul',reminderDefaults:state.prefs.reminderDefaults??[1440,60]},items:state.items.map(item=>{const out={};for(const key of ['id','title','date','time','endTime','kind','repeat','weekdays','until','area','icon','status','reminders','exceptions','optional','priority','buffer','createdAt','updatedAt'])if(key in item)out[key]=item[key];return out;})};}
export function setupTelegram({getState,applyEvents,canApply=()=>true,onConnected=async()=>{},notify=()=>{}}){
 let session=null,status=null,busy=false,requested=false,timer,lastError='',dirty=false,serviceOrigin='',configLoaded=false,connecting=false,identifying=false;
 try{session=JSON.parse(localStorage.getItem(SESSION)||'null');if(!session?.key||!session.url||session.botId&&!/^\d{5,15}$/.test(String(session.botId)))session=null;}catch{}
 const local=['localhost','127.0.0.1'].includes(location.hostname);
 const save=()=>{if(session)localStorage.setItem(SESSION,JSON.stringify(session));};
 const when=ms=>ms?new Date(ms).toLocaleString('tr-TR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Plan bekliyor';
 function summary(){
  if(!session)return serviceOrigin?'<strong>Telegram’ı bağla</strong><p>Bot tokenını ve kendi kullanıcı ID’ni girmen yeterli.</p>':configLoaded?'<strong>Sunucu hazırlığı bekleniyor</strong><p>Bilgisayardaki bağlantı henüz tamamlanmadı. Telefonda servis kurulumu yapman gerekmiyor.</p>':'<strong>Bağlantı kontrol ediliyor…</strong>';
  if(lastError)return `<strong>Bağlantıyı kontrol et</strong><p>${esc(lastError)}</p>`;
  return `<strong>${status?.paused?'Telegram hatırlatmaları duraklatıldı':dirty?'Planlar aktarılmayı bekliyor':status?.lastSync?'Telegram bağlı':'Bağlantı kontrol ediliyor…'}</strong><p>${status?.botUsername?'@'+esc(status.botUsername)+' · ':''}${esc(session.userId||'')}${status?.lastSync?' · Son aktarım '+esc(when(status.lastSync)):''}</p>${status?.nextAlarm?`<p>Sonraki sunucu kontrolü: ${esc(when(status.nextAlarm))}</p>`:''}${status?.lastError?`<p class="form-error">${esc(status.lastError)}</p>`:''}`;
 }
 function refreshDom(){
  const el=document.getElementById('telegram-status');if(el)el.innerHTML=summary();
  const pause=document.querySelector('[data-tg-action=pause]');if(pause)pause.textContent=status?.paused?'Hatırlatmaları sürdür':'Hatırlatmaları durdur';
  const badge=document.getElementById('telegram-badge');if(badge)badge.textContent=session?'Bağlı':serviceOrigin?'İki adımda bağlan':'Hazırlanıyor';
  for(const b of document.querySelectorAll('#telegram-connect-form button'))b.disabled=!serviceOrigin||connecting||b.dataset.tgAction==='identify'&&identifying;
 }
 function render(){const prefs=getState()?.prefs||{};return `<section class="settings-section telegram-settings" id="telegram-settings"><div class="section-title"><h2>Telegram ve bileklik</h2><span class="setting-status" id="telegram-badge">${session?'Bağlı':serviceOrigin?'İki adımda bağlan':'Hazırlanıyor'}</span></div><div id="telegram-status" role="status">${summary()}</div>${session?`<div class="telegram-actions"><button class="button secondary small" data-tg-action="sync">Şimdi eşitle</button><button class="button secondary small" data-tg-action="test">Telegram’dan dene</button><button class="button secondary small" data-tg-action="delayed">1 dk. sonra dene</button><button class="button text-button small" data-tg-action="pause">${status?.paused?'Hatırlatmaları sürdür':'Hatırlatmaları durdur'}</button><button class="button text-button small" data-tg-action="disconnect">Bağlantıyı kes</button></div><p class="fine">Bir dakikalık denemeyi başlatıp uygulamayı kapatabilirsin.</p>`:''}<details ${session?'':'open'}><summary>${session?'Bağlantıyı değiştir':'Token ve ID'}</summary><form id="telegram-connect-form"><label>Bot tokenı<input required name="botToken" type="password" autocomplete="off" spellcheck="false" placeholder="BotFather’dan aldığın token"></label><label>Telegram kullanıcı ID’n<input required name="userId" inputmode="numeric" pattern="[1-9][0-9]{3,19}" value="${esc(session?.userId||prefs.telegramUserId||'')}" placeholder="Sayısal kullanıcı ID"></label><button type="button" class="button text-button small" data-tg-action="identify" ${serviceOrigin?'':'disabled'}>ID’mi bul</button><p class="fine" id="telegram-id-help">Kendi botunu Telegram’da açıp Başlat’a dokun. Sonra ID’mi bul’a bas.</p><div id="telegram-id-choices"></div><p class="form-error" id="telegram-connect-error" role="status"></p><button type="submit" class="button primary" ${serviceOrigin?'':'disabled'}>Telegram’ı bağla</button><p class="fine">Token sunucuda saklanır. Kullanıcı ID’n bu cihazda hatırlanır; tekrar girmen gerekmez.</p></form><a class="telegram-guide" href="/telegram-setup.html" target="_blank" rel="noopener">Tokenı nasıl alırım?</a></details><p class="fine">Mi Band için Telegram bildirimleri açık, bot sohbeti sesli olmalı.</p><details><summary>Telegram’dan neler yapabilirim?</summary><div class="telegram-help"><code>/ekle yarın 09:00 Sabah yürüyüşü</code><code>/not Aklımdaki fikir</code><code>/bugun</code><code>/yarin</code><code>/hafta</code><code>/tamam 1</code></div><p class="fine">Düz mesajlar not olur. Değişiklikler ajandayı açtığında alınır. Hatırlatmanın “Tamamlandı” düğmesi de çalışır. Ses mesajı ve serbest AI sohbeti bağlı değildir.</p></details><p class="fine">Hatırlatma için planlarının bir kopyası bağlı sunucuya aktarılır. Notların topluca aktarılmaz. Token ve cihaz bağlantı anahtarı JSON yedeğine girmez.</p></section>`;}
 async function loadService(){
  try{const r=await fetch('/telegram-config.json',{cache:'no-store',redirect:'error'});if(!r.ok)throw Error();const c=await r.json();serviceOrigin=c.serviceUrl?serviceUrl(c.serviceUrl,{local}):'';}catch{serviceOrigin='';}finally{configLoaded=true;refreshDom();}
 }
 async function api(path,data,opts={}){
  const url=opts.url||session?.url,key=opts.key||session?.key;
  if(!url||!key&&!opts.public)throw Error('Önce Telegram’ı bağla.');
  const prefix=!opts.public&&session?.botId?'/bot/'+session.botId:'';
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
  try{const response=await fetch(url+prefix+path,{method:data===undefined?'GET':'POST',headers:{...opts.public?{}:{'authorization':'Bearer '+key},...data===undefined?{}:{'content-type':'application/json'}},body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal,redirect:'error',cache:'no-store'});let result;try{result=await response.json();}catch{throw Error('Telegram yanıtı okunamadı.');}if(!response.ok)throw Error(result.error||'Telegram bağlantısı tamamlanamadı.');return result;}catch(e){if(e instanceof TypeError||e.name==='AbortError')throw Error('Telegram’a ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.');throw e;}finally{clearTimeout(timeout);}
 }
 async function sync(){
  if(!session||!navigator.onLine||document.hidden)return false;if(busy){requested=true;return false;}busy=true;
  try{for(let n=0;n<12;n++){const result=await api('/api/sync',{cursor:session.cursor||0,calendar:mirrorCalendar(getState())});if(result.pending){if(!canApply())return false;if(!await applyEvents(result.events))throw Error('Telegram değişiklikleri cihazına kaydedilemedi.');session.cursor=result.cursor;save();continue;}status=result;session.cursor=result.cursor;dirty=false;lastError='';save();refreshDom();return true;}throw Error('Telegram değişiklikleri alınıyor. Biraz sonra yeniden kontrol et.');}catch(e){lastError=e.message;refreshDom();return false;}finally{busy=false;if(requested){requested=false;clearTimeout(timer);timer=setTimeout(sync,800);}}
 }
 function changed(){if(!session)return;dirty=true;refreshDom();clearTimeout(timer);timer=setTimeout(sync,700);}
 function formMessage(message){const e=document.getElementById('telegram-connect-error');if(e)e.textContent=message;else notify(message);}
 async function identify(){
  if(!serviceOrigin)throw Error('Bilgisayardaki sunucu bağlantısı henüz tamamlanmadı.');
  const form=document.getElementById('telegram-connect-form'),botToken=form.elements.botToken.value.trim();if(!botToken)throw Error('Önce bot tokenını yapıştır.');
  const result=await api('/api/identify',{botToken},{url:serviceOrigin,public:true}),users=result.users||[],choices=document.getElementById('telegram-id-choices');if(choices)choices.innerHTML='';
  if(users.length===1){form.elements.userId.value=users[0].userId;formMessage(`${users[0].name?.trim()||'Telegram kullanıcısı'} · ID: ${users[0].userId}. Kendi hesabınsa Telegram’ı bağla’ya dokun.`);}
  else if(users.length){if(choices)choices.innerHTML=users.map(u=>`<button type="button" class="button secondary small" data-tg-user="${esc(u.userId)}">${esc(u.name?.trim()||u.username||'Telegram kullanıcısı')} · ${esc(u.userId)}</button>`).join('');formMessage('Botunda birden fazla kişi bulundu. Kendi hesabını seç.');}
  else throw Error('Botunu Telegram’da açıp Başlat’a dokun, sonra tekrar dene.');
 }
 async function connect(form){
  if(!serviceOrigin)throw Error('Bilgisayardaki sunucu bağlantısı henüz tamamlanmadı.');
  const fields=new FormData(form),userId=String(fields.get('userId')||'').trim(),botToken=String(fields.get('botToken')||'').trim();
  const result=await api('/api/configure',{botToken,userId},{url:serviceOrigin,public:true});
  if(!result.deviceKey||!/^\d{5,15}$/.test(String(result.botId)))throw Error('Sunucu sürümü güncellenmeli.');
  session={url:serviceOrigin,key:result.deviceKey,userId:result.userId,botId:String(result.botId),botUsername:result.botUsername,cursor:0};save();lastError='';status={botUsername:result.botUsername};form.reset();await onConnected({userId:result.userId,url:serviceOrigin});await sync();notify(lastError||'Telegram bağlandı. Deneme mesajı gönderebilirsin.');
 }
 document.addEventListener('submit',e=>{if(e.target.id!=='telegram-connect-form')return;e.preventDefault();e.stopImmediatePropagation();if(connecting)return;connecting=true;const f=e.target,b=f.querySelector('[type=submit]');refreshDom();formMessage('');connect(f).catch(error=>formMessage(error.message)).finally(()=>{connecting=false;refreshDom();});},true);
 document.addEventListener('click',async e=>{
  const user=e.target.closest('[data-tg-user]');if(user){const f=document.getElementById('telegram-connect-form');if(f)f.elements.userId.value=user.dataset.tgUser;document.getElementById('telegram-id-choices')?.replaceChildren();formMessage('ID seçildi. Telegram’ı bağla’ya dokun.');return;}
  const b=e.target.closest('[data-tg-action]');if(!b)return;e.preventDefault();b.disabled=true;
  try{const action=b.dataset.tgAction;
   if(action==='identify'){if(identifying)return;identifying=true;formMessage('Telegram hesabın aranıyor…');try{await identify();}finally{identifying=false;}}
   if(action==='sync')notify(await sync()?'Telegram değişiklikleri alındı, planların aktarıldı.':lastError||'Açık alanı bitirince değişiklikler alınacak.');
   if(action==='test'||action==='delayed'){await sync();if(lastError)throw Error(lastError);await api('/api/test',{delayed:action==='delayed'});notify(action==='delayed'?'Bir dakika sonrası için Telegram denemesi kuruldu. Uygulamayı kapatabilirsin.':'Telegram deneme mesajı gönderildi.');status=await api('/api/status');refreshDom();}
   if(action==='pause'){status=await api('/api/pause',{paused:!status?.paused});refreshDom();notify(status.paused?'Telegram hatırlatmaları durduruldu.':'Telegram hatırlatmaları sürdürüldü.');}
   if(action==='disconnect'){await api('/api/disconnect',{});session=null;status=null;lastError='';localStorage.removeItem(SESSION);const section=document.getElementById('telegram-settings');if(section)section.outerHTML=render();notify('Telegram bağlantısı kesildi. Cihazındaki kayıtlar korunuyor.');}
  }catch(error){if(b.dataset.tgAction==='identify')formMessage(error.message);else notify(error.message);}finally{b.disabled=false;refreshDom();}
 });
 window.addEventListener('online',()=>{void loadService();void sync();});document.addEventListener('visibilitychange',()=>{if(!document.hidden){void loadService();void sync();}});window.addEventListener('focus',()=>void sync());setInterval(()=>{if(!document.hidden)void sync();},30000);
 return {render,changed,sync,isBusy:()=>connecting||identifying||Boolean(document.querySelector('#telegram-connect-form [name=botToken]')?.value.trim()),isConnected:()=>Boolean(session),start:()=>{void loadService();void sync();}};
}
