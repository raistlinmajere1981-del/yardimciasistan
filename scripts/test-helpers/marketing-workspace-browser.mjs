import {resolve} from 'node:path';
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {launchChromiumForSmoke} from './playwright-browser.mjs';

/** Real service bridge shared by the functional Marketing browser checks. */
export async function openMarketingWorkspaceBrowser(f) {
  const load=f.loadMarketing??(file=>f.load(`marketing/${file}`));
  const scheduleService=f.scheduleService??new (load('schedule-service').MarketingScheduleService)(()=>f.db);
  const publishing={channels:()=>f.service.channels(),publish:(id,revision)=>f.db.getMarketingPublication(id).channel==='instagram'&&f.instagram?f.instagram.publish(id,revision):f.service.publish(id,revision)};
  const shares=new (load('share-service').MarketingShareService)(()=>f.db,publishing,f.campaigns,scheduleService,()=>f.single.listTemplates());
  const analyticsService=f.serviceAnalytics??new (load('analytics-service').MarketingAnalyticsService)(()=>f.db);
  const server=await createServer({root:resolve('apps/desktop-app'),configFile:resolve('apps/desktop-app/vite.renderer.config.ts'),logLevel:'error',server:{port:0,strictPort:false,host:'127.0.0.1'}});
  await server.listen();let browser;
  try {
    browser=await launchChromiumForSmoke(chromium);
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],responses=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/marketing-fixture',async route=>route.fulfill({contentType:'text/html',body:await server.transformIndexHtml('/marketing-fixture',`<html><body><div id="root"></div><script type="module" src="/@fs/${resolve('scripts/fixtures/marketing.tsx')}"></script></body></html>`)}));
    await page.exposeFunction('__marketingCall',async(method,args)=>{
      try {const operations={snapshot:()=>f.service.snapshot(),channels:()=>f.service.channels(),content:()=>f.service.saveContent(args[0]),upload:()=>f.service.upload(),asset:()=>f.service.manageAsset(...args),ai:()=>f.service.generate(args[0]),publication:()=>f.service.savePublication(args[0]),publish:()=>publishing.publish(...args),unpublish:()=>f.service.unpublish(...args),
        share:()=>shares.get(args[0]),saveShare:()=>shares.save(args[0]),submitShare:()=>shares.submit(...args),schedules:()=>scheduleService.snapshot(...args),saveSchedule:()=>scheduleService.save(args[0]),transitionSchedule:()=>scheduleService.transition(...args),
        segments:()=>f.campaigns.listSegments(),saveSegment:()=>f.campaigns.saveSegment(args[0]),previewSegment:()=>f.campaigns.previewSegment(...args),templates:()=>f.single.listTemplates(),campaign:()=>f.campaigns.getCampaign(args[0]),prepareCampaign:()=>f.campaigns.prepareCampaign(args[0]),startCampaign:()=>f.campaigns.startCampaign(args[0]),pauseCampaign:()=>f.campaigns.pauseCampaign(args[0]),resumeCampaign:()=>f.campaigns.startCampaign(args[0],true),cancelCampaign:()=>f.campaigns.cancelCampaign(args[0]),
        analytics:()=>analyticsService.snapshot(...args),campaignAnalytics:()=>analyticsService.campaign(...args),publicationAnalytics:()=>analyticsService.publication(...args),refresh:()=>analyticsService.refreshPublication(...args)};
        const value=await operations[method]();if(['analytics','campaignAnalytics','publicationAnalytics','refresh'].includes(method))responses.push(value);return {ok:true,value};
      }catch(e){return {ok:false,code:e.code??'failed',message:e.message};}
    });
    await page.goto(`${server.resolvedUrls.local[0]}marketing-fixture`);
    return {page,errors,responses,shares,scheduleService,close:async()=>{await browser.close();await server.close();}};
  } catch(e) {await browser?.close();await server.close();throw e;}
}

/** Check the shared modal boundary and chrome while the interior owns scrolling. */
export async function assertMarketingDialog(page, dialog) {
  await expect(dialog).toHaveClass(/workspace-frame--centered/);
  await expect(dialog.locator(':scope > .workspace-frame__header')).toBeInViewport({ratio:1});
  await expect(dialog.locator(':scope > .workspace-frame__footer')).toBeInViewport({ratio:1});
  await expect.poll(() => dialog.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.left > 0 && r.right < innerWidth && r.top > 0 && r.bottom < innerHeight;
  })).toBe(true);
  const geometry = await dialog.evaluate(el => {
    const rect = element => {const r = element.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
    const chrome = () => [...el.querySelectorAll(':scope > header, :scope > footer')].map(rect);
    const before = chrome(), outer = {x:scrollX,y:scrollY};
    const owners = [...el.querySelectorAll('.workspace-frame__body, .detail-workspace-layout, .detail-workspace-layout__rail, .detail-workspace-layout__content')];
    const positions = owners.map(owner => owner.scrollTop);
    owners.forEach(owner => {owner.scrollTop = owner.scrollHeight;});
    const after = chrome();
    owners.forEach((owner,i) => {owner.scrollTop = positions[i];});
    const bounds = el.getBoundingClientRect();
    const clipped = [...el.querySelectorAll('button,input,select,textarea')].filter(control => {
      const r = control.getBoundingClientRect();
      return r.width && r.height && (r.left < bounds.left - 1 || r.right > bounds.right + 1);
    }).map(control => control.getAttribute('aria-label') || control.textContent);
    return {frame:rect(el),before,after,outer,outerAfter:{x:scrollX,y:scrollY},clipped,
      overflow:owners.some(owner => owner.scrollWidth > owner.clientWidth + 1),
      rounded:parseFloat(getComputedStyle(el).borderTopLeftRadius) > 0};
  });
  for (const chrome of geometry.after) assert(chrome.top >= geometry.frame.top && chrome.bottom <= geometry.frame.bottom, 'chrome stays entirely inside the dialog');
  assert.deepEqual(geometry.before, geometry.after, 'header/footer stay fixed during interior scrolling');
  assert.deepEqual(geometry.outer, geometry.outerAfter, 'interior scrolling preserves the page position');
  assert.deepEqual(geometry.clipped, [], 'controls fit horizontally inside the dialog');
  assert.equal(geometry.overflow, false, 'interior has no horizontal overflow');
  assert.equal(geometry.rounded, true);
}

export async function assertMarketingTool(page, title) {
  const host = page.locator('dialog[open]'), tool = page.locator('[data-workspace-subflow]');
  await expect(host).toHaveCount(1);
  await expect(tool).toHaveCount(1);
  await expect(tool.getByRole('heading', {name:title, exact:true})).toBeVisible();
  await expect(tool.locator('.workspace-frame__header')).toBeInViewport({ratio:1});
  await expect(tool.locator('.workspace-frame__footer')).toBeInViewport({ratio:1});
  assert(await tool.evaluate(el => el.scrollWidth <= el.clientWidth));
  await page.keyboard.press('Tab');assert(await tool.evaluate(el => el.contains(document.activeElement)), 'tool owns keyboard focus');
}
