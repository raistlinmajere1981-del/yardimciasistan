import assert from 'node:assert/strict';
import { activateFixtureSource, publicationEnvelope } from './test-helpers/publication-protocol.mjs';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import http from 'node:http';
import { chromium, expect } from '@playwright/test';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { marketingFixture, imageBytes, editorialInput } from './test-helpers/marketing-fixtures.mjs';
const require=createRequire(import.meta.url),{PhpHostingSyncTransport}=require('../packages/sync-core/dist'),{SyncCoordinator}=require('../apps/desktop-app/dist-electron/sync-coordinator.js');
const {setBusinessCapability}=require('../apps/desktop-app/dist-electron/business-capability-store.js');
const root=mkdtempSync(join(tmpdir(),'marketing-host-')),f=marketingFixture(),secret=f.setup.syncSecret;
cpSync('firm-template/web-module',root,{recursive:true});
writeFileSync(join(root,'config/business.json'),JSON.stringify({sync_secret:secret,allowed_origins:[]}));
const port=await new Promise(resolve=>{const server=http.createServer();server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});});
const baseUrl=`http://127.0.0.1:${port}`,php=spawn('php',['-S',`127.0.0.1:${port}`,'-t',root],{stdio:'ignore'});
const config={baseUrl,syncSecret:secret},clientId=f.db.getSyncRuntimeStatus().clientId,transport=new PhpHostingSyncTransport({...config,clientId,sourceEpoch:1});
let browser;
const coordinator=new SyncCoordinator({database:f.db,marketingWebsite:f.publisher,getSyncConfig:()=>config,createAndroidSnapshot:()=>({}),onDashboardChanged:()=>{},onStatusChanged:()=>{}});
const push=async()=>{const result=await coordinator.publishOutbox(transport);assert.equal(result.errors.length,0,JSON.stringify(result.errors));return result;};
const post=payload=>fetch(`${baseUrl}/api/sync.php`,{method:'POST',headers:{'Content-Type':'application/json','X-YA-Sync-Secret':secret},body:JSON.stringify(publicationEnvelope(payload))});
try {
  for(let n=0;n<50;n++){try{if((await fetch(`${baseUrl}/api/marketing.php`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.equal((await transport.getCapabilities()).features.includes('marketing_website_publications'),true);
  await activateFixtureSource(baseUrl,secret,clientId);
  f.db.savePublicationSourceEpoch(baseUrl,1);
  f.db.ensurePublicationTarget(baseUrl);
  assert.deepEqual((await fetch(`${baseUrl}/api/marketing.php`).then(r=>r.json())).publications,[]);
  assert.equal((await fetch(`${baseUrl}/api/sync.php?action=publish_marketing_website`,{headers:{'X-YA-Sync-Secret':secret}})).status,405);
  assert.equal((await fetch(`${baseUrl}/api/marketing-media.php`,{method:'POST'})).status,401);
  const a=f.media.importBytes(imageBytes,'upload'),b=f.media.importBytes(imageBytes,'upload'),c=f.media.importBytes(imageBytes,'upload');
  const content=f.service.saveContent(editorialInput({mediaAssetIds:[b.id,a.id]}));
  let pub=f.service.savePublication({contentId:content.content.id,channel:'website',placement:'homepage_feature',title:'Yaz fırsatı <script>alert(1)</script>',text:'İlk duyuru',mediaAssetIds:[b.id,a.id]});
  pub=f.service.publish(pub.id,pub.revision);
  // Only marketing is under test here; leave unrelated aggregate jobs out of this focused transport fixture.
  for(const job of f.db.getPendingSyncJobs())if(job.jobType!=='marketing_website_publish')f.db.completeSyncJob(job.jobKey,job.sourceRevision);
  const job=f.db.getPendingSyncJobs().find(j=>j.jobType==='marketing_website_publish');
  const prepared=await f.publisher.prepare(config,clientId);assert.equal(prepared.ok,true,prepared.message);
  f.db.prepareSyncPublication('marketing_website_publish',{projection:prepared.projection,sent:prepared.sent});
  const source={sourceRevision:job.sourceRevision,idempotencyKey:`${clientId}:${job.jobKey}:${job.sourceRevision}`,value:prepared.projection};
  const first=await transport.publishMarketingWebsite(source);assert.equal(first.ok,true,first.message);assert.equal(first.source_revision,job.sourceRevision);
  const duplicate=await transport.publishMarketingWebsite(source);assert.equal(duplicate.ok,true);assert.equal(duplicate.deduplicated,true);assert.equal(duplicate.server_revision,first.server_revision);
  assert.equal(f.db.getSyncRuntimeStatus().enabled,false);
  const forced=await coordinator.runNow();assert.equal(forced.ok,true,forced.message);
  assert.equal(f.db.getSyncRuntimeStatus().enabled,false,'explicit publication must not enable passive automatic sync');
  pub=f.db.listMarketingPublications()[0];assert.equal(pub.status,'published');assert.equal(pub.publishedRevision,pub.revision);
  let publicItems=(await fetch(`${baseUrl}/api/marketing.php`).then(r=>r.json())).publications;
  assert.deepEqual(publicItems[0].images.map(i=>i.assetId),[b.id,a.id]);assert.deepEqual(publicItems[0].images.map(i=>i.sortOrder),[0,1]);
  assert.equal(Object.hasOwn(publicItems[0],'businessId'),false);assert.equal(Object.hasOwn(publicItems[0],'contentId'),false);
  f.state.webUrl=baseUrl;assert.equal((await f.service.testWebsite()).connected,true);
  const malicious={...prepared.projection,secret:'PRIVATE',publications:prepared.projection.publications.map(p=>({...p,aiGenerationMetadata:{prompt:'PRIVATE'},images:p.images.map(i=>({...i,storageRef:'/PRIVATE'}))}))};
  f.db.queueSyncJob('marketing_website_publish'); // The sanitizer probe consumes a real source revision.
  const sanitized=await post({action:'publish_marketing_website',client_id:clientId,source_revision:job.sourceRevision+1,idempotency_key:'sanitized',marketing:malicious});
  assert.equal(sanitized.status,200);assert.ok(!JSON.stringify(await fetch(`${baseUrl}/api/marketing.php`).then(r=>r.json())).includes('PRIVATE'));
  const bad={...prepared.projection,publications:prepared.projection.publications.map(p=>({...p,images:[{...p.images[0],url:'https://evil.example/pixel',sortOrder:0}]}))};
  assert.equal((await post({action:'publish_marketing_website',client_id:clientId,source_revision:999,idempotency_key:'unsafe-url',marketing:bad})).status,422);
  const oldRevision=pub.revision;
  pub=f.service.savePublication({...pub,expectedRevision:pub.revision,text:'Yeni canlı metin',mediaAssetIds:[c.id,b.id]});assert.ok(pub.revision>oldRevision);
  await push();pub=f.db.listMarketingPublications()[0];assert.equal(pub.status,'published');
  publicItems=(await fetch(`${baseUrl}/api/marketing.php`).then(r=>r.json())).publications;assert.equal(publicItems[0].text,'Yeni canlı metin');assert.deepEqual(publicItems[0].images.map(i=>i.assetId),[c.id,b.id]);
  browser=await launchChromiumForSmoke(chromium);const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${baseUrl}/duyurular/`);await expect(page.getByRole('heading',{name:'Duyurular / Kampanyalar',exact:true})).toBeVisible();
  await expect(page.locator('.ya-marketing-card')).toHaveCount(1);await expect(page.locator('.ya-marketing-gallery img')).toHaveCount(2);
  assert.equal(await page.locator('article script').count(),0,'text rendered safely');
  for(const width of [375,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  const second=f.service.savePublication({contentId:content.content.id,channel:'website',placement:'homepage_feature',title:'İkinci duyuru',text:'Ayrı yayın',mediaAssetIds:[b.id]});
  f.service.publish(second.id,second.revision);await push();await page.reload();await expect(page.locator('.ya-marketing-card')).toHaveCount(2);
  // Freeze an enabled publication, then lose its response. Capability OFF must
  // invalidate that retry, not resend the old frozen enabled body.
  f.db.queueSyncJob('marketing_website_publish');
  const pending=await f.publisher.prepare(config,clientId);
  const older=f.db.prepareSyncPublication('marketing_website_publish',{projection:pending.projection,sent:pending.sent});
  const oldWire={sourceRevision:older.sourceRevision,idempotencyKey:`${clientId}:1:marketing_website:${older.sourceRevision}`,value:pending.projection};
  assert.equal((await transport.publishMarketingWebsite(oldWire)).ok,true);
  f.db.failSyncJob(older.jobKey,older.sourceRevision,'lost response','9999');
  const editorial=f.db.listMarketingPublications().map(p=>[p.id,p.desiredPublished,p.revision]);
  assert.equal(setBusinessCapability(f.db.databasePath,{capability:'marketing.studio',enabled:false}).enabledCapabilities.includes('marketing.studio'),false);
  const withdrawal=f.db.getPendingSyncJobs().find(j=>j.jobType==='marketing_website_publish');
  assert.ok(withdrawal.sourceRevision>older.sourceRevision);
  const disabled=await f.publisher.prepare(config,clientId);
  assert.equal(disabled.projection.enabled,false);assert.deepEqual(Array.from(disabled.projection.publications),[]);
  assert.equal(f.db.prepareSyncPublication('marketing_website_publish',{projection:pending.projection,sent:pending.sent},false,older.sourceRevision),null);
  const forcedWithdrawal=await coordinator.runNow();assert.equal(forcedWithdrawal.ok,true,forcedWithdrawal.message);
  assert.equal(f.db.getSyncRuntimeStatus().enabled,false,'withdrawal does not enable passive sync');
  assert.deepEqual((await fetch(`${baseUrl}/api/marketing.php`).then(r=>r.json())).publications,[]);
  assert.equal((await transport.publishMarketingWebsite(oldWire)).deduplicated,true,'historic receipt replay is a no-op, not an enabled apply');
  assert.equal((await transport.publishMarketingWebsite({...oldWire,idempotencyKey:'late-enabled-job'})).ok,false);
  assert.deepEqual((await fetch(`${baseUrl}/api/marketing.php`).then(r=>r.json())).publications,[]);
  assert.deepEqual(f.db.listMarketingPublications().map(p=>[p.id,p.desiredPublished,p.revision]),editorial);
  await page.reload();await expect(page.locator('[data-marketing-surface]')).toBeHidden();
  assert.equal(setBusinessCapability(f.db.databasePath,{capability:'marketing.studio',enabled:true}).enabledCapabilities.includes('marketing.studio'),true);
  await push();await page.reload();await expect(page.locator('.ya-marketing-card')).toHaveCount(2);
  // Capability mutation during async preparation cannot attach an old enabled
  // body to the newer withdrawal revision.
  f.db.queueSyncJob('marketing_website_publish');
  const racingPublisher={prepare:async(...args)=>{const p=await f.publisher.prepare(...args);
    setBusinessCapability(f.db.databasePath,{capability:'marketing.studio',enabled:false});return p;},
    acknowledge:(...args)=>f.publisher.acknowledge(...args),fail:(...args)=>f.publisher.fail(...args)};
  const racingCoordinator=new SyncCoordinator({database:f.db,marketingWebsite:racingPublisher,getSyncConfig:()=>config,createAndroidSnapshot:()=>({}),onDashboardChanged:()=>{},onStatusChanged:()=>{}});
  assert.equal((await racingCoordinator.publishOutbox(transport)).published,0);
  await push();assert.deepEqual((await fetch(`${baseUrl}/api/marketing.php`).then(r=>r.json())).publications,[]);
  setBusinessCapability(f.db.databasePath,{capability:'marketing.studio',enabled:true});await push();
  for(const p of f.db.listMarketingPublications())f.service.unpublish(p.id,p.revision);
  await push();assert.deepEqual((await fetch(`${baseUrl}/api/marketing.php`).then(r=>r.json())).publications,[]);
  await page.reload();await expect(page.locator('[data-marketing-surface]')).toBeHidden();assert.deepEqual(errors,[]);
  const lastJob=f.db.getPendingSyncJobs().find(j=>j.jobType==='marketing_website_publish');assert.equal(lastJob,undefined);
  const retired=f.db.listMarketingPublications()[0];f.service.publish(retired.id,retired.revision);
  const retryJob=f.db.getPendingSyncJobs().find(j=>j.jobType==='marketing_website_publish');assert.ok(retryJob.sourceRevision>job.sourceRevision);
  const wrongAck={...transport,publishMarketingWebsite:async()=>({ok:true,source_revision:retryJob.sourceRevision+1,published_at:new Date().toISOString()})};
  const failCoordinator=new SyncCoordinator({database:f.db,marketingWebsite:f.publisher,getSyncConfig:()=>config,createAndroidSnapshot:()=>({}),onDashboardChanged:()=>{},onStatusChanged:()=>{}});
  await failCoordinator.publishOutbox(wrongAck);assert.ok(f.db.getPendingSyncJobs('9999').some(j=>j.jobType==='marketing_website_publish'));
  assert.equal(f.db.listMarketingPublications().find(p=>p.id===retired.id).status,'failed');
  console.log('D4 real PHP upload, exact sync/ack/revision, capability-off withdrawal, stale enabled replay/race, retained editorial intent/reactivation and explicit unpublish passed.');
} finally {await browser?.close();coordinator.stop();php.kill();await new Promise(r=>php.once('exit',r));f.dispose();rmSync(root,{recursive:true,force:true});}
