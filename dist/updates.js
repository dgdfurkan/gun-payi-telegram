// A complete shell activates automatically; each page waits until its work is safe.
export function setupUpdates({container,registration,busy,persist,reload,visible=()=>!document.hidden,online=()=>navigator.onLine,clock=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout}){
 let pendingController=false,applying=false,reloading=false,saving=false,timer,lastInteraction=clock(),lastCheck=0,controlled=Boolean(container.controller);
 const touch=()=>{lastInteraction=clock();};
 const safe=()=>visible()&&online()&&!busy()&&clock()-lastInteraction>=1800;
 async function reloadSafely(force=false){if(reloading||saving||!force&&!safe())return false;saving=true;try{if(!await persist())return false;if(!force&&!safe())return false;reloading=true;reload();return true;}finally{saving=false;}}
 async function apply(force=false){if(applying||reloading)return false;if(pendingController)return reloadSafely(force);const worker=registration.waiting;if(!worker)return false;if(!force&&!safe())return false;applying=true;try{if(!await persist())return false;if(!force&&!safe())return false;worker.postMessage({type:'ACTIVATE_UPDATE'});return true;}finally{applying=false;}}
 function tick(){cancel(timer);timer=schedule(async()=>{if(pendingController)await reloadSafely();else if(registration.waiting)await apply();tick();},1500);}
 const ready=()=>{if(registration.waiting)void apply();};
 container.addEventListener('controllerchange',()=>{if(!controlled){controlled=true;return;}pendingController=true;void reloadSafely();});
 registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')ready();});});
 async function check(force=false){if(!online()||!visible()||!force&&clock()-lastCheck<60000)return;lastCheck=clock();try{await registration.update();ready();}catch{/* Offline shell and local data remain usable. */}}
 tick();ready();void check(true);
 return {touch,check,ready,apply,dispose:()=>cancel(timer)};
}
