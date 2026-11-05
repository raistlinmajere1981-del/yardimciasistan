// Narrow local package/security evidence; no sockets, credentials, backend or deploy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readVersions, assertBackendVersion, releaseTarget, retirementPreview, sha} from './lib/site-release-policy.mjs';
import {checkDemoTemplate} from './sync-demo-template.mjs';
const main=resolve(dirname(fileURLToPath(import.meta.url)),'..'), workspace=dirname(main);
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{cwd:main,encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout;};
const scratch=()=>mkdtempSync(join(tmpdir(),'ya-site-readiness-'));
const sites=[['teknikel_web','teknikel-site'],['gundogdu_web','gundogdu-site']];
for(const [name,id] of sites) test(name+' exact package, redacted deterministic receipt, retirement ownership and protected paths',async()=>{
 const repo=join(workspace,name), {packageFiles,stagePackage}=await import(pathToFileURL(join(repo,'scripts/package-site.mjs')));
 const files=packageFiles(repo);
 for(const p of files)assert.ok(!/^(?:inc|yardimci-asistan)\/|^assets\/(?:assistant|js|i18n|effect-engine)\/|^assets\/[^/]+\.(?:js|mjs|php)$|(?:^|\/)(?:data|storage|keys)\/|\.(?:env|db|sqlite|pem|key)$/.test(p),p);
 const plan=retirementPreview(repo,id,files);assert.ok(Object.keys(plan.files).length>5);
 const one=stagePackage(repo),two=stagePackage(repo);
 try {
  const a=readFileSync(join(one,id.replace('-site','')+'-release.json'),'utf8');
  assert.equal(a,readFileSync(join(two,id.replace('-site','')+'-release.json'),'utf8'));
  const receipt=JSON.parse(a);assert.deepEqual(receipt.files,Object.fromEntries(files.map(p=>[p,sha(join(one,p))])));
  assert.equal(receipt.retirement_mode,'pre-retired-hash-verified');assert.equal(receipt.origin,new URL(receipt.module_url).origin);
  assert.equal(receipt.template_manifest_sha256,sha(join(main,'web-site-template/template-manifest.json')));
  assert.equal(receipt.local_installed_manifest_sha256,sha(join(repo,'canonical/template-manifest.json')));
  assert.equal(receipt.effect_provenance_sha256,sha(join(main,'web-site-template/public/assets/vendor/effect-engine/provenance.json')));
  assert.equal(receipt.retired_paths_sha256,sha(join(one,'retired-paths.json')));
  assert.ok(!/(?:password|sync_secret|api_key|ftp_user|authorization|BEGIN PRIVATE KEY)/i.test(a));
  const sums=spawnSync('sha256sum',['--check','SHA256SUMS'],{cwd:one,encoding:'utf8',timeout:10000});assert.equal(sums.status,0,sums.stderr);
 } finally {rmSync(one,{recursive:true,force:true});rmSync(two,{recursive:true,force:true});}
});

test('site package allowlists reject injected legacy renderer and synthetic secrets while excluding backend data',async()=>{
 for(const [name,id] of sites) {
  const repo=join(workspace,name), {packageFiles}=await import(pathToFileURL(join(repo,'scripts/package-site.mjs'))), dir=scratch();
  try {
   const copy=(source,path)=>{mkdirSync(dirname(join(dir,path)),{recursive:true});cpSync(source,join(dir,path));};
   const files=packageFiles(repo),plan=retirementPreview(repo,id,files);
   for(const p of files)copy(join(repo,p==='retired-paths.json'?'scripts/'+p:p),p==='retired-paths.json'?'scripts/'+p:p);
   for(const p of Object.keys(plan.files))copy(join(repo,p),p);
   mkdirSync(join(dir,'yardimci-asistan/data'),{recursive:true});writeFileSync(join(dir,'yardimci-asistan/data/private.json'),'SYNTHETIC-PRIVATE-ONLY');
   assert.ok(!packageFiles(dir).some(p=>p.startsWith('yardimci-asistan/')));
   for(const base of ['canonical/public/assets/site','assets/site'])writeFileSync(join(dir,base,'credential.json'),'SYNTHETIC-SECRET-ONLY');
   assert.throws(()=>packageFiles(dir),/Unknown site asset/);
   for(const base of ['canonical/public/assets/site','assets/site'])rmSync(join(dir,base,'credential.json'));
   writeFileSync(join(dir,'canonical/public/assets/core/old-widget.js'),'legacy');
   assert.throws(()=>packageFiles(dir),/Installed common files differ/);
  }finally{rmSync(dir,{recursive:true,force:true});}
 }
});

test('version gate follows future central policy and independently rejects either backend mismatch',()=>{
 const dir=scratch();try {
  writeFileSync(join(dir,'product-version.json'),JSON.stringify({version:'9.8.7',webModuleVersion:'9.8.6'}));
  const future=readVersions(dir);assert.equal(assertBackendVersion(future,future),'9.8.7');
  assert.throws(()=>assertBackendVersion({...future,product_version:'2.2.1'},future),/product version mismatch/);
  assert.throws(()=>assertBackendVersion({...future,web_module_version:'2.2.1'},future),/module version mismatch/);
  assert.throws(()=>assertBackendVersion({},future));
  const current=json(join(main,'product-version.json'));assert.deepEqual(readVersions(),{product_version:current.version,web_module_version:current.webModuleVersion});
  rmSync(join(dir,'product-version.json'));symlinkSync(join(main,'product-version.json'),join(dir,'product-version.json'));assert.throws(()=>readVersions(dir),/symlink/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('upgrade target refuses unverified source manifest; legacy preview refuses stale hashes and protected paths',()=>{
 const dir=scratch();try {
  const installed=join(dir,'canonical');cpSync(join(workspace,'teknikel_web/canonical'),installed,{recursive:true});
  releaseTarget(installed);
  const m=json(join(installed,'template-manifest.json'));m.common['core/api.php']='0'.repeat(64);writeFileSync(join(installed,'template-manifest.json'),JSON.stringify(m));assert.throws(()=>releaseTarget(installed),/central target/);
  mkdirSync(join(dir,'scripts'));mkdirSync(join(dir,'assets'));
  writeFileSync(join(dir,'assets/site.js'),'legacy code');
  const p={format:1,identity:'fixture',files:{'assets/site.js':sha(join(dir,'assets/site.js'))}};
  const save=()=>writeFileSync(join(dir,'scripts/retired-paths.json'),JSON.stringify(p));save();retirementPreview(dir,'fixture',[]);
  assert.throws(()=>retirementPreview(dir,'fixture',['assets/site.js']),/Active path/);
  writeFileSync(join(dir,'assets/site.js'),'foreign changed bytes');assert.throws(()=>retirementPreview(dir,'fixture',[]),/ownership changed/);
  p.files={'assets/downloads/demo.zip':'0'.repeat(64)};save();assert.throws(()=>retirementPreview(dir,'fixture',[]),/legacy code/);
  p.files={'inc/config.php':'0'.repeat(64)};save();assert.throws(()=>retirementPreview(dir,'fixture',[]),/Protected/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

// Static Apache rule contract: unconditional deny rules must precede file fallback.
// This is not a claim that Apache was started or the live host honors .htaccess.
function denied(access,path) {
 const lines=access.split('\n');
 for(let i=0;i<lines.length;i++) {
  const match=lines[i].match(/^RewriteRule (\S+) - \[([^\]]+)\]$/);
  if(match && match[2].split(',').includes('F') && !lines[i-1]?.startsWith('RewriteCond') && new RegExp(match[1],match[2].includes('NC')?'i':'').test(path))return true;
 }
 return false;
}
test('deployed access rules deny remaining legacy PHP and JS before physical-file fallback',()=>{
 for(const [name] of [...sites,['blacksea_web']]) {
  const access=readFileSync(join(workspace,name,'.htaccess'),'utf8');
  for(const p of ['inc/site.php','assets/assistant/widget.js','assets/assistant/old.php',...(name==='teknikel_web'?['assets/language.js','inc/layout.php']:['assets/js/language.js','assets/effect-engine/src/runtime/index.mjs'])])assert.ok(denied(access,p),name+': '+p);
  for(const p of ['assets/core/widget.js','assets/vendor/effect-engine/src/runtime/index.mjs','assets/site/scenes/hero.scene.json','yardimci-asistan/api/version.php','assets/downloads/teknikel-demo-verileri.zip'])assert.ok(!denied(access,p),name+': preserved '+p);
 }
 for(const [name] of sites) {
  const deploy=readFileSync(join(workspace,name,'scripts/deploy-site.sh'),'utf8');
  assert.doesNotMatch(deploy,/DEPLOY BLOCKER|exit 4/);
  assert.match(deploy,/retired_sha=.*sha256sum/);
  assert.match(deploy,/Retired legacy path still present/);
  assert.match(deploy,/sha256sum "\$root\/retired-paths\.json"/);
  assert.match(deploy,/site-release-target\.mjs --verify-backend/);
  assert.match(deploy,/StrictHostKeyChecking=yes/);assert.match(deploy,/--proto '=https'/);assert.match(deploy,/site-release-target.mjs --verify-backend/);
  assert.ok(!deploy.includes('2.2.1')&&!deploy.includes('0.6.1'));
 }
});

test('BlackSea staging excludes duplicate engines, foreign paths and secrets; demo manifest independently verifies',()=>{
 const dir=scratch(),stage=join(dir,'stage'),script=join(workspace,'blacksea_web/scripts/stage-site.mjs');
 try {
  run('node',[script,stage]);run('node',[script,stage,'--check']);
  const receipt=json(join(stage,'blacksea-site-release.json'));
  for(const p of Object.keys(receipt.files))assert.ok(!/^(?:assets|inc|yardimci-asistan|config|storage)\//.test(p),p);
  assert.ok(!/(?:password|sync_secret|api_key|authorization)/i.test(JSON.stringify(receipt)));
  const extra=join(stage,'public/assets/site/credential.json');writeFileSync(extra,'{"secret":"SYNTHETIC-ONLY"}');
  let result=spawnSync('node',[script,stage,'--check'],{encoding:'utf8',timeout:20000});assert.notEqual(result.status,0);assert.match(result.stderr,/Unknown\/private/);rmSync(extra);
  writeFileSync(join(stage,'foreign.php'),'<?php');result=spawnSync('node',[script,stage,'--check'],{encoding:'utf8',timeout:20000});assert.notEqual(result.status,0);assert.match(result.stderr,/Unknown\/private/);
  checkDemoTemplate(join(main,'test-site/landing'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
