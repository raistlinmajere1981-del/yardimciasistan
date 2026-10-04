import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';
import { marketingFixture, imageBytes, editorialInput } from './test-helpers/marketing-fixtures.mjs';
const require=createRequire(import.meta.url), {getBusinessProfiles,BUSINESS_CAPABILITIES:C}=require('../packages/shared/dist');
const f=marketingFixture({ai:true}),db=f.db,raw=new DatabaseSync(db.databasePath),plain=v=>JSON.parse(JSON.stringify(v));
try {
  for(const p of getBusinessProfiles()){assert.ok(p.optionalCapabilities.includes(C.MARKETING_STUDIO));assert.ok(!p.defaultCapabilities.includes(C.MARKETING_STUDIO));}
  const registry=f.service.channels(); const website=registry.find(c=>c.id==='website');
  assert.equal(website.supportsDirectPublish,true);assert.equal(website.supportsEditPublished,true);assert.equal(website.supportsUnpublish,true);assert.equal(website.maxImages,20);
  assert.equal(registry.find(c=>c.id==='whatsapp').configured,true);
  for(const id of ['sms','instagram']){const c=registry.find(c=>c.id===id);assert.equal(c.configured,false);assert.equal(c.supportsDirectPublish,false);assert.equal(c.state,'planned');}
  f.state.selected=[f.uploadPath];const [a]=await f.service.upload(); const b=f.media.importBytes(imageBytes,'upload');
  assert.equal(a.width,1);assert.equal(a.source,'upload');assert.ok(a.previewUrl.startsWith('data:image/png'));assert.equal('storageRef' in a,false);
  assert.throws(()=>f.media.importBytes(Buffer.from('invalid'),'upload'),e=>e.code==='invalid_media');
  let content=f.service.saveContent(editorialInput({mediaAssetIds:[b.id,a.id]}));
  assert.equal(content.media[0].mediaAssetId,b.id);
  const other=f.service.saveContent(editorialInput({title:'İkinci',mediaAssetIds:[a.id]}));assert.equal(db.marketingAssetUsage(a.id).usageCount,2);
  const oldWebsite=content.variants.find(v=>v.channel==='website').text;
  content=f.service.saveContent(editorialInput({id:content.content.id,expectedRevision:content.content.revision,mediaAssetIds:[b.id,a.id],variants:content.variants.map(v=>v.channel==='whatsapp'?{...v,text:'Bağımsız WhatsApp'}:v)}));
  assert.equal(content.variants.find(v=>v.channel==='website').text,oldWebsite);
  assert.throws(()=>f.service.saveContent(editorialInput({id:content.content.id,expectedRevision:1})),e=>e.code==='stale_revision');
  assert.throws(()=>f.service.saveContent(editorialInput({mediaAssetIds:[a.id,a.id]})),e=>e.code==='invalid_media');
  const makePublication=()=>f.service.savePublication({contentId:content.content.id,channel:'website',placement:'homepage_feature',title:'Canlı başlık',text:'Canlı metin',mediaAssetIds:[b.id,a.id]});
  let publication=makePublication();assert.equal(publication.status,'draft');assert.equal(f.schedules,0);
  publication=f.service.publish(publication.id,publication.revision);assert.equal(publication.status,'publishing');assert.equal(publication.publishedRevision,0);
  assert.throws(()=>f.service.manageAsset(a.id,'delete'),e=>e.code==='asset_in_use');
  // First publication in flight: remove its media before ack; files remain protected by durable pending intents.
  const sent=publication;
  publication=f.service.savePublication({...publication,expectedRevision:publication.revision,mediaAssetIds:[b.id],text:'Düzenlenmiş'});
  db.saveMarketingContent(editorialInput({id:content.content.id,expectedRevision:content.content.revision,mediaAssetIds:[]}));
  db.saveMarketingContent(editorialInput({id:other.content.id,expectedRevision:other.content.revision,mediaAssetIds:[]}));
  assert.throws(()=>f.service.manageAsset(a.id,'delete'),e=>e.code==='asset_in_use');
  db.acknowledgeMarketingPublications([sent],new Date().toISOString());assert.equal(db.listMarketingPublications()[0].status,'publishing');
  assert.throws(()=>f.service.manageAsset(a.id,'delete'),e=>e.code==='asset_in_use');
  db.acknowledgeMarketingPublications([publication],new Date().toISOString());assert.equal(db.listMarketingPublications()[0].status,'published');
  const assetFile=f.media.absolutePath(db.getMediaAsset(a.id));f.service.manageAsset(a.id,'delete');assert.equal(existsSync(assetFile),false);
  const c=f.media.importBytes(imageBytes,'upload');publication=db.listMarketingPublications()[0];
  publication=f.service.savePublication({...publication,expectedRevision:publication.revision,mediaAssetIds:[c.id,b.id]});assert.deepEqual(plain(publication.mediaAssetIds),[c.id,b.id]);
  f.publisher.acknowledge([publication],new Date().toISOString());f.service.manageAsset(c.id,'archive');
  assert.throws(()=>f.service.saveContent(editorialInput({mediaAssetIds:[c.id]})),e=>e.code==='archived_asset');
  const before=raw.prepare('SELECT COUNT(*) n FROM marketing_publications').get().n;
  db.saveCustomer({fullName:'PRIVATE CUSTOMER',phone:'05551112233',email:'',notes:'',tags:[]});
  const generated=await f.service.generate({capability:'text_generation',text:'PRIVATE CUSTOMER 05551112233 user@example.test',instructions:'token=PRIVATE_SECRET'});
  assert.equal(generated.text,'AI aday metni');assert.equal(raw.prepare('SELECT COUNT(*) n FROM marketing_publications').get().n,before);
  assert.ok(!JSON.stringify(f.calls).includes('PRIVATE CUSTOMER'));assert.ok(!JSON.stringify(f.calls).includes('05551112233'));assert.ok(!JSON.stringify(f.calls).includes('PRIVATE_SECRET'));
  const adapted=await f.service.generate({capability:'channel_adaptation',channel:'sms',text:'Tanıtım',instructions:''});assert.equal(adapted.text,'AI aday metni');
  await f.service.generate({capability:'rewrite',text:'Tanıtım',instructions:'Kısalt'});
  const image=await f.service.generate({capability:'image_generation',text:'Kampanya görseli',instructions:'',aspect:'landscape'});assert.equal(image.asset.source,'ai');assert.equal(image.asset.aiGenerationMetadata.intent,'marketing_image');
  assert.equal(f.calls.at(-1).body.size,'1536x1024');assert.equal(f.calls.at(-1).body.model,'gpt-image-1');
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM marketing_publications').get().n,before,'AI never publishes');
  assert.ok(!JSON.stringify(f.logs).includes('AI aday metni'));assert.ok(!JSON.stringify(f.logs).includes('PRIVATE'));assert.ok(!JSON.stringify(f.logs).includes(imageBytes.toString('base64')));
  // A selected chat-only profile must not block a different configured image capability.
  const profile=(service,baseUrl,model)=>({service,baseUrl,model,modelOptions:[],timeoutSeconds:30,apiKeyConfigured:true});
  f.state.selectedAiService='groq';
  f.state.aiProfiles=[profile('groq','https://api.groq.com/openai/v1','fixture-chat'),profile('openai','https://api.openai.com/v1','fixture-chat')];
  await f.service.generate({capability:'rewrite',text:'Tanıtım',instructions:''});assert.ok(f.calls.at(-1).url.startsWith('https://api.groq.com'));
  await f.service.generate({capability:'image_generation',text:'Tanıtım',instructions:''});assert.equal(f.calls.at(-1).body.model,'gpt-image-1');
  f.state.aiProfiles=f.state.aiProfiles.slice(0,1);
  assert.equal(f.service.snapshot().aiCapabilities.includes('image_generation'),false);
  await assert.rejects(f.service.generate({capability:'image_generation',text:'Tanıtım',instructions:''}),e=>e.code==='ai_unavailable');
  f.state.selectedAiService='gemini';f.state.aiProfiles=[profile('gemini','https://generativelanguage.googleapis.com/v1beta/openai','gemini-2.5-flash-image')];
  const gemini=await f.service.generate({capability:'image_generation',text:'Tanıtım',instructions:'',aspect:'portrait'});
  assert.equal(gemini.asset.aiGenerationMetadata.providerId,'gemini');assert.equal(f.calls.at(-1).body.generationConfig.imageConfig.aspectRatio,'2:3');
  assert.ok(f.calls.at(-1).url.endsWith('/models/gemini-2.5-flash-image:generateContent'));
  f.state.selectedAiService='openai';f.state.aiProfiles=null;
  f.state.unavailable=true;await assert.rejects(f.service.generate({capability:'rewrite',text:'x',instructions:''}),e=>e.code==='ai_unavailable');f.state.unavailable=false;
  f.state.fail=true;await assert.rejects(f.service.generate({capability:'text_generation',text:'x',instructions:''}),e=>e.code==='ai_failed');f.state.fail=false;
  const current=db.listMarketingPublications()[0];const removed=f.service.unpublish(current.id,current.revision);assert.equal(removed.status,'publishing');
  f.publisher.acknowledge([removed],new Date().toISOString());assert.equal(db.listMarketingPublications()[0].status,'unpublished');
  const latest=db.listMarketingContents().find(c=>c.content.id===content.content.id);
  f.service.saveContent(editorialInput({id:latest.content.id,expectedRevision:latest.content.revision,status:'archived'}));
  assert.throws(()=>makePublication(),e=>e.code==='archived_content');
  const gate=marketingFixture({enabled:false});try{assert.throws(()=>gate.service.snapshot(),e=>e.code==='capability_disabled');}finally{gate.dispose();}
  // Session lock gates before service access and suppresses results from an operation completed after locking.
  const ipcFile=new URL('../apps/desktop-app/dist-electron/ipc/marketing-ipc.js',import.meta.url),ipcRequire=createRequire(ipcFile),handlers=new Map(),exports={};
  runInNewContext(readFileSync(ipcFile,'utf8'),{exports,require:name=>name==='electron'?{ipcMain:{handle:(name,handler)=>handlers.set(name,handler)}}:ipcRequire(name)});
  let locked=true,reads=0,complete;
  exports.registerMarketingIpc({assertUnlocked:()=>{if(locked)throw new Error('fixture_locked');},service:{channels:()=>{reads++;return [];},generate:()=>new Promise(resolve=>{complete=resolve;})}});
  await assert.rejects(handlers.get('marketing:channels')(),/fixture_locked/);assert.equal(reads,0);
  locked=false;assert.equal((await handlers.get('marketing:channels')()).ok,true);
  const late=handlers.get('marketing:generate')(null,{capability:'rewrite'});locked=true;complete({text:'PRIVATE_LATE_RESULT'});
  const blocked=await late;assert.equal(blocked.ok,false);assert.ok(!JSON.stringify(blocked).includes('PRIVATE_LATE_RESULT'));
  console.log('D4 content/variants, uploaded/generated reusable assets, ordering, archive/delete/in-flight guards, resolver/privacy/no-auto-publish and revision lifecycle passed.');
} finally {raw.close();f.dispose();}
