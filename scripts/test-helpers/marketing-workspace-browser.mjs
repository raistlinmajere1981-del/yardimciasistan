import {resolve} from 'node:path';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {launchChromiumForSmoke} from './playwright-browser.mjs';

/** Real service bridge shared by the functional Marketing browser checks. */
export async function openMarketingWorkspaceBrowser(f) {
  const load=f.loadMarketing??(file=>f.load(`marketing/${file}`));
  const scheduleService=f.scheduleService??new (load('schedule-service').MarketingScheduleService)(()=>f.db);
  const publishing={channels:()=>f.service.channels(),publish:(id,revision)=>f.db.getMarketingPublication(id).channel==='instagram'&&f.instagram?f.instagram.publish(id,revision):f.service.publish(id,revision)};
  const shares=new (load('share-service').MarketingShareService)(()=>f.db,publishing,f.campaigns,scheduleService,()=>f.single.listTemplates());
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
        analytics:()=>f.serviceAnalytics.snapshot(...args),campaignAnalytics:()=>f.serviceAnalytics.campaign(...args),publicationAnalytics:()=>f.serviceAnalytics.publication(...args),refresh:()=>f.serviceAnalytics.refreshPublication(...args)};
        const value=await operations[method]();if(['analytics','campaignAnalytics','publicationAnalytics','refresh'].includes(method))responses.push(value);return {ok:true,value};
      }catch(e){return {ok:false,code:e.code??'failed',message:e.message};}
    });
    await page.goto(`${server.resolvedUrls.local[0]}marketing-fixture`);
    return {page,errors,responses,shares,scheduleService,close:async()=>{await browser.close();await server.close();}};
  } catch(e) {await browser?.close();await server.close();throw e;}
}
