// Isolated browser regression: common assets only; no site backend or real writes.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
import {launchChromiumForSmoke} from './test-helpers/playwright-browser.mjs';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root));
const messages=JSON.parse(read('web-site-template/locales/tr.json'));
const image=read('scripts/demo-data/assets/panoramas/room-360.jpg');
const widget=read('web-site-template/public/assets/core/widget.js');
let submissions=0, pending;
const html=`<!doctype html><html lang="tr"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/site.css"></head><body>
<button id="before">TEST</button><div class="room-media">${['panorama_180','panorama_360'].map(kind=>`<figure><div data-panorama="${kind}" data-src="/photo.jpg" data-label="TEST ${kind}"><img src="/photo.jpg" alt="TEST"></div><figcaption><a href="/photo.jpg">TEST original</a></figcaption></figure>`).join('')}</div>
<script type="application/json" id="site-context">${JSON.stringify({language:{messages}})}</script><script type="module" src="/panorama.mjs"></script>
<script src="/widget.js" data-api-base-url="/fixture" data-business-name="TEST"></script></body></html>`;
const server=http.createServer((req,res)=>{
  const files={'/site.css':['text/css',read('web-site-template/public/assets/core/site.css')],'/panorama.mjs':['text/javascript',read('web-site-template/public/assets/core/panorama.mjs')],'/widget.js':['text/javascript',widget],'/photo.jpg':['image/jpeg',image]};
  if(req.url==='/fixture/api/business.php'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,business:{display_name:'TEST',ai_enabled:false,requests_enabled:true,request_types:['general_info'],public_surfaces:[],whatsapp_enabled:false}}));}
  else if(req.url==='/fixture/api/request.php'){submissions++;req.resume();pending=()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,request_id:'TEST'}));};}
  else if(files[req.url]){const [type,data]=files[req.url];res.setHeader('Content-Type',type);res.end(data);}
  else if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}
  else {res.statusCode=404;res.end();}
});
let browser;
try {
  // One HTTP listen attempt; sandbox EPERM requires the host, never a retry.
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const base=`http://127.0.0.1:${server.address().port}`;
  browser=await launchChromiumForSmoke(chromium,{headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const width of [390,1440]) {
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:width===390?'reduce':'no-preference'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    const page=await context.newPage(), errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);await expect(page.locator('[data-panorama-expand]')).toHaveCount(2);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    // Exercise the real native API when available, including browser Escape exit.
    const firstExpand=page.locator('[data-panorama-expand]').first();await firstExpand.click();
    await expect(page.locator('dialog[open]')).toBeVisible();await page.keyboard.press('Escape');
    await expect(firstExpand).toBeFocused();await expect(page.locator('dialog')).toHaveCount(0);
    // Force the mobile/no-fullscreen path, preserving the native dialog fallback.
    await page.evaluate(()=>{Element.prototype.requestFullscreen=()=>Promise.reject(new Error('TEST unavailable'));});
    for(const kind of ['panorama_180','panorama_360']) {
      const host=page.locator(`[data-panorama="${kind}"]`), expand=host.locator('[data-panorama-expand]');
      await expand.focus();await page.keyboard.press('Enter');
      const dialog=page.locator('dialog[open]'),close=dialog.getByRole('button',{name:messages['room.panorama.close']});
      await expect(dialog).toBeVisible();await expect(close).toBeFocused();
      await page.keyboard.press('Tab');await expect(dialog.locator('canvas')).toBeFocused();
      await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');await expect(close).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(dialog.locator('canvas')).toBeFocused();
      await page.keyboard.press('Escape');await expect(expand).toBeFocused();await expect(page.locator('dialog')).toHaveCount(0);
      await expand.click();await page.getByRole('button',{name:messages['room.panorama.close']}).click();await expect(expand).toBeFocused();
      // Context loss while expanded removes modal/controls and restores original media/link.
      await expand.click();await page.locator('dialog canvas').evaluate(canvas=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
      await expect(host.locator('img')).toBeVisible();await expect(expand).toHaveCount(0);await expect(page.locator('dialog')).toHaveCount(0);
      await expect(host.locator('..').locator('figcaption a')).toBeFocused();
    }
    const launcher=page.locator('[data-ya-open]');await launcher.click();await page.locator('[data-ya-request-type="general_info"]').click();
    const form=page.locator('[data-ya-form]');await form.locator('[name=customer_name]').fill('TEST');await form.locator('[name=customer_phone]').fill('+905550000000');await form.locator('[name=message]').fill('TEST request');
    await form.locator('button[type=submit]').click();
    await form.evaluate(node=>{node.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));node.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
    await expect.poll(()=>submissions).toBe(width===390?1:2);pending();
    await expect(page.locator('[data-ya-request-done]')).toBeFocused();await expect(page.locator('[role=dialog]')).toHaveCount(1);
    await page.keyboard.press('Escape');await expect(page.locator('[data-ya-open]')).toBeFocused();
    assert.deepEqual(errors,[]);
    // WebGL unavailable: static panorama_180/360 and original links remain, no expansion.
    await page.addInitScript(()=>{HTMLCanvasElement.prototype.getContext=()=>null;});await page.reload();
    await expect(page.locator('[data-panorama] img:visible')).toHaveCount(2);await expect(page.locator('[data-panorama-expand],dialog[open]')).toHaveCount(0);
    await expect(page.locator('figcaption a')).toHaveCount(2);
    await context.close();console.log(`PASS panorama 180/360 fallback/open/close/Escape/focus/context loss + widget success/dedup/Escape ${width}px`);
  }
} catch(error) {
  if(error.code==='EPERM' || /Operation not permitted|EPERM/.test(error.message)){console.error('HOST_BROWSER_REQUIRED: sandbox denied browser/HTTP (EPERM); no retry.');process.exitCode=2;}else throw error;
} finally {await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
