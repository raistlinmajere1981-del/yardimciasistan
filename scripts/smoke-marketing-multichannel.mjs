import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { multichannelFixture } from './test-helpers/marketing-multichannel-fixtures.mjs';
import { preference } from './test-helpers/messaging-campaign-fixtures.mjs';
const f=multichannelFixture(),raw=new DatabaseSync(f.db.databasePath),plain=v=>JSON.parse(JSON.stringify(v));
try {
  const secretService=f.load('marketing/provider-secrets');
  f.state.secureStorage=false;assert.throws(()=>secretService.createMarketingProviderSecretWrites({apiKey:'NEW',apiHash:'HASH'}),e=>e.code==='secure_storage_unavailable');f.state.secureStorage=true;
  f.state.storageBackend='basic_text';assert.throws(()=>secretService.createMarketingProviderSecretWrites({apiKey:'NEW'}),e=>e.code==='secure_storage_unavailable');f.state.storageBackend='gnome_libsecret';
  assert.equal(secretService.createMarketingProviderSecretWrites({clearApiHash:true}).apiHash.mode,'clear');
  const cleanDir=mkdtempSync(join(tmpdir(),'marketing-clean-')),clean=new f.db.constructor({appPath:resolve('apps/desktop-app'),userDataPath:cleanDir});try{clean.initialize();assert.equal(clean.getSetupData().sms.configured,false);assert.equal(clean.getSetupData().instagram.configured,false);}finally{clean.close();rmSync(cleanDir,{recursive:true,force:true});}
raw.prepare("UPDATE marketing_provider_config SET enabled=0 WHERE provider_id='iletimerkezi'").run();assert.equal(f.sms.getConfiguration().configured,false);assert.equal(f.instagram.getConfiguration().configured,true);assert.equal((await f.sms.testConnection()).ok,false);raw.prepare("UPDATE marketing_provider_config SET enabled=1 WHERE provider_id='iletimerkezi'").run();
  const channels=f.service.channels();assert.equal(channels.length,4);
  for(const c of channels){assert.equal(c.family,['sms','whatsapp'].includes(c.id)?'audience_delivery':'public_publishing');assert.equal(c.requiresConsent,c.family==='audience_delivery');assert.equal(c.configured,true);}
  assert.equal(channels.find(c=>c.id==='instagram').maxImages,1);assert.equal(channels.find(c=>c.id==='website').maxImages,20);assert.equal(channels.find(c=>c.id==='sms').supportsImages,false);assert.equal(channels.find(c=>c.id==='instagram').supportsUnpublish,false);
  const priorWebUrl=process.env.YA_WEB_MODULE_URL;try{process.env.YA_WEB_MODULE_URL='invalid';assert.equal(f.service.channels().find(c=>c.id==='instagram').configured,false);}finally{if(priorWebUrl===undefined)delete process.env.YA_WEB_MODULE_URL;else process.env.YA_WEB_MODULE_URL=priorWebUrl;}
  assert.equal((await f.sms.testConnection()).ok,true);assert.deepEqual(plain(await f.sms.listSenderIds()),['FIXTURE']);
  assert.equal(f.calls.some(c=>c.url.includes('send-sms')),false);
  f.state.sms='invalid';assert.equal((await f.sms.testConnection()).ok,false);f.state.sms='success';
  const read=JSON.stringify(f.db.getSetupData());for(const secret of ['PRIVATE_KEY','PRIVATE_HASH','PRIVATE_TOKEN'])assert.equal(read.includes(secret),false);
  assert.equal(f.db.getSmsConfiguration().hasApiHash,true);
  const smsPosts=()=>f.calls.filter(c=>c.url.includes('send-sms'));
  const {campaign,customer}=await f.smsCampaign();assert.equal(f.campaigns.getCampaign(campaign.id).campaign.templateSnapshot,null);
  assert.equal(f.db.getCustomerMessagingPreference(customer,'whatsapp','marketing').status,'unknown');
  await f.campaigns.startCampaign(campaign.id);await f.tick();assert.equal(smsPosts().length,1);
  const first=f.campaigns.getCampaign(campaign.id);assert.equal(first.dispatchedCount,1);assert.equal(first.campaign.status,'completed');
  const message=raw.prepare("SELECT * FROM business_messages WHERE campaign_id=?").get(campaign.id);assert.equal(message.provider_id,'iletimerkezi');assert.equal(message.message_kind,'text');assert.ok(message.provider_message_id);
  assert.equal(smsPosts()[0].body.request.order.iys,'1');assert.equal(smsPosts()[0].body.request.order.iysList,'BIREYSEL');assert.equal(smsPosts()[0].body.request.order.message.text,'SMS_PRIVATE');
  await f.tick();assert.equal(smsPosts().length,1);
  const adapter=new (f.load('business-messaging/iletimerkezi-provider').IletiMerkeziSmsProviderAdapter)({apiKey:'PRIVATE_KEY',apiHash:'PRIVATE_HASH',senderId:'FIXTURE',iysList:'BIREYSEL'},{fetchImpl:async()=>Response.json({response:{status:{code:200},order:{id:'1',status:114,total:1,delivered:1,undelivered:0}}})});assert.equal((await adapter.getDeliveryReport('1')).status,'delivered');
  for(const status of ['unknown','opted_out']){
    const claimedCampaign=await f.smsCampaign();await f.campaigns.startCampaign(claimedCampaign.campaign.id);
    const claims=f.db.claimCampaignDispatchBatch('2090-01-01T00:00:00.000Z',20);const claim=claims.find(c=>c.campaignId===claimedCampaign.campaign.id);
    f.campaigns.savePreference(preference(claimedCampaign.customer,status,'sms'));const postsBefore=smsPosts().length;
    const outcome=await f.sms.dispatchCampaignItem(claim.id,claim.claimToken,1,()=>true,()=>new Date('2090-01-01T00:00:00.000Z'));assert.equal(outcome.kind,'skipped');assert.equal(smsPosts().length,postsBefore);
    f.db.finishCampaignDispatchClaim(claim.id,claim.claimToken,outcome,'2090-01-01T00:00:00.000Z');

    // Final consent gate after preparation, independent of WhatsApp consent.
    const next=await f.smsCampaign();f.campaigns.savePreference(preference(next.customer,status,'sms'));
    for(const row of raw.prepare('SELECT customer_id FROM messaging_campaign_recipients WHERE campaign_id=?').all(next.campaign.id))f.campaigns.savePreference(preference(row.customer_id,status,'sms'));
    const before=smsPosts().length;await f.campaigns.startCampaign(next.campaign.id);f.advance(20000);await f.tick();assert.equal(smsPosts().length,before);assert.ok(f.campaigns.getCampaign(next.campaign.id).skippedCount>0);
  }
  const retry=await f.smsCampaign();await f.campaigns.startCampaign(retry.campaign.id);f.state.sms='transient';f.advance(20000);await f.tick();
  let outbox=raw.prepare('SELECT * FROM messaging_outbox WHERE campaign_id=? AND customer_id=?').get(retry.campaign.id,retry.customer);assert.equal(outbox.status,'pending');const intent=outbox.business_message_id;
  f.state.sms='success';f.advance(20000);await f.tick();outbox=raw.prepare('SELECT * FROM messaging_outbox WHERE id=?').get(outbox.id);assert.equal(outbox.status,'dispatched');assert.equal(outbox.business_message_id,intent);assert.equal(raw.prepare('SELECT COUNT(*) n FROM business_messages WHERE campaign_id=? AND customer_id=?').get(retry.campaign.id,retry.customer).n,1);
  const rateLimited=await f.smsCampaign();await f.campaigns.startCampaign(rateLimited.campaign.id);f.state.sms='rate';f.advance(20000);await f.tick();
  const rateItem=raw.prepare('SELECT * FROM messaging_outbox WHERE campaign_id=? AND customer_id=?').get(rateLimited.campaign.id,rateLimited.customer);assert.equal(rateItem.status,'pending');assert.equal(rateItem.last_error,'rate_limit');
  f.state.sms='success';f.advance(20000);await f.tick();assert.equal(f.campaigns.getCampaign(rateLimited.campaign.id).dispatchedCount,1);assert.equal(raw.prepare('SELECT business_message_id FROM messaging_outbox WHERE id=?').get(rateItem.id).business_message_id,rateItem.business_message_id);
  for(const mode of ['permanent','iys','lost','malformed','duplicate']){
    const next=await f.smsCampaign();await f.campaigns.startCampaign(next.campaign.id);f.state.sms=mode;f.advance(20000);await f.tick();const before=smsPosts().length;
    f.state.sms='success';for(let n=0;n<5;n++){f.advance(1000000);await f.tick();}
    if(['lost','malformed','duplicate'].includes(mode))assert.equal(smsPosts().length,before,'uncertain submission never POSTs again');
    const detail=f.campaigns.getCampaign(next.campaign.id);assert.ok(detail.failedCount>0);if(mode==='iys')assert.ok(detail.errorCounts.some(e=>e.category==='iys_rejected'));
  }
  assert.throws(()=>f.campaigns.createCampaign({name:'Bad',purpose:'marketing',channel:'sms',providerId:'whatsapp_cloud',segmentId:campaign.segmentId,templateName:'',templateLanguage:'',bindings:[],text:'Hello'}));
  assert.equal((await f.instagram.testConnection()).accountType,'BUSINESS');f.state.profileType='MEDIA_CREATOR';assert.equal((await f.instagram.testConnection()).ok,true);f.state.profileType='PERSONAL';assert.equal((await f.instagram.testConnection()).ok,false);f.state.profileType='BUSINESS';f.state.invalidProfile=true;assert.equal((await f.instagram.testConnection()).ok,false);f.state.invalidProfile=false;
  raw.prepare("UPDATE marketing_provider_config SET enabled=0 WHERE provider_id='instagram_api'").run();assert.equal((await f.instagram.testConnection()).ok,false);const unconfigured=f.publication(),unconfiguredCalls=f.calls.length;await assert.rejects(f.instagram.publish(unconfigured.id,unconfigured.revision),e=>e.code==='unconfigured');assert.equal(f.calls.length,unconfiguredCalls);raw.prepare("UPDATE marketing_provider_config SET enabled=1 WHERE provider_id='instagram_api'").run();
  const creates=()=>f.calls.filter(c=>c.url.endsWith('/media')&&c.method==='POST'),publishes=()=>f.calls.filter(c=>c.url.endsWith('/media_publish'));
  const p=f.publication();assert.throws(()=>f.db.saveMarketingPublication({...p,id:undefined,mediaAssetIds:[]}),e=>e.code==='invalid_media');const published=await f.instagram.publish(p.id,p.revision);assert.equal(published.status,'published');assert.ok(published.providerSummary.mediaId);assert.ok(published.providerSummary.permalink);assert.equal(creates().length,1);assert.equal(publishes().length,1);
  const studioWithInstagram=new f.service.constructor(()=>f.db,f.media,()=>{},f.instagram);assert.throws(()=>studioWithInstagram.unpublish(p.id,p.revision),e=>e.code==='channel_unavailable');assert.equal(publishes().length,1);
  assert.equal(f.db.getInstagramPublicationState(p.id).stageToken,'');assert.equal(f.calls.filter(c=>c.body?.operation==='delete').length,1);
  await f.instagram.publish(p.id,p.revision);assert.equal(publishes().length,1);
  assert.throws(()=>f.db.saveMarketingPublication({...p,expectedRevision:p.revision,text:'Edit'}),e=>e.code==='publication_immutable');assert.throws(()=>f.db.requestMarketingPublication(p.id,p.revision,false),e=>e.code==='channel_unavailable');
  f.state.containerStatus='IN_PROGRESS';const pending=f.publication();assert.equal((await f.instagram.publish(pending.id,pending.revision)).status,'publishing');f.state.containerStatus='FINISHED';assert.equal((await f.instagram.publish(pending.id,pending.revision)).status,'published');
  f.state.containerStatus='IN_PROGRESS';const changedStage=f.publication();await f.instagram.publish(changedStage.id,changedStage.revision);f.state.containerStatus='FINISHED';const originalStageUrl=String(raw.prepare("SELECT web_module_url FROM settings WHERE deleted_at='' LIMIT 1").get().web_module_url),beforeChangedStage=publishes().length;
  raw.prepare("UPDATE settings SET web_module_url='https://other.fixture.test' WHERE deleted_at=''").run();try{const stopped=await f.instagram.publish(changedStage.id,changedStage.revision);assert.equal(stopped.providerSummary.failureCode,'staging_changed');assert.equal(publishes().length,beforeChangedStage);assert.equal(f.calls.some(c=>c.url.includes('other.fixture.test')),false);}finally{raw.prepare("UPDATE settings SET web_module_url=? WHERE deleted_at=''").run(originalStageUrl);}
  assert.equal((await f.instagram.publish(changedStage.id,changedStage.revision)).status,'published');
  for(const mode of ['lost-create','lost-publish']){f.state.instagram=mode;const next=f.publication();const failed=await f.instagram.publish(next.id,next.revision);assert.equal(failed.status,'failed');assert.equal(failed.providerSummary.failureCode,'submission_uncertain');const before=[creates().length,publishes().length];f.state.instagram='success';f.reopen();await f.instagram.publish(next.id,next.revision);assert.deepEqual([creates().length,publishes().length],before);if(mode==='lost-publish'){f.state.containerStatus='PUBLISHED';assert.equal((await f.instagram.publish(next.id,next.revision)).status,'published');f.state.containerStatus='FINISHED';}}
  f.state.instagram='transient';const rejected=f.publication();assert.equal((await f.instagram.publish(rejected.id,rejected.revision)).status,'failed');assert.equal(f.db.getInstagramPublicationState(rejected.id).createSubmitted,false);f.state.instagram='success';assert.equal((await f.instagram.publish(rejected.id,rejected.revision)).status,'published');
  f.state.instagram='transient-publish';const rejectedPublish=f.publication();assert.equal((await f.instagram.publish(rejectedPublish.id,rejectedPublish.revision)).status,'failed');const persistedContainer=f.db.getInstagramPublicationState(rejectedPublish.id).containerId;assert.ok(persistedContainer);assert.equal(f.db.getInstagramPublicationState(rejectedPublish.id).publishSubmitted,false);const createCount=creates().length;
  f.state.instagram='success';assert.equal((await f.instagram.publish(rejectedPublish.id,rejectedPublish.revision)).status,'published');assert.equal(creates().length,createCount);assert.equal(f.db.getInstagramPublicationState(rejectedPublish.id).containerId,persistedContainer);
  f.state.cleanupFail=true;const cleanup=f.publication();assert.equal((await f.instagram.publish(cleanup.id,cleanup.revision)).status,'published');assert.ok(f.db.getInstagramPublicationState(cleanup.id).stageToken);f.state.cleanupFail=false;await f.instagram.publish(cleanup.id,cleanup.revision);assert.equal(f.db.getInstagramPublicationState(cleanup.id).stageToken,'');
  const disabled=f.publication();f.state.allowed=false;await assert.rejects(f.instagram.publish(disabled.id,disabled.revision),e=>e.code==='session_locked');f.state.allowed=true;
  const logText=JSON.stringify(f.logs);for(const privateValue of ['PRIVATE_KEY','PRIVATE_HASH','PRIVATE_TOKEN','PHONE_PRIVATE','SMS_PRIVATE','CAPTION_PRIVATE','CUSTOMER_PRIVATE','image_url','stageToken','graph.instagram.com',...f.calls.flatMap(c=>[...(c.body?.request?.order?.message?.receipents?.number??[]),c.body?.token,c.body?.image_url]).filter(Boolean)])assert.equal(logText.includes(privateValue),false,'private provider/staging value must not enter diagnostics');
  assert.ok(f.calls.filter(c=>c.url.includes('graph.instagram.com')).every(c=>!c.url.includes('access_token')&&!c.url.includes('facebook')));
  console.log('D5 registry, independent consent, SMS adapter/outbox/retry/fences and Instagram Login/publication/recovery/cleanup passed.');
} finally {raw.close();await f.dispose();}
