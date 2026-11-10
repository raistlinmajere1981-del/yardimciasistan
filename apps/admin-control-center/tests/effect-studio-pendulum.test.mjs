import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createReadStream,existsSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {extname,resolve,sep} from 'node:path';
import {chromium} from '@playwright/test';
import {siteSceneSource} from '../../../../EfektAtolyesi/scripts/birdesengor-site.mjs';
import {createPendulumSway} from '../../../../EfektAtolyesi/src/runtime/effects/pendulum-sway.mjs';

test('synced Admin edits, roundtrips and previews real pendant artwork using canonical motion',{timeout:90000},async()=>{
 const root=resolve(import.meta.dirname,'../public/effect-studio'),out=resolve('/home/raistlin/ChannelFoundry/channels/birdesengor/web/artifacts/scene-pendulum/admin');mkdirSync(out,{recursive:true});
 const source=siteSceneSource(),state=await source.snapshot();assert.equal(source.readiness(state.scene,state).ready,true);
 const packet={type:'studio:load',scene:state.scene,siteSource:true,previewImage:await source.preview(state),previewObjects:source.previewObjects(state),requestId:'pendulum-review'};
 const types={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png'};
 const server=createServer((req,res)=>{
  const file=resolve(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,''));
  if(!file.startsWith(root+sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'content-type':types[extname(file)]??'application/octet-stream'});createReadStream(file).pipe(res);
 });let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/home/raistlin/.claude-server-commander/puppeteer-cache/chrome/linux-155.0.8059.39/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/scene.html?embedded=1`);await page.waitForFunction(()=>Boolean(window.__sceneEditor));
  const load=async data=>{await page.evaluate(data=>window.postMessage(data,location.origin),data);await page.waitForFunction(()=>window.__sceneEditor.getScene()?.effects.some(e=>e.type==='pendulum-sway'));};
  await load(packet);await page.waitForFunction(()=>{const p=document.querySelector('#scene-photo'),r=document.querySelector('#scene-viewport').getBoundingClientRect();return p.naturalWidth&&Math.abs(r.width/r.height-p.naturalWidth/p.naturalHeight)<.01;});await page.locator('#object-select-metal-pendulum').click();
  const layer='#stage-object-metal-pendulum [data-effect-layer="pendant"]';
  await page.waitForFunction(s=>document.querySelector(s)?.querySelector('img')?.complete,layer);
  assert.equal(await page.locator('#stage-object-metal-pendulum canvas').count(),0);
  assert.equal(await page.locator(layer).evaluate(n=>n.style.rotate),'');
  for(const label of ['Hafif','Doğal','Belirgin']){
   const before=await page.evaluate(()=>window.__sceneEditor.getScene());
   await page.getByRole('button',{name:label,exact:true}).click();
   const after=await page.evaluate(()=>window.__sceneEditor.getScene());
   assert.deepEqual(after.effects.map(e=>e.target),before.effects.map(e=>e.target));
   assert.equal(await page.locator('#effect-profile').innerText(),label);
  }
  for(const key of ['amplitude','frequency','damping','duration','speed'])assert.equal(await page.locator(`#basic-${key}`).count(),1);
  await page.locator('#basic-amplitude').fill('4');await page.locator('#basic-amplitude').dispatchEvent('change');
  const saved=await page.evaluate(()=>window.__sceneEditor.getScene());assert.equal(saved.effects.find(e=>e.type==='pendulum-sway').params.amplitude,4);
  await load({...packet,scene:JSON.parse(JSON.stringify(saved))});await page.locator('#object-select-metal-pendulum').click();
  assert.equal(await page.locator('#basic-amplitude').inputValue(),'4');
  await page.getByRole('button',{name:'Doğal',exact:true}).click();
  await page.screenshot({path:out+'/editor-rest.png'});
  await page.locator('#preview-pulse').click();
  await page.waitForFunction(s=>Math.abs(parseFloat(document.querySelector(s)?.style.rotate)||0)>.2,layer);
  const inspect=await page.evaluate(()=>window.__sceneEditor.inspect());const sample=inspect.overlays.find(o=>o.objectId==='metal-pendulum');
  const reference=createPendulumSway({params:state.scene.effects.find(e=>e.type==='pendulum-sway').params});reference.update(sample.effects[0].elapsed);
  assert.ok(Math.abs(sample.effects[0].angle-reference.inspect().angle)<1e-10,'preview uses the same canonical formula');
  assert.equal(sample.pixelCount,0);assert.equal(await page.locator('#stage-object-metal-pendulum canvas').count(),0);
  await page.screenshot({path:out+'/editor-motion.png'});
  await page.waitForTimeout(2100);assert.equal(await page.locator(layer).evaluate(n=>n.style.rotate),'');
  assert.equal((await page.evaluate(()=>window.__sceneEditor.inspect())).overlays.find(o=>o.objectId==='metal-pendulum').running,false);
  const frames=[];
  // Deterministic review frames use the synced runtime on the same editor DOM.
  for(const [name,time] of [['start',0],['maximum',.108],['damped',.65],['rest',1.8]]){
   const sample=await page.evaluate(async ({time})=>{
    const {createObjectOverlay,compileObjectScene}=await import('/src/runtime/index.mjs');
    const scene=window.__sceneEditor.getScene();scene.effects=scene.effects.filter(e=>e.type==='pendulum-sway');
    // Existing completed preview released through deselection before binding.
    window.__sceneEditor.selectObject('candle');
    const overlay=createObjectOverlay(document.querySelector('#stage-object-metal-pendulum'),compileObjectScene(scene),{objectId:'metal-pendulum',enabled:false});
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    overlay.setPaused(true);overlay.setEnabled(true);overlay.renderAt(time);window.__review=overlay;return overlay.inspect();
   },{time});
   assert.equal(sample.running,false);frames.push({name,time,angle:sample.effects[0].angle});
   await page.screenshot({path:out+`/motion-${name}.png`});await page.evaluate(()=>{window.__review.destroy();delete window.__review;});
  }
  assert.equal(frames[0].angle,0);assert.ok(frames[1].angle>2);assert.equal(frames[3].angle,0);
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#object-select-metal-pendulum').click();await page.locator('#preview-pulse').click();await page.waitForTimeout(80);assert.equal(await page.locator(layer).evaluate(n=>n.style.rotate),'');
  assert.deepEqual(errors,[]);writeFileSync(out+'/results.json',JSON.stringify({frames,savedAmplitude:4,sourceHash:state.sourceHash,errors},null,2));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});

test('built Admin shell forwards artwork and persists/reopens pendant parameters',{timeout:60000},async()=>{
 const root=resolve(import.meta.dirname,'../dist-renderer');
 const source=siteSceneSource(),state=await source.snapshot();
 const packet={scene:state.scene,source:'installed',siteSource:true,sourceHash:state.sourceHash,previewImage:await source.preview(state),previewObjects:source.previewObjects(state),readiness:source.readiness(state.scene,state)};
 const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.woff2':'font/woff2'};
 const server=createServer((req,res)=>{const path=new URL(req.url,'http://local').pathname;const file=resolve(root,path==='/'?'index.html':decodeURIComponent(path).replace(/^\//,''));if(!file.startsWith(root+sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':mime[extname(file)]??'application/octet-stream'});createReadStream(file).pipe(res);});
 let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({executablePath:'/home/raistlin/.claude-server-commander/puppeteer-cache/chrome/linux-155.0.8059.39/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(packet=>{
   let stored=structuredClone(packet);window.__saves=[];
   const run={running:false,targetId:'',action:'',stage:'',startedAt:null,finishedAt:null,result:'idle',exitCode:null,outputTail:[]};
   window.adminControlCenter={
    getOverview:async()=>({generatedAt:new Date().toISOString(),repo:{branch:'local-review',head:'test',dirtyCount:0},product:{},installations:[],release:{},verification:{},counts:{installations:0,healthy:0,drift:0,errors:0}}),
    getVerificationHistory:async()=>[],listSupportReports:async()=>[],getSystemEnvironment:async()=>({androidDevices:[]}),getDeploymentTargets:async()=>[],getDeploymentRunState:async()=>run,getReleaseOperationState:async()=>run,onDeploymentRunState:()=>()=>{},onReleaseOperationState:()=>()=>{},
    listEffectProjects:async()=>[{id:'birdesengor',name:'BirDeSenGör',siteUrl:'',images:[{id:'birdesengor:scene_v2',name:'V2 sahne',available:true,hasDraft:false,hasScene:true,canPublish:false,canPrepare:true,siteSource:true,kind:'sceneObject',sourcePath:'src/effects/birdesengor-effects.v2.json',width:1600,height:900}]}],
    loadEffectScene:async()=>structuredClone(stored),
    saveEffectScene:async(id,scene,sourceHash)=>{window.__saves.push({id,scene,sourceHash});stored={...stored,source:'draft',scene:structuredClone(scene)};return {ok:true,message:'Yerel test belleğine kaydedildi',effectCount:scene.effects.length,readiness:packet.readiness};},
   };
  },packet);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('button.nav-item',{hasText:'Efekt Atölyesi'}).click();
  const frame=page.frameLocator('iframe');await frame.locator('#object-select-metal-pendulum').click();
  const layer=frame.locator('#stage-object-metal-pendulum [data-effect-layer="pendant"]');
  assert.equal(await layer.locator('img').count(),1,'actual Admin shell must forward real artwork');
  await frame.locator('#basic-amplitude').fill('4');await frame.locator('#basic-amplitude').dispatchEvent('change');
  await page.getByRole('button',{name:'Kaydet',exact:true}).click();await page.waitForFunction(()=>window.__saves.length>0);
  const saved=await page.evaluate(()=>window.__saves.at(-1));assert.equal(saved.scene.effects.find(e=>e.type==='pendulum-sway').params.amplitude,4);assert.equal(saved.sourceHash,state.sourceHash);
  assert.equal(saved.scene.previewObjects,undefined,'artwork stays outside persisted effect JSON');
  await page.locator('button.nav-item',{hasText:'Genel Bakış'}).click();await page.locator('button.nav-item',{hasText:'Efekt Atölyesi'}).click();
  await frame.locator('#object-select-metal-pendulum').click();assert.equal(await frame.locator('#basic-amplitude').inputValue(),'4');assert.equal(await layer.locator('img').count(),1);
  await frame.locator('#preview-pulse').click();await page.waitForTimeout(120);assert.notEqual(await layer.evaluate(n=>n.style.rotate),'');
  await page.screenshot({path:'/home/raistlin/ChannelFoundry/channels/birdesengor/web/artifacts/scene-pendulum/admin/admin-shell.png'});
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
