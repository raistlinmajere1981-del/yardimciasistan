import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
const root=mkdtempSync(join(tmpdir(),'instagram-stage-')),secret='fixture-staging-secret';
cpSync('firm-template/web-module',root,{recursive:true});writeFileSync(join(root,'config/business.json'),JSON.stringify({sync_secret:secret}));
// The PHP development server ignores .htaccess. Restrict test routing as production's data guard does.
writeFileSync(join(root,'router.php'),`<?php $path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH); if(str_starts_with($path,'/data/')){http_response_code(403);exit;}return false;`);
const port=await new Promise(resolve=>{const server=http.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const child=spawn('php',['-S',`127.0.0.1:${port}`,'-t',root,join(root,'router.php')],{stdio:'ignore'}),base=`http://127.0.0.1:${port}/api/instagram-media.php`;
const bytes=readFileSync('scripts/fixtures/instagram-square.jpg'),token=randomBytes(32).toString('hex'),expires=String(Math.floor(Date.now()/1000)+60);
const form=(patch={})=>{const fields={operation:'upload',token,expires,...patch},data=new FormData();for(const [key,value]of Object.entries(fields))data.set(key,value);if(fields.operation==='upload')data.set('file',new Blob([patch.bytes??bytes],{type:patch.mime??'image/jpeg'}),'image.jpg');return data;};
const post=(data,authorized=true)=>fetch(base,{method:'POST',headers:authorized?{'X-YA-Sync-Secret':secret}:{},body:data});
try {
  for(let i=0;i<50;i++){try{await fetch(base);break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.equal((await post(form(),false)).status,401);
  assert.equal((await post(form({token:'../config/business.json'}))).status,422);
  assert.equal((await post(form({bytes:Buffer.from('<?php echo 1;'),mime:'image/jpeg'}))).status,422);
  assert.equal((await post(form({bytes:readFileSync('scripts/test-helpers/marketing-fixtures.mjs'),mime:'text/html'}))).status,422);
  assert.equal((await post(form({expires:String(Math.floor(Date.now()/1000)-1)}))).status,422);
  assert.equal((await post(form({expires:String(Math.floor(Date.now()/1000)+1500)}))).status,422);
  assert.equal((await post(form({bytes:Buffer.alloc(8388609)}))).status,413);
  assert.equal((await post(form())).status,200);assert.equal((await post(form())).status,200);
  let result=await fetch(`${base}/${token}.jpg`);assert.equal(result.status,200);assert.equal(result.headers.get('content-type'),'image/jpeg');assert.equal(result.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await result.arrayBuffer()),bytes);
  for(const path of ['','/','/%2e%2e%2fconfig%2fbusiness.json','/unknown.jpg',`/${token}.jpg?token=ignored`])assert.equal((await fetch(base+path)).status,404);
  assert.equal((await fetch(`${base.replace('/api/instagram-media.php','')}/data/instagram-staging/`)).status,403);
  const files=readdirSync(join(root,'data/instagram-staging'));assert.equal(files.length,1);assert.equal(files[0].includes(token),false);
  assert.equal((await post(form({operation:'delete'}))).status,200);assert.equal((await fetch(`${base}/${token}.jpg`)).status,404);assert.equal((await post(form({operation:'delete'}))).status,200);
  // Server-side expiration is enforced on every read even without prune/desktop cleanup.
  assert.equal((await post(form())).status,200);
  const check=spawnSync('php',['-r',`require $argv[1];if(ya_instagram_stage_find($argv[2],(int)$argv[3])!==null)exit(1);`,join(root,'lib/instagram-staging.php'),token,expires]);assert.equal(check.status,0,check.stderr.toString());
  assert.equal((await fetch(`${base}/${token}.jpg`)).status,404);
  console.log('D5 PHP staging: authenticated bounded JPEG upload, immutable replay, binary reads, traversal/MIME/query/expiry guards and idempotent cleanup passed.');
} finally {child.kill();await new Promise(resolve=>child.once('exit',resolve));rmSync(root,{recursive:true,force:true});}
