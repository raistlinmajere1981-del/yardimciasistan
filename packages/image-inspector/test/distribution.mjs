import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const site=process.argv[2],apk=process.argv[3];
if(!site||!apk)throw Error('Usage: node packages/image-inspector/test/distribution.mjs <site-repository> <built-apk>');
const hashes={};
for(const name of ['core.js','worker.js','inspector.js','inspector.css']){
 const source=readFileSync(new URL('../runtime/'+name,import.meta.url));
 const canonical=readFileSync(resolve(site,'canonical/public/assets/site/image-inspector',name));
 const mirror=readFileSync(resolve(site,'assets/site/image-inspector',name));
 const android=execFileSync('unzip',['-p',apk,'assets/'+name],{maxBuffer:1024*1024});
 assert.ok(source.equals(canonical)&&source.equals(mirror)&&source.equals(android),'Different runtime on a consumer: '+name);
 hashes[name]=createHash('sha256').update(source).digest('hex');
}
mkdirSync('artifacts/image-inspector',{recursive:true});writeFileSync('artifacts/image-inspector/distribution.json',JSON.stringify(hashes,null,2)+'\n');
console.log('PASS byte-identical source, canonical site, public mirror and built Android APK: '+Object.keys(hashes).join(', '));
