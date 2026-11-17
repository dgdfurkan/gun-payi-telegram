import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
 const path=join(dir,entry.name);
 return entry.isDirectory()?files(path):/\.m?js$/.test(entry.name)?[path]:[];
});}
const paths=['dist','telegram-worker','scripts'].flatMap(dir=>files(join(root,dir)));
for(const path of paths){
 const result=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
console.log(`${paths.length} JavaScript files passed syntax checks.`);
