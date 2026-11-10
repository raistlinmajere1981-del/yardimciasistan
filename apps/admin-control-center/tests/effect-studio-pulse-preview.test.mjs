import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createReadStream,existsSync,statSync,mkdirSync} from 'node:fs';
import {extname,resolve,sep} from 'node:path';
import {chromium} from '@playwright/test';
import {siteSceneSource} from '../../../../EfektAtolyesi/scripts/birdesengor-site.mjs';

// Load exactly the source packet used by Admin. No draft/stage/publish writes.
test('Admin source editor previews one finite canonical pulse and preserves Round 1 sliders/profiles',{timeout:60000},async()=>{
  const root=resolve(import.meta.dirname,'../../../../EfektAtolyesi');
  const source=siteSceneSource(),state=await source.snapshot();
  assert.equal(source.readiness(state.scene,state).ready,true);
  const packet={type:'studio:load',scene:state.scene,siteSource:true,previewImage:await source.preview(state),requestId:'round2'};
  const types={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png'};
  const server=createServer((req,res)=>{
    const file=resolve(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,''));
    if(!file.startsWith(root+sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404).end();return;}
    res.writeHead(200,{'content-type':types[extname(file)]??'application/octet-stream'});createReadStream(file).pipe(res);
  });
  let browser;
  try{
    await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/brave',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/scene.html?embedded=1`);
    await page.waitForFunction(()=>Boolean(window.__sceneEditor));await page.evaluate(packet=>window.postMessage(packet,location.origin),packet);
    await page.waitForFunction(()=>window.__sceneEditor.getScene()?.effects.length===9);
    assert.equal(await page.locator('.scene-object canvas').count(),3,'pulse slots stay dormant');
    for(const id of ['guardian-sword-left','guardian-sword-right','water-basin']){
      await page.locator(`#object-select-${id}`).click();
      assert.equal(await page.locator('#basic-duration').count(),1);
      const before=await page.evaluate(()=>window.__sceneEditor.getScene());
      await page.getByRole('button',{name:'Hafif',exact:true}).click();
      const after=await page.evaluate(()=>window.__sceneEditor.getScene());
      assert.deepEqual(after.effects.map(effect=>effect.target),before.effects.map(effect=>effect.target));
      await page.locator('#preview-pulse').click();await page.waitForTimeout(350);
      const painted=await page.locator(`#stage-object-${id} canvas`).evaluateAll(nodes=>nodes.some(c=>{
        const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<data.length;i+=4)if(data[i])return true;return false;
      }));assert.equal(painted,true,id+' canonical pixels');
      mkdirSync('/tmp/birdesengor-effect-round2-preview',{recursive:true});
      await page.screenshot({path:`/tmp/birdesengor-effect-round2-preview/admin-${id}.png`});
      await page.waitForTimeout(1300);
      assert.equal(await page.locator(`#stage-object-${id} canvas`).evaluateAll(nodes=>nodes.every(c=>c.style.display==='none')),true);
    }
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await new Promise(done=>server.close(done));}
});
