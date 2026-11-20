/** Pinned Microsoft Visual C++ runtime payload for offline Windows installation. */
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const dir=join(resolve(import.meta.dirname,'..'),'apps/desktop-app/resources/vc-runtime');
export const REDISTRIBUTABLES=Object.freeze({
 x64:{url:'https://aka.ms/vc14/vc_redist.x64.exe',sha256:'9c02c9ed120f671b900e6b9471d890e3b2414117a7e53f4ae2e855466fa2b7c9'},
 ia32:{url:'https://aka.ms/vc14/vc_redist.x86.exe',sha256:'7b0117e6e20e9e349029c000a8a2715a52cf37c15b6bb697b2908e8bc7066cdf'}
});
export const vcRuntimePath=arch=>join(dir,'VC_redist.'+arch+'.exe');
export function assertVcRuntime(bytes,arch){
 const sha=createHash('sha256').update(bytes).digest('hex');
 if(bytes.length<1024*1024||bytes.length>45*1024*1024||bytes.toString('ascii',0,2)!=='MZ'||sha!==REDISTRIBUTABLES[arch]?.sha256)
  throw Error('Microsoft VC++ '+arch+' installer SHA256/PE check failed; review pinned upstream version.');
}
async function prepare(){
 const check=process.argv.includes('--check');
 if(!check)mkdirSync(dir,{recursive:true});
 for(const [arch,item] of Object.entries(REDISTRIBUTABLES)){
  const target=vcRuntimePath(arch);
  if(!existsSync(target)){
   if(check)throw Error('Windows VC++ '+arch+' installer not staged.');
   const response=await fetch(item.url,{signal:AbortSignal.timeout(90_000)});
   if(!response.ok||!response.body)throw Error('Microsoft VC++ download failed: '+response.status);
   const chunks=[];let size=0;
   for await(const chunk of response.body){size+=chunk.length;if(size>45*1024*1024)throw Error('VC++ runtime too large.');chunks.push(chunk);}
   const bytes=Buffer.concat(chunks);assertVcRuntime(bytes,arch);
   const tmp=target+'.'+process.pid+'.tmp';
   try{writeFileSync(tmp,bytes);renameSync(tmp,target);}finally{rmSync(tmp,{force:true});}
  }
  assertVcRuntime(readFileSync(target),arch);console.log('vc-runtime '+arch+': SHA-256 verified');
 }
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename))await prepare();
