// Explicit asset preparation; --check never repairs. No hosting/API/publication changes.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('runtime/',import.meta.url));
const [mode,target]=process.argv.slice(2);
if(!['--check','--apply'].includes(mode)||!target)throw Error('Usage: node packages/image-inspector/sync-web.mjs --check|--apply <site-assets-directory>');
const destination=resolve(target,'image-inspector');
if(mode==='--apply')mkdirSync(destination,{recursive:true});
for(const name of ['core.js','worker.js','inspector.js','inspector.css']){
  const bytes=readFileSync(resolve(source,name)),path=resolve(destination,name);
  if(mode==='--apply')writeFileSync(path,bytes);
  else if(!bytes.equals(readFileSync(path)))throw Error('Shared inspector differs: '+path);
}
console.log('image-inspector: '+mode+' OK');
