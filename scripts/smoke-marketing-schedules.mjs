import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { scheduleFixture } from './test-helpers/marketing-schedule-fixtures.mjs';
import { campaignInput, createCustomer, preference } from './test-helpers/messaging-campaign-fixtures.mjs';
const require=createRequire(import.meta.url),recurrence=require('../apps/desktop-app/dist-electron/marketing/schedule-recurrence.js');
const {resolveScheduleLocal:local,nextScheduleOccurrence:next,validateScheduleTiming:validate}=recurrence;
assert.equal(local('2030-01-01T09:00','Europe/Istanbul'),'2030-01-01T06:00:00.000Z');
assert.equal(local('2026-03-08T02:30','America/New_York'),'2026-03-08T07:30:00.000Z');
assert.equal(local('2026-11-01T01:30','America/New_York'),'2026-11-01T05:30:00.000Z');
assert.equal(local('2026-10-04T02:15','Australia/Lord_Howe'),'2026-10-03T15:45:00.000Z');
const daily={frequency:'daily',interval:1,localTime:'02:30'},weekly={frequency:'weekly',interval:2,weekdays:[1,3],localTime:'09:00'},monthly={frequency:'monthly',interval:1,dayOfMonth:31,localTime:'09:00'};
assert.equal(next('2026-03-07T07:30:00.000Z','America/New_York',daily,'2026-03-07T07:30:00.000Z'),'2026-03-08T07:30:00.000Z');
assert.equal(next('2026-03-07T07:30:00.000Z','America/New_York',daily,'2026-03-08T07:30:00.000Z'),'2026-03-09T06:30:00.000Z');
assert.equal(next('2030-01-07T09:00:00.000Z','UTC',weekly,'2030-01-09T09:00:00.000Z'),'2030-01-21T09:00:00.000Z');
assert.equal(next('2030-01-31T09:00:00.000Z','UTC',monthly,'2030-01-31T09:00:00.000Z'),'2030-02-28T09:00:00.000Z');
assert.equal(next('2030-01-31T09:00:00.000Z','UTC',monthly,'2030-02-28T09:00:00.000Z'),'2030-03-31T09:00:00.000Z');
assert.equal(next('2030-01-01T09:00:00.000Z','UTC',undefined,'2030-01-01T09:00:00.000Z'),'');
assert.throws(()=>local('2030-02-30T09:00','UTC'));
assert.throws(()=>validate({timezone:'UTC',startsLocal:'2030-01-01T09:00',scheduleType:'recurring',missedRunPolicy:'skip',recurrenceRule:{frequency:'cron',cron:'* * * * *'}}));
assert.throws(()=>validate({timezone:'bad/timezone',startsLocal:'2030-01-01T09:00',scheduleType:'once',missedRunPolicy:'skip'}));
const f=scheduleFixture();
try {
  const p=f.publication(),s=f.scheduleService.save(f.input(p)).schedule;
  assert.equal(s.nextRunAt,'2030-01-01T01:00:00.000Z');assert.equal(s.timezone,'Europe/Istanbul');
  assert.equal(f.calls.length,0,'creation makes no provider call');
  const modified=f.db.saveMarketingPublication({id:p.id,expectedRevision:p.revision,contentId:p.contentId,channel:p.channel,placement:p.placement,title:'Changed',text:'NEW BODY PRIVATE',mediaAssetIds:[]});
  assert.equal(f.db.getMarketingSchedule(s.id).targetRevision,p.revision,'editing target does not mutate schedule');
  await f.tick();assert.equal(f.db.listMarketingSchedules()[0].executions.length,0);
  f.advance(3600000);await f.tick();
  let d=f.db.listMarketingSchedules()[0];assert.equal(d.schedule.status,'completed');assert.equal(d.executions[0].status,'succeeded');
  assert.equal(f.db.getMarketingPublication(p.id).text,'BODY_PRIVATE','frozen revision wins');
  assert(f.db.getPendingSyncJobs().some(j=>j.jobType==='marketing_website_publish'));
  assert.equal(f.calls.length,0,'Website durable sync owns remote transport');
  await f.tick();await f.restart();await f.tick();assert.equal(f.db.listMarketingSchedules()[0].executions.length,1);
  assert.throws(()=>f.scheduleService.transition(s.id,d.schedule.revision,'resume'));
  assert.throws(()=>f.db.saveMarketingSchedule({...f.input(modified),scheduleType:'recurring',recurrenceRule:{frequency:'daily',interval:0,localTime:'09:00'}},f.now().toISOString()));

  // Recurring catch-up collapses 12+ missed occurrences. Explicit pause/resume and cancel.
  const r=f.scheduleService.save(f.input(f.publication(),{startsLocal:'2030-01-02T09:00',scheduleType:'recurring',recurrenceRule:{frequency:'daily',interval:1,localTime:'09:00'}})).schedule;
  let paused=f.scheduleService.transition(r.id,r.revision,'pause');f.advance(14*86400000);await f.tick();
  assert.equal(f.db.listMarketingSchedules().find(d=>d.schedule.id===r.id).executions.length,0);
  f.scheduleService.transition(r.id,paused.schedule.revision,'resume');await f.tick();d=f.db.listMarketingSchedules().find(d=>d.schedule.id===r.id);
  assert.equal(d.executions.length,1);assert.equal(d.executions[0].status,'succeeded');assert(Date.parse(d.schedule.nextRunAt)>f.now().getTime());
  await f.tick();assert.equal(f.db.listMarketingSchedules().find(d=>d.schedule.id===r.id).executions.length,1);
  const nextInstant=d.schedule.nextRunAt;f.setTime('2029-01-01T00:00:00Z');await f.tick();assert.equal(f.db.getMarketingSchedule(r.id).nextRunAt,nextInstant,'backwards clock cannot repeat');
  f.setTime('2030-01-20T00:00:00Z');d=f.scheduleService.transition(r.id,d.schedule.revision,'cancel');await f.tick();assert.equal(f.db.getMarketingSchedule(r.id).status,'cancelled');
  assert.equal(f.db.getMarketingPublication(r.targetId).desiredPublished,true,'schedule cancel does not unpublish');

  const skip=f.scheduleService.save(f.input(f.publication(),{startsLocal:'2030-01-21T09:00',missedRunPolicy:'skip',scheduleType:'recurring',recurrenceRule:{frequency:'weekly',interval:1,weekdays:[1,3],localTime:'09:00'}})).schedule;
  f.advance(30*86400000);await f.tick();d=f.db.listMarketingSchedules().find(d=>d.schedule.id===skip.id);assert.equal(d.executions.length,1);assert.equal(d.executions[0].status,'skipped');assert(Date.parse(d.schedule.nextRunAt)>f.now().getTime());
  f.scheduleService.transition(skip.id,d.schedule.revision,'cancel');
  const skippedOnce=f.scheduleService.save(f.input(f.publication(),{startsLocal:'2030-02-21T09:00',missedRunPolicy:'skip'})).schedule;
  f.advance(3*86400000);await f.tick();d=f.db.listMarketingSchedules().find(d=>d.schedule.id===skippedOnce.id);assert.equal(d.schedule.status,'completed');assert.equal(d.executions[0].status,'skipped');

  // Durable claim uniqueness, crash before action and after accepted target transaction.
  const recovery=f.scheduleService.save(f.input(f.publication(),{startsLocal:'2030-02-24T09:00'})).schedule;
  f.setTime('2030-02-24T06:00:00Z');let claim=f.db.claimMarketingScheduleExecution(f.now().toISOString(),60000);assert.equal(claim.schedule.id,recovery.id);
  assert.equal(f.db.claimMarketingScheduleExecution(f.now().toISOString(),60000),null);
  assert.throws(()=>f.db.saveMarketingSchedule({...f.input(p),id:recovery.id,expectedRevision:recovery.revision},f.now().toISOString()));
  await f.restart();await f.tick();d=f.db.listMarketingSchedules().find(d=>d.schedule.id===recovery.id);assert.equal(d.executions.length,1);assert.equal(d.executions[0].status,'succeeded');
  const accepted=f.scheduleService.save(f.input(f.publication(),{startsLocal:'2030-02-25T09:00'})).schedule;
  f.advance(86400000);claim=f.db.claimMarketingScheduleExecution(f.now().toISOString(),60000);const intended=f.db.prepareScheduledPublication(claim.execution.id);
  const version=intended.revision;
  const originalSetup=f.db.getSetupData.bind(f.db);f.db.getSetupData=()=>({...originalSetup(),webModuleUrl:'',syncSecret:''});
  assert.equal((await f.targets.execute(claim.schedule,f.db.getMarketingScheduleExecution(claim.execution.id))).status,'succeeded','accepted Website intent remains accepted when config changes');
  f.db.getSetupData=originalSetup;
  await f.restart();await f.tick();assert.equal(f.db.getMarketingPublication(intended.id).revision,version,'accepted Website intent not re-mutated');
  assert.equal(f.db.listMarketingSchedules().find(d=>d.schedule.id===accepted.id).executions[0].status,'succeeded');

  // Audience prepared-only, both channels, and D3 alone sends.
  const sms=await f.smsCampaign(),customer=createCustomer(f.db,'CUSTOMER_PRIVATE');f.campaigns.savePreference(preference(customer,'opted_in'));
  const segment=f.campaigns.saveSegment({name:'WA',filterDefinition:{version:1,rules:[]}}),wa=f.campaigns.createCampaign(campaignInput(segment.id));
  const ci=c=>({name:'Audience',targetType:'audience_campaign',targetId:c.id,channel:c.channel,scheduleType:'once',timezone:'UTC',startsLocal:'2030-02-26T09:00',missedRunPolicy:'run_once_when_resumed'});
  assert.throws(()=>f.scheduleService.save(ci(wa)),/hazırlayın/);await f.campaigns.prepareCampaign(wa.id);
  const ws=f.scheduleService.save(ci(wa)).schedule,ss=f.scheduleService.save(ci(sms.campaign)).schedule;
  assert.throws(()=>f.scheduleService.save({...ci(wa),scheduleType:'recurring',recurrenceRule:{frequency:'daily',interval:1,localTime:'09:00'}}));
  f.setTime('2030-02-26T09:00:00Z');await f.tick();assert.equal(f.campaigns.getCampaign(wa.id).campaign.status,'running');assert.equal(f.campaigns.getCampaign(sms.campaign.id).campaign.status,'running');
  assert.equal(f.calls.some(c=>c.url.includes('send-sms')),false);assert.equal(f.http.calls.some(c=>String(c.url).includes('/messages')),false);
  assert.equal(f.db.listMarketingSchedules().find(d=>d.schedule.id===ws.id).executions[0].status,'succeeded');assert.equal(f.db.listMarketingSchedules().find(d=>d.schedule.id===ss.id).executions[0].status,'succeeded');
  const Worker=f.load('messaging-campaigns/dispatch-service').CampaignDispatchService;
  const worker=new Worker(()=>f.db,{dispatchCampaignItem:(id,token,interval,allowed,now)=>{
    const claim=f.db.getCampaignDispatchClaim(id,token);return (claim?.item.channel==='sms'?f.sms:f.single).dispatchCampaignItem(id,token,interval,allowed,now);
  }},{allowed:()=>true,now:f.now,policy:{minimumIntervalMs:1,batchSize:20}});
  worker.start();await worker.runOnce();await worker.suspendAndDrain();f.advance(1);worker.start();await worker.runOnce();await worker.suspendAndDrain();
  assert(f.calls.some(c=>c.url.includes('send-sms')),'D3 dispatch owns SMS POST');
  assert(f.http.calls.some(c=>String(c.url).includes('/messages')),'D3 dispatch owns WhatsApp POST');
  await f.tick();await f.restart();await f.tick();await f.tick();await f.tick();
  const cancelled=await f.smsCampaign(),cancelPlan=f.scheduleService.save({...ci(cancelled.campaign),startsLocal:'2030-02-27T09:00'}).schedule;f.campaigns.cancelCampaign(cancelled.campaign.id);
  f.advance(86400000);await f.tick();d=f.db.listMarketingSchedules().find(d=>d.schedule.id===cancelPlan.id);assert.equal(d.executions[0].status,'skipped');assert.equal(d.executions[0].lastError,'target_cancelled');

  const acceptedCampaign=await f.smsCampaign(),acceptedCampaignPlan=f.scheduleService.save({...ci(acceptedCampaign.campaign),startsLocal:'2030-02-28T01:00'}).schedule;
  f.setTime('2030-02-28T01:00:00Z');claim=f.db.claimMarketingScheduleExecution(f.now().toISOString(),60000);
  assert.equal(claim.schedule.id,acceptedCampaignPlan.id);await f.targets.execute(claim.schedule,claim.execution);
  assert.equal(f.db.getMarketingScheduleExecution(claim.execution.id).status,'claimed');assert.equal(f.db.getMarketingScheduleExecution(claim.execution.id).resultReference,acceptedCampaign.campaign.id);
  const beforeCampaignRecovery=f.calls.length;await f.restart();await f.tick();assert.equal(f.calls.length,beforeCampaignRecovery);
  assert.equal(f.db.listMarketingSchedules().find(d=>d.schedule.id===acceptedCampaignPlan.id).executions[0].status,'succeeded');

  // Instagram one intent per occurrence; crash recovery uses existing fences.
  const ig=f.publication('instagram'),igs=f.scheduleService.save(f.input(ig,{startsLocal:'2030-02-28T09:00',scheduleType:'recurring',recurrenceRule:{frequency:'monthly',interval:1,dayOfMonth:28,localTime:'09:00'}})).schedule;
  f.setTime('2030-02-28T06:00:00Z');claim=f.db.claimMarketingScheduleExecution(f.now().toISOString(),60000);const intent=f.db.prepareScheduledPublication(claim.execution.id);assert.notEqual(intent.id,ig.id);
  await f.restart();await f.tick();d=f.db.listMarketingSchedules().find(d=>d.schedule.id===igs.id);assert.equal(d.executions[0].resultReference,intent.id);assert.equal(d.executions[0].status,'succeeded');
  const posts=()=>f.calls.filter(c=>c.method==='POST'&&c.url.endsWith('/media_publish')).length;
  assert.equal(posts(),1);await f.restart();await f.tick();assert.equal(posts(),1);
  f.setTime('2030-03-28T06:00:00Z');await f.tick();assert.equal(posts(),2);d=f.db.listMarketingSchedules().find(d=>d.schedule.id===igs.id);assert.equal(d.executions.length,2);assert.notEqual(d.executions[0].resultReference,d.executions[1].resultReference);
  f.scheduleService.transition(igs.id,d.schedule.revision,'cancel');
  const uncertain=f.scheduleService.save(f.input(f.publication('instagram'),{startsLocal:'2030-03-29T09:00'})).schedule;f.state.instagram='lost-create';f.advance(86400000);await f.tick();
  d=f.db.listMarketingSchedules().find(d=>d.schedule.id===uncertain.id);assert.equal(d.executions[0].status,'failed');assert.equal(d.executions[0].lastError,'submission_uncertain');const calls=f.calls.length;
  await f.restart();await f.tick();assert.equal(f.calls.length,calls,'provider uncertainty never retried by scheduler');

  // Explicit revision update preserves/refreshes references; frozen media survives archive/removal.
  f.setTime('2030-03-29T07:00:00Z');const frozenSource=f.publication('instagram'),assetId=frozenSource.mediaAssetIds[0];
  const mediaPlan=f.scheduleService.save(f.input(frozenSource,{startsLocal:'2030-03-30T08:00'})).schedule;
  const replacement=f.publication('instagram').mediaAssetIds[0];
  f.db.saveMarketingPublication({id:frozenSource.id,expectedRevision:frozenSource.revision,contentId:frozenSource.contentId,channel:'instagram',placement:frozenSource.placement,title:'Changed image',text:'Changed caption',mediaAssetIds:[replacement]});
  assert(f.db.marketingAssetUsage(assetId).usageCount>0);assert.throws(()=>f.db.manageMediaAsset(assetId,'delete'));
  f.db.manageMediaAsset(assetId,'archive');f.state.instagram='success';f.setTime('2030-03-30T05:00:00Z');await f.tick();
  const mediaExecution=f.db.listMarketingSchedules().find(d=>d.schedule.id===mediaPlan.id).executions[0];assert.equal(mediaExecution.status,'succeeded');assert.deepEqual(f.db.getMarketingPublication(mediaExecution.resultReference).mediaAssetIds,[assetId]);

  // Session gating, bounded single-flight and stop/drain.
  const gated=f.scheduleService.save(f.input(f.publication(),{startsLocal:'2030-03-30T09:00'})).schedule;f.advance(86400000);f.setAllowed(false);await f.tick();assert.equal(f.db.listMarketingSchedules().find(d=>d.schedule.id===gated.id).executions.length,0);
  f.setAllowed(true);await f.tick();assert.equal(f.db.listMarketingSchedules().find(d=>d.schedule.id===gated.id).executions[0].status,'succeeded');
  const events=JSON.stringify(f.logs);for(const secret of ['BODY_PRIVATE','CAPTION_PRIVATE','SMS_PRIVATE','CUSTOMER_PRIVATE','PRIVATE_TOKEN','PRIVATE_KEY','SCHEDULE_PRIVATE'])assert(!events.includes(secret));
  for(const event of ['created','paused','resumed','cancelled','execution.claimed','execution.succeeded','execution.skipped','execution.failed'])assert(events.includes(`marketing.schedule.${event}`));
  console.log('D6: typed recurrence/DST, one-shot and recurring channels, frozen revisions, pause/resume/cancel, collapsed recovery, durable intent deduplication and provider ownership passed.');
} finally {await f.dispose();}

// Execute real maintenance handlers with a real scheduler flight, rather than inspect menu/source wiring.
for(const kind of ['reset','restore']) {
  const g=scheduleFixture(),handlers=new Map(),maintenanceRequire=createRequire(new URL('../apps/desktop-app/dist-electron/data-maintenance.js',import.meta.url));
  const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
  let release,enter,relaunch=false,finishedDrain=false;
  const gate=new Promise(done=>{release=done;}),entered=new Promise(done=>{enter=done;});
  const Scheduler=g.load('marketing/scheduler-service').MarketingSchedulerService;
  let invocations=0;
  const runtime=new Scheduler(()=>g.db,{execute:async()=>{invocations++;enter();await gate;return {status:'succeeded'};}},{allowed:()=>true,now:g.now});
  const exports={};
  try {
    const p=g.publication();const first=g.scheduleService.save(g.input(p)).schedule;g.scheduleService.save(g.input(g.publication()));g.advance(3600000);
    runtime.start();const flight=runtime.runOnce();assert.equal(runtime.runOnce(),flight,'single-flight promise');await entered;
    const paused=g.scheduleService.transition(first.id,first.revision,'pause');assert.equal(paused.schedule.status,'paused');
    runInNewContext(readFileSync(new URL('../apps/desktop-app/dist-electron/data-maintenance.js',import.meta.url),'utf8'),{exports,Buffer,Error,process,setTimeout:()=>{relaunch=true;return {unref(){}};},clearTimeout,
      require:name=>name==='electron'?{app:{isPackaged:true,getAppPath:()=>process.cwd()+'/apps/desktop-app',getVersion:()=> 'fixture',relaunch(){},quit(){}},ipcMain:{removeHandler(){},handle:(name,action)=>handlers.set(name,action)},session:{defaultSession:{clearStorageData:async()=>{}}},shell:{}}
      :name==='./desktop-logger'?{desktopLog:{info(){},warn(){},error(){}}}:name==='./data-maintenance-confirmation'?{requestDataMaintenanceConfirmation:async()=>true}:maintenanceRequire(name)});
    exports.registerDataMaintenanceIpcHandlers(()=>g.db.userDataPath,{assertUnlocked:()=>{},beforeMaintenance:async()=>{await runtime.suspendAndDrain();finishedDrain=true;},resetConnectedWebRuntime:async()=>({ok:true,skipped:true,message:'fixture'})});
    let backup;if(kind==='restore')backup=handlers.get('dataMaintenance:createBackup')().backup;
    const work=kind==='restore'?handlers.get('dataMaintenance:restoreBackup')({sender:{}},backup.id):handlers.get('dataMaintenance:resetLocalData')({sender:{}});
    await new Promise(done=>setTimeout(done,10));assert.equal(relaunch,false);assert.equal(finishedDrain,false);assert.equal(invocations,1,'maintenance stops further claims');
    release();await flight;const result=await work;assert.equal(result.ok,true,result.message);assert.equal(finishedDrain,true);assert.equal(relaunch,true);
    assert.equal(g.db.getMarketingSchedule(first.id).status,'completed','paused in-flight one-shot still finishes');
    const remaining=g.db.listMarketingSchedules().find(d=>d.schedule.id!==first.id);assert.equal(remaining.executions.length,0);
    await runtime.runOnce();assert.equal(invocations,1,'shutdown/suspension cannot claim');
    console.log(`D6 ${kind}: maintenance waits for schedule flight, does not abort it, and stops further claims before relaunch.`);
  }finally{release?.();await runtime.suspendAndDrain();await g.dispose();}
}
