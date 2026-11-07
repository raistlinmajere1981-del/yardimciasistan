import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';
const runtime=fileURLToPath(new URL('../runtime/',import.meta.url));
const fixture=JSON.parse(readFileSync(new URL('fixture.json',import.meta.url)));
const photo=readFileSync(new URL('../../../scripts/demo-data/assets/photos/table-m1-photo.jpg',import.meta.url));
const requests=[],results=[];
const server=createServer((req,res)=>{
 requests.push({method:req.method,path:req.url});
 if(req.url.startsWith('/photo')){const send=()=>{res.setHeader('content-type','image/jpeg');res.end(photo);};if(req.url.includes('slow'))setTimeout(send,400);else send();return;}
 if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/inspector.css"><script src="/core.js"></script><script src="/inspector.js"></script><button id="open">Aç</button></html>');return;}
 const name=req.url.slice(1);if(!['core.js','inspector.js','worker.js','inspector.css'].includes(name)){res.writeHead(404);res.end();return;}
 res.setHeader('content-type',name.endsWith('.css')?'text/css':'application/javascript');res.end(readFileSync(runtime+name));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/brave',args:['--no-sandbox']});
mkdirSync('artifacts/image-inspector',{recursive:true});
try{
 for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:960},reducedMotion:'reduce',hasTouch:true}),errors=[];
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.evaluate(()=>{
   const NativeWorker=window.Worker;window.liveWorkers=0;
   window.Worker=class extends NativeWorker{constructor(...args){super(...args);window.liveWorkers++;this.live=true;}terminate(){if(this.live){window.liveWorkers--;this.live=false;}return super.terminate();}};
   window.openTest=()=>window.viewer=window.ImageInspector.open({title:'Pompa fotoğrafı',items:[{name:'Pompa',urls:['/photo/a','/photo/b','/photo/slow']}],opener:document.querySelector('#open')});
   document.querySelector('#open').onclick=window.openTest;
  });
  await page.click('#open');await page.waitForFunction(()=>document.querySelector('canvas')?.width>1&&!document.querySelector('canvas')?.hidden);
  const pane=page.locator('.ii-pane').first(),bounds=await pane.boundingBox();
  const cdp=await page.context().newCDPSession(page),cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-20,y:cy,id:1},{x:cx+20,y:cy,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-45,y:cy,id:1},{x:cx+45,y:cy,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(await page.evaluate(()=>window.viewer.session.layers[0].transform.zoom)>1,'native touch pinch');
  await page.getByRole('button',{name:'Görünümü sıfırla'}).click();
  const exact=await page.evaluate(f=>Object.fromEntries(Object.keys(f.expected).map(mode=>[mode,[...window.ImageInspectorCore.apply(new Uint8ClampedArray(f.rgba),f.width,f.height,mode)]])),fixture);assert.deepEqual(exact,fixture.expected);
  await page.getByRole('button',{name:'Yakınlaştır',exact:true}).click();await page.getByRole('button',{name:'90° sağa döndür'}).click();
  const before=await page.evaluate(()=>window.viewer.session.layers[0].transform.snapshot());assert.equal(before.rotation,90);assert.equal(before.zoom,1.25);
  for(const mode of ['Detay','Kod','Negatif','Kenar','Normal']){await page.getByRole('button',{name:mode,exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.ii-pane').hasAttribute('aria-busy'));assert.deepEqual(await page.evaluate(()=>window.viewer.session.layers[0].transform.snapshot()),before);}
  await page.getByRole('button',{name:'2. fotoğrafı göster'}).click();await page.waitForFunction(()=>!document.querySelector('.ii-pane').hasAttribute('aria-busy'));assert.equal(await page.evaluate(()=>window.viewer.session.layers[0].transform.zoom),1);
  await page.getByRole('button',{name:'3. fotoğrafı göster'}).click();await page.getByRole('button',{name:'Kenar',exact:true}).click();await page.getByRole('button',{name:'Negatif',exact:true}).click();await page.getByRole('button',{name:'Kod',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.ii-pane').hasAttribute('aria-busy'));assert.equal(await page.evaluate(()=>window.viewer.session.layers[0].mode),'code');assert.equal(await page.evaluate(()=>window.liveWorkers),0);
  await page.locator('input[type=file]').first().setInputFiles({name:'mine.jpg',mimeType:'image/jpeg',buffer:photo});
  await page.waitForFunction(()=>document.querySelectorAll('canvas')[1]?.width>1&&!document.querySelectorAll('canvas')[1]?.hidden);
  await page.locator('input[type=file]').first().setInputFiles({name:'replacement.jpg',mimeType:'image/jpeg',buffer:Buffer.from('corrupt replacement')});
  await page.getByText('Desteklenmeyen, bozuk veya çok büyük fotoğraf.').waitFor();
  await expect(page.locator('.ii-thumbs img')).toHaveCount(0);
  await page.locator('input[type=file]').first().setInputFiles({name:'mine.jpg',mimeType:'image/jpeg',buffer:photo});
  await page.waitForFunction(()=>document.querySelectorAll('canvas')[1]?.width>1&&!document.querySelectorAll('canvas')[1]?.hidden);
  assert.equal(await page.evaluate(()=>window.viewer.session.mode),'compare');
  const geometry=await page.locator('.ii-pane').evaluateAll(nodes=>nodes.map(n=>({width:n.clientWidth,height:n.clientHeight,top:n.getBoundingClientRect().top})));
  if(width<600)assert.ok(geometry[1].top>geometry[0].top,'mobile comparison stacks full-width panes');else assert.equal(geometry[1].top,geometry[0].top);
  await page.getByRole('button',{name:'Üst üste',exact:true}).click();await page.getByRole('slider',{name:'Saydamlık'}).fill('25');assert.equal(await page.evaluate(()=>window.viewer.session.opacity),.25);
  await page.getByRole('button',{name:'Yakınlaştır',exact:true}).click();assert.equal(await page.evaluate(()=>window.viewer.session.layers[0].transform.zoom),1);assert.equal(await page.evaluate(()=>window.viewer.session.layers[1].transform.zoom),1.25);
  await page.getByRole('button',{name:'Birlikte hareket',exact:true}).click();await page.getByRole('button',{name:'90° sola döndür'}).click();assert.equal(await page.evaluate(()=>window.viewer.session.layers[0].transform.rotation),270);assert.equal(await page.evaluate(()=>window.viewer.session.layers[1].transform.rotation),270);
  await page.getByRole('button',{name:'Hizalamayı sıfırla'}).click();assert.equal(await page.evaluate(()=>window.viewer.session.opacity),.5);
  assert.ok(await page.locator('.ii-tools button').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)));
  assert.ok(await page.evaluate(()=>document.querySelector('.ya-inspector').scrollWidth<=innerWidth));
  await page.screenshot({path:`artifacts/image-inspector/compare-${width}.png`});
  await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveCount(0);assert.equal(await page.evaluate(()=>window.liveWorkers),0);assert.equal(await page.locator('#open').evaluate(n=>n===document.activeElement),true);
  await page.click('#open');await page.waitForFunction(()=>document.querySelector('canvas')?.width>1);await page.locator('input[type=file]').first().setInputFiles({name:'broken.jpg',mimeType:'image/jpeg',buffer:Buffer.from('broken')});await page.getByText('Desteklenmeyen, bozuk veya çok büyük fotoğraf.').waitFor();
  await page.evaluate(()=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array(30*1024*1024+1)],'oversized.jpg',{type:'image/jpeg'}));const input=document.querySelector('input[type=file]');input.files=data.files;input.dispatchEvent(new Event('change'));});
  await page.getByText('JPEG, PNG veya WebP seçin (en fazla 30 MB).').waitFor();
  if(width===1440){
    const exifDimensions=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg')),raw=new Uint8Array(await blob.arrayBuffer());
      const app=new Uint8Array(36),v=new DataView(app.buffer);app.set([255,225,0,34,69,120,105,102,0,0,77,77,0,42]);v.setUint32(14,8);v.setUint16(18,1);v.setUint16(20,0x112);v.setUint16(22,3);v.setUint32(24,1);v.setUint16(28,6);
      const transfer=new DataTransfer();transfer.items.add(new File([raw.slice(0,2),app,raw.slice(2)],'oriented.jpg',{type:'image/jpeg'}));const input=document.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change'));
      while(document.querySelectorAll('.ii-pane')[1].hasAttribute('aria-busy'))await new Promise(resolve=>setTimeout(resolve,10));
      const c=document.querySelectorAll('canvas')[1];return [c.width,c.height];
    });
    assert.deepEqual(exifDimensions,[600,800],'EXIF quarter-turn must preserve aspect ratio through Worker resize');
    const timing=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=3840;canvas.height=2160;const ctx=canvas.getContext('2d');const gradient=ctx.createLinearGradient(0,0,3840,2160);gradient.addColorStop(0,'#123456');gradient.addColorStop(1,'#fedcba');ctx.fillStyle=gradient;ctx.fillRect(0,0,3840,2160);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=1;
      const transfer=new DataTransfer();transfer.items.add(new File([blob],'large.png',{type:'image/png'}));const input=document.querySelector('input[type=file]');input.files=transfer.files;
      let ticks=0;const heartbeat=setInterval(()=>ticks++,10),start=performance.now();input.dispatchEvent(new Event('change'));
      while(document.querySelectorAll('.ii-pane')[1].hasAttribute('aria-busy'))await new Promise(resolve=>setTimeout(resolve,10));
      const decodeMs=performance.now()-start,c=document.querySelectorAll('canvas')[1];
      const filterStart=performance.now();document.querySelector('button[aria-label=Kenar]').click();
      while(document.querySelectorAll('.ii-pane')[1].hasAttribute('aria-busy'))await new Promise(resolve=>setTimeout(resolve,10));
      clearInterval(heartbeat);return {decodeMs,filterMs:performance.now()-filterStart,ticks,width:c.width,height:c.height};
    });
    assert.ok(timing.width<=1600&&timing.height<=1600&&timing.ticks>0);writeFileSync('artifacts/image-inspector/performance.json',JSON.stringify(timing,null,2));
  }
  await page.keyboard.press('Escape');assert.deepEqual(errors,[]);await page.close();results.push({width,checks:'five modes, golden pixels, geometry, photo change, race, independent/linked overlay, opacity, local file, corrupt image, focus, cleanup'});console.log('PASS browser '+width);
 }
 assert.ok(requests.every(r=>r.method==='GET'),'Personal photo must never cause POST/PUT');assert.ok(!requests.some(r=>/personal|mine/.test(r.path)));
 writeFileSync('artifacts/image-inspector/browser.json',JSON.stringify({results,requests},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
