import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const executable=process.platform==='win32'?'npx.cmd':'npx';
function run(args,{capture=false}={}){return new Promise((resolve,reject)=>{const child=spawn(executable,['wrangler',...args],{stdio:['inherit',capture?'pipe':'inherit','inherit'],shell:false});let output='';if(capture)child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk)});child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(Error('Cloudflare adımı tamamlanamadı.')));});}
console.log('Bilgisayar kurulumu. Telefonda yalnız bot tokenı ve kullanıcı ID’si istenir.');
await run(['login']);
const output=await run(['deploy','--config','wrangler.jsonc'],{capture:true});
const url=output.match(/https:\/\/[a-zA-Z0-9.-]+\.workers\.dev\b/)?.[0];
if(!url)throw Error('Worker adresi doğrulanamadı; uygulama yapılandırması değiştirilmedi.');
const response=await fetch(url+'/health',{signal:AbortSignal.timeout(15000)}),health=await response.json();
if(!response.ok||health.service!=='gun-payi-telegram'||!health.alarm||!health.simpleSetup)throw Error('Zamanlayıcı sağlık kontrolü başarısız; uygulama yapılandırması değiştirilmedi.');
const config=JSON.stringify({serviceUrl:url})+'\n';
const option=process.argv.indexOf('--config-output');
if(option>=0){if(!process.argv[option+1])throw Error('Yapılandırma dosyası yolu eksik.');await writeFile(process.argv[option+1],config);console.log('Uygulamanın servis adresi hazırlandı. Gün Payı kaynak sürümünü normal yayın akışıyla yayınla.');}
else console.log('Bilgisayarda yayınlayacak kişinin dist/telegram-config.json için kullanacağı yapılandırma:\n'+config);
console.log('Telefona servis adresi veya kurulum anahtarı girilmez. Bot tokenı bu kurulum sırasında istenmez.');
