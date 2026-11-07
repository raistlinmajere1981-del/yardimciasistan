// Narrow read-only cross-site check. No HTTP listener, browser, DB or site writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {canonicalProvenance, checkCopy} from '../web-site-template/tools/sync-effect-engine.mjs';
const main=resolve(dirname(fileURLToPath(import.meta.url)),'..'), workspace=resolve(main,'..');
const template=join(main,'web-site-template');
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const manifest=json(join(template,'template-manifest.json'));
const widgetSha='7984a72b2c7c5caee57dcb5856c0f634679cdcbc7fff62ac7eb2cb3d2947d5e6';
const sites=[
 {name:'BlackSea',root:join(workspace,'blacksea_web'),entry:join(workspace,'blacksea_web/index.php'),id:'blacksea-pansiyon',base:''},
 {name:'Teknikel',root:join(workspace,'teknikel_web/canonical'),entry:join(workspace,'teknikel_web/index.php'),id:'teknikel-site',base:''},
 {name:'Gundogdu',root:join(workspace,'gundogdu_web/canonical'),entry:join(workspace,'gundogdu_web/index.php'),id:'gundogdu-site',base:''},
 {name:'Demo',root:join(main,'test-site/landing/deneme'),entry:join(main,'test-site/landing/deneme/index.php'),id:'yardimci-site',base:'/deneme',demo:true}
];
const mapped=(site,p)=>site.demo ? (p==='public/index.php'?'entry.php':p.startsWith('public/assets/')?p.slice(7):p.startsWith('core/')?p:null):p;
function php(args) {
 const result=spawnSync('php',['-d','disable_functions=proc_open',...args],{encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024,cwd:main});
 assert.equal(result.status,0,result.stderr||result.stdout||String(result.error));
 assert.equal(result.stderr,'','Unexpected PHP diagnostics'); return result.stdout;
}
test('canonical + Admin + actual EfektAtolyesi provenance and independent themes', async()=>{
 assert.equal(manifest.template_version,'0.8.0'); assert.equal(Object.keys(manifest.common).length,87);
 assert.equal(hash(join(template,'public/assets/core/widget.js')),widgetSha);
 const provenance=await canonicalProvenance(join(workspace,'EfektAtolyesi'));
 assert.equal(Object.keys(provenance.files).length,19);
 checkCopy(join(template,'public/assets/vendor/effect-engine'),provenance);
 checkCopy(join(main,'apps/admin-control-center/public/effect-studio'),provenance,{strict:false,provenancePath:join(main,'apps/admin-control-center/effect-engine-provenance.json')});
 const themes=sites.map(site=>hash(join(site.root,site.demo?'assets/site/theme.css':'public/assets/site/theme.css')));
 assert.equal(new Set(themes).size,4,'Each site retains its own theme');
 for(const site of sites) assert.ok(!Object.keys(manifest.common).some(p=>/^(site\/|locales\/|public\/assets\/site\/)/.test(p)),site.name+' owned paths outside manifest');
});
for(const site of sites) test(site.name+' real root, common bytes, active public assets, source + publication gates',()=>{
 assert.deepEqual(json(join(site.root,'template-manifest.json')),manifest);
 for(const [p,sha] of Object.entries(manifest.common)) {
   const path=mapped(site,p); if(path) assert.equal(hash(join(site.root,path)),sha,site.name+': '+path);
 }
 const assets=site.demo?join(site.root,'assets'):site.name==='BlackSea'?join(site.root,'public/assets'):join(site.root,'../assets');
 assert.equal(hash(join(assets,'site/theme.css')),hash(join(site.root,site.demo?'assets/site/theme.css':'public/assets/site/theme.css')),site.name+' served site-owned theme');
 for(const [p,sha] of Object.entries(manifest.common)) if(p.startsWith('public/assets/')) assert.equal(hash(join(assets,p.slice(14))),sha,site.name+' served asset '+p);
 assert.deepEqual(readdirSync(join(site.root,'locales')).filter(p=>p.endsWith('.json')),['tr.json'],'Single Turkish source; no static target dictionary');
 // Exercise the real source endpoint through the actual site entry, which exits before any API read.
 const source=JSON.parse(php(['-r','$_SERVER["REQUEST_METHOD"]="GET"; $_SERVER["REQUEST_URI"]=$argv[2]."/?resource=translation-source"; $_GET=["resource"=>"translation-source"]; require $argv[1];',site.entry,site.base]));
 assert.equal(source.id,site.id); assert.equal(source.source_language,'tr');
 for(const [key,entry] of Object.entries(source.entries)) assert.equal(entry.hash,createHash('sha256').update(entry.text).digest('hex'),key);
 const revision=Object.keys(source.entries).sort().map(key=>`${key}:${source.entries[key].hash}\n`).join('');
 assert.equal(source.revision,createHash('sha256').update(revision).digest('hex'));
 const result=JSON.parse(php([join(main,'scripts/fixtures/site-template-parity.php'),site.entry,site.root,site.id,join(site.root,site.demo?'entry.php':'public/index.php'),site.base]));
 assert.ok(result.actual_root && result.ai_off_requests_on && result.published_targets_only && result.panorama_ssr);
 console.log(site.name+': '+JSON.stringify(result));
});
