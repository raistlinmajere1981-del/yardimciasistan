import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
const require = createRequire(import.meta.url);
const { PublicTranslationStore } = require("../apps/desktop-app/dist-electron/database/public-translation-store.js");
const db = new DatabaseSync(":memory:");
db.exec(readFileSync("apps/desktop-app/db/schema.sql", "utf8"));
db.exec(`INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES ('b','Test','Test','market','t','t');
  INSERT INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at) VALUES ('b','channel.online_sales',1,'t','t');
  INSERT INTO business_public_profile(business_id,description,languages_json,created_at,updated_at) VALUES ('b','Türkçe açıklama','["de"]','t','t');`);
db.exec("INSERT INTO customers(id,full_name,phone,notes,created_at,updated_at) VALUES ('private-customer','PRIVATE_CUSTOMER','PRIVATE_PHONE','PRIVATE_NOTE','t','t'); UPDATE business SET phone='PRIVATE_CONTACT'");
const store = new PublicTranslationStore(db, () => [{id: "g", title: "Bahçe"}]);
assert.equal(store.settings().enabled, false);
store.saveSettings({enabled: true, automatic: false, sourceLanguage: "tr", targetLanguages: ["en"]});
const product = db.prepare("INSERT INTO catalog_products(id,business_id,name,description,created_at,updated_at) VALUES (?,'b',?,'Taze ürün','t','t')");
const publication = db.prepare("INSERT INTO commerce_product_publications(product_id,business_id,channel,is_published,created_at,updated_at) VALUES (?,'b','online_sales',1,'t','t')");
db.exec("BEGIN");
for (let n = 0; n < 10000; n++) { product.run(`p${n}`, `Ürün ${String(n).padStart(5, "0")}`); publication.run(`p${n}`); }
db.exec("COMMIT");
db.exec("UPDATE catalog_products SET sku='PRIVATE_SKU', purchase_price=987654 WHERE id='p9999'");
for(const value of ['PRIVATE_CUSTOMER','PRIVATE_PHONE','PRIVATE_NOTE','PRIVATE_CONTACT','PRIVATE_SKU','987654'])assert.equal(store.list({language:'en',query:value}).total,0,'private data never enters translation sources');
const began = performance.now();
const page = store.list({language: "en", category: "products", state: "missing", limit: 50, offset: 9950});
assert.equal(page.total, 10000); assert.equal(page.records.length, 50);
const found = store.list({language: "en", query: "ürün 09999"});
assert.equal(found.total, 1); assert.equal(found.records[0].id, "p9999");
const elapsed = performance.now() - began;
assert.ok(elapsed < 2500, `10000 record filtering: ${elapsed} ms`);
const identity = {kind: "catalog_product", id: "p0"};
let record = store.get(identity, "en");
store.saveManual({...identity, language: "en", fields: record.fields.map(f => ({field:f.field, sourceHash:f.sourceHash, text:f.field === "name" ? "Product 00000" : "Fresh product"}))});
assert.equal(store.acceptAi(identity, "en", record.fields[0], "Overwrite"), false, "manual wins after AI started");
record = store.get(identity, "en"); assert.equal(record.ready, 2); assert.equal(record.manual, 2);
const source = { ...identity, fields: {name:"Ürün 00000", description:"Taze ürün"} };
assert.equal(store.localization([source]).translations.catalog_product.p0.en.description, "Fresh product");
db.prepare("UPDATE catalog_products SET description='Yeni açıklama' WHERE id='p0'").run();
record = store.get(identity, "en"); assert.equal(record.stale, 1); assert.equal(record.fields[1].text, "Fresh product");
assert.equal(store.acceptAi(identity, "en", record.fields[1], "New description"), false, "stale manual remains protected");
assert.equal(store.localization([{...source,fields:{...source.fields,description:"Yeni açıklama"}}]).translations.catalog_product.p0.en.description, undefined);
assert.throws(() => store.saveManual({...identity, language:"en", fields:[{field:"description",sourceHash:"old",text:"old"}]}), /değişti/);
const aiIdentity = {kind:"catalog_product", id:"p1"}, aiField = store.get(aiIdentity,"en").fields[1];
db.prepare("UPDATE catalog_products SET description='Değişti' WHERE id='p1'").run();
assert.equal(store.acceptAi(aiIdentity,"en",aiField,"Late answer"),false);
const fresh = store.get(aiIdentity,"en").fields[1];
store.acceptAi(aiIdentity,"en",fresh,"","ai_failed");
assert.equal(store.get(aiIdentity,"en").failed,1);
assert.equal(store.localization([{...aiIdentity,fields:{description:"Değişti"}}]).translations.catalog_product,undefined);
assert.equal(store.acceptAi(aiIdentity,"en",fresh,"Changed"),true,"failed field is retryable");
assert.equal(store.acceptAi(aiIdentity,"en",fresh,"Redundant"),false,"current text is not translated again");
db.prepare("UPDATE commerce_product_publications SET is_published=0 WHERE product_id='p1'").run();
assert.throws(() => store.get(aiIdentity,"en"), /public/);
assert.throws(() => store.get({kind:"customer",id:"p0"},"en"), /geçersiz/);
assert.throws(() => store.saveManual({...identity, language:"en", fields:[{field:"purchase_price",sourceHash:"x",text:"secret"}]}), /değişti/);
assert.equal(db.prepare("SELECT languages_json FROM business_public_profile").get().languages_json,'["de"]');
assert.ok(db.prepare("SELECT source_revision FROM sync_outbox WHERE job_key='online_catalog'").get().source_revision > 1);
store.saveSettings({...store.settings(), enabled:false});
assert.deepEqual(store.localization([source]),{version:1,source_language:"tr",target_languages:[],translations:{}});
assert.throws(() => store.list({language:"en"}), /kapalı/);
store.saveSettings({...store.settings(),enabled:true});
const { PublicTranslationService, validateTranslationAnswer } = require("../apps/desktop-app/dist-electron/public-translation-service.js");
for (const answer of ['{}','{"translation":"","faithful":true}','{"translation":"Free for 5 guests","faithful":true}','{"translation":"Changed","faithful":false}']) {
  assert.throws(() => validateTranslationAnswer(answer,"2 kişilik oda"));
}
const { prepareSyncPublication, completeSyncJob, failSyncJob } = require("../apps/desktop-app/dist-electron/database/sync-runtime-store.js");
const frozen = prepareSyncPublication(db,"online_catalog_publish",{products:[{id:"p2",name:"Türkçe"}]});
assert.deepEqual(prepareSyncPublication(db,"online_catalog_publish",{products:[{id:"p2",name:"Changed"}]}).value,frozen.value);
let allowed = true, resolveAnswer;
const calls = [];
const service = new PublicTranslationService(() => ({translations:()=>store}), {allowed:()=>allowed,onChanged:()=>{},translate:(source,language)=>{
  calls.push({source,language}); return new Promise(resolve=>{resolveAnswer=resolve;});
}});
const waitFor = async predicate => { for(let n=0;n<500;n++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));} throw Error("job timeout"); };
await service.start({filter:{language:"en"},selection:[{kind:"catalog_product",id:"p2"}]});
await waitFor(()=>Boolean(resolveAnswer));
const current = store.get({kind:"catalog_product",id:"p2"},"en");
store.saveManual({...current,language:"en",fields:current.fields.map(f=>({field:f.field,sourceHash:f.sourceHash,text:f.field==='name'?"Product 00002":"Fresh product"}))});
resolveAnswer(JSON.stringify({translation:"Product 00002",faithful:true}));
await waitFor(()=>service.status().state!=="running");
assert.equal(store.get({kind:"catalog_product",id:"p2"},"en").manual,2);
const newer = db.prepare("SELECT source_revision FROM sync_outbox WHERE job_key='online_catalog'").get().source_revision;
assert.ok(newer>frozen.sourceRevision);
completeSyncJob(db,"online_catalog",frozen.sourceRevision);
assert.equal(db.prepare("SELECT source_revision FROM sync_outbox WHERE job_key='online_catalog'").get().source_revision,newer);
const translatedBody={products:[{id:"p2",name:"Türkçe"}],localization:store.localization([{kind:"catalog_product",id:"p2",fields:{name:"Ürün 00002"}}])};
const pending=prepareSyncPublication(db,"online_catalog_publish",translatedBody);
failSyncJob(db,"online_catalog",newer,"retry","2099");
assert.deepEqual(prepareSyncPublication(db,"online_catalog_publish",{changed:true}).value,pending.value);
assert.equal(db.prepare("SELECT attempt_count FROM sync_outbox WHERE job_key='online_catalog'").get().attempt_count,1);
completeSyncJob(db,"online_catalog",newer);
assert.equal(db.prepare("SELECT 1 FROM sync_outbox WHERE job_key='online_catalog'").get(),undefined);
resolveAnswer=undefined;
await service.start({filter:{language:"en"},selection:[{kind:"catalog_product",id:"p3"}]});
await waitFor(()=>Boolean(resolveAnswer)); allowed=false;
resolveAnswer(JSON.stringify({translation:"Product 00003",faithful:true}));
await waitFor(()=>service.status().state!=="running");
assert.equal(store.get({kind:"catalog_product",id:"p3"},"en").ready,0,"lock discards in-flight AI response");
await assert.rejects(()=>service.start({filter:{language:"en"}}),/kilitli/);
assert.deepEqual(Object.keys(calls[0]).sort(),["language","source"]);
assert.ok(!JSON.stringify(calls).includes('purchase_price'));
await service.stopAndDrain();
allowed=true; let invalid=true, batchCalls=0;
const batch=new PublicTranslationService(()=>({translations:()=>store}),{allowed:()=>allowed,onChanged:()=>{},translate:async source=>{
  batchCalls++;return invalid?'{}':JSON.stringify({translation:source.startsWith('Ürün')?source.replace('Ürün','Product'):'Fresh product',faithful:true});
}});
const selection=[{kind:'catalog_product',id:'p4'},{kind:'catalog_product',id:'p5'}];
// A previous worker was paused on shutdown. Explicitly cancel its durable queue
// before starting the independent legacy fixture on the same disposable DB.
batch.cancel();
await batch.start({filter:{language:'en'},selection});await waitFor(()=>batch.status().state!=='running');
assert.equal(batch.status().failed,2);assert.equal(store.get(selection[0],'en').failed,2);
const beforeSuccessfulBatch=batchCalls;
invalid=false;await batch.start({filter:{language:'en'},selection});await waitFor(()=>batch.status().state!=='running');
assert.equal(batchCalls-beforeSuccessfulBatch,3,'identical descriptions across records reuse the existing AI result');
assert.equal(batch.status().completed,2);assert.equal(store.get(selection[0],'en').ready,2);
const beforeRetry=batchCalls;
await batch.start({filter:{language:'en'},selection});await waitFor(()=>batch.status().state!=='running');
assert.equal(batchCalls,beforeRetry,'current sources do not generate redundant AI requests');
await batch.start({filter:{language:'en',query:'ürün 00006',state:'missing'}});await waitFor(()=>batch.status().state!=='running');
assert.equal(batch.status().completed,1,'filtered missing selection uses the same operation');
await batch.stopAndDrain();

// Isolated current-schema fixtures exercise actual SQLite writes and the provider boundary.
function fixture(count, {path=":memory:", automatic=false, description=""}={}) {
  const database=new DatabaseSync(path);
  database.exec(readFileSync("apps/desktop-app/db/schema.sql","utf8"));
  database.exec("INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES ('b','Test','Test','market','t','t'); INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b','channel.online_sales','t','t')");
  const owner=new PublicTranslationStore(database);
  owner.saveSettings({enabled:true,sourceLanguage:"tr",targetLanguages:["en"],automatic});
  const selection=[];
  for(let n=0;n<count;n++) {
    const id=`item-${n}`;
    database.prepare("INSERT INTO catalog_products(id,business_id,name,description,created_at,updated_at) VALUES (?,'b',?,?,'t','t')").run(id,`Metin ${n}`,description);
    database.prepare("INSERT INTO commerce_product_publications(product_id,business_id,channel,is_published,created_at,updated_at) VALUES (?,'b','online_sales',1,'t','t')").run(id);
    selection.push({kind:"catalog_product",id});
  }
  return {database,owner,selection};
}
const answerFor = source => ({translation:source.replace(/^Metin/,"Text"),faithful:true});
const keyedAnswer = items => JSON.stringify(Object.fromEntries(items.map(i=>[i.key,answerFor(i.source)])));
const revision = database => database.prepare("SELECT source_revision FROM sync_outbox WHERE job_key='online_catalog'").get()?.source_revision ?? 0;
{
  const f=fixture(30,{description:"Ortak açıklama"}),requests=[];
  let notifications=0;
  const worker=new PublicTranslationService(()=>({translations:()=>f.owner}),{allowed:()=>true,onChanged:()=>notifications++,
    translate:async source=>{requests.push([source]);return JSON.stringify(answerFor(source));},
    translateBatch:async items=>{requests.push(items.map(i=>i.source));return keyedAnswer(items);}});
  const before=revision(f.database);
  await worker.start({filter:{language:"en"},selection:f.selection,mode:"bulk"});
  await waitFor(()=>worker.status().state==="complete");
  const job=worker.status();
  assert.equal(job.completed,30);assert.equal(job.fieldsCompleted,60);assert.equal(job.fieldTotal,60);
  assert.equal(job.requestCount,3);assert.equal(job.batchCount,2);assert.equal(notifications,3);
  assert.deepEqual(requests.map(r=>r.length),[15,15,1]);
  assert.equal(requests.flat().filter(s=>s==="Ortak açıklama").length,1,"identical sources dedupe across all fields and records");
  assert.equal(revision(f.database)-before,3,"one outbox revision per successful request, rather than per field");
  f.database.prepare("UPDATE catalog_products SET name='Metin 0' WHERE id='item-1'").run();
  await worker.start({filter:{language:"en"},selection:[f.selection[1]]});
  await waitFor(()=>worker.status().state==="complete");
  assert.equal(worker.status().requestCount,0,"sourceHash reuse survives jobs");
  const long="Uzun açıklama ".repeat(100);
  f.database.prepare("UPDATE catalog_products SET description=? WHERE id='item-0'").run(long);
  await worker.start({filter:{language:"en"},selection:[f.selection[0]],mode:"bulk"});
  await waitFor(()=>worker.status().state==="complete");
  assert.deepEqual(requests.at(-1),[long],"long text is sent alone");
  await worker.stopAndDrain();f.database.close();
}
{
  const f=fixture(10);let shape="partial",requests=0;
  const worker=new PublicTranslationService(()=>({translations:()=>f.owner}),{allowed:()=>true,onChanged:()=>{},translateBatch:async items=>{
    requests++;
    if(shape==="extra")return JSON.stringify({...JSON.parse(keyedAnswer(items)),unexpected:answerFor("Ek metin")});
    if(shape==="duplicate")return keyedAnswer(items).replace(/^\{/,`{"t0":{"translation":"Text 0","faithful":true},`);
    if(shape==="escaped")return keyedAnswer(items).replace(/^\{/,`{"\\u00740":{"translation":"Text 0","faithful":true},`);
    if(shape==="nested")return keyedAnswer(items).replace('"faithful":true','"faithful":false,"faithful":true');
    const result=JSON.parse(keyedAnswer(items));result.t1={faithful:false};delete result.t2;result.t3={translation:"Wrong 999",faithful:true};
    return JSON.stringify(result);
  }});
  await worker.start({filter:{language:"en"},selection:f.selection});await waitFor(()=>worker.status().state==="complete");
  assert.equal(worker.status().fieldsCompleted,7);assert.equal(worker.status().fieldsFailed,3,"invalid or absent items do not poison valid siblings");
  assert.equal(f.owner.get(f.selection[0],"en").ready,1);
  for(const invalid of ["extra","duplicate","escaped","nested"]) {
    shape=invalid;f.database.exec("DELETE FROM public_translations");
    await worker.start({filter:{language:"en"},selection:f.selection});await waitFor(()=>worker.status().state==="complete");
    assert.equal(worker.status().fieldsCompleted,0,invalid);assert.equal(worker.status().fieldsFailed,10,invalid);
  }
  assert.equal(requests,5,"ambiguous answers do not fan out into extra provider retries");
  await worker.stopAndDrain();f.database.close();
}
{
  const f=fixture(10);let release;
  const worker=new PublicTranslationService(()=>({translations:()=>f.owner}),{allowed:()=>true,onChanged:()=>{},translateBatch:items=>new Promise(resolve=>{release=()=>resolve(keyedAnswer(items));})});
  await worker.start({filter:{language:"en"},selection:f.selection});await waitFor(()=>Boolean(release));
  const manual=f.owner.get(f.selection[0],"en");
  f.owner.saveManual({...manual,language:"en",fields:manual.fields.map(field=>({field:field.field,sourceHash:field.sourceHash,text:"Owner's manual translation"}))});
  f.database.exec("UPDATE catalog_products SET name='Yeni kaynak 1' WHERE id='item-1'; UPDATE commerce_product_publications SET is_published=0 WHERE product_id='item-2'; UPDATE catalog_products SET deleted_at='t' WHERE id='item-3'");
  const before=revision(f.database);release();await waitFor(()=>worker.status().state==="complete");
  assert.equal(worker.status().fieldsCompleted,6);assert.equal(worker.status().fieldsSkipped,4);
  assert.equal(f.owner.get(f.selection[0],"en").fields[0].text,"Owner's manual translation");
  assert.equal(f.owner.get(f.selection[1],"en").ready,0);assert.equal(revision(f.database),before+1);
  assert.equal(f.owner.localization([{...f.selection[1],fields:{name:"Yeni kaynak 1"}}]).translations.catalog_product,undefined,"stale results retain Turkish fallback");
  const writes=f.selection.slice(0,2).map(identity=>({identity,expected:f.owner.get(identity,"en").fields[0],text:"Accepted"}));
  // Remove manual ownership only inside this disposable fixture to exercise transaction rollback.
  f.database.exec("DELETE FROM public_translations");
  const count=f.database.prepare("SELECT count(*) n FROM public_translations").get().n, rev=revision(f.database);
  assert.throws(()=>f.owner.acceptAiBatch("en",[writes[0],{...writes[1],text:""}]),/geçersiz/);
  assert.equal(f.database.prepare("SELECT count(*) n FROM public_translations").get().n,count);
  assert.equal(revision(f.database),rev,"failed bulk write rolls back its outbox too");
  assert.throws(()=>f.owner.acceptAiBatch("en",writes,()=>{throw Error("checkpoint failure");}),/checkpoint/);
  assert.equal(f.database.prepare("SELECT count(*) n FROM public_translations").get().n,count);
  await worker.stopAndDrain();f.database.close();
}
{
  const directory=mkdtempSync(join(tmpdir(),"translation-cooldown-")),path=join(directory,"test.sqlite");
  let f=fixture(10,{path,automatic:true}),now=Date.parse("2026-11-06T10:00:00Z"),calls=0;
  let limited=true;
  const options={allowed:()=>true,onChanged:()=>{},now:()=>now,translateBatch:async items=>{
    calls++;
    return limited?{ok:false,provider:"openai_compatible",reason:"quota_exhausted",status:429,retryAfterSeconds:1800,message:"PRIVATE_PROVIDER_ERROR",fallbackAnswer:""}:keyedAnswer(items);
  }};
  let worker=new PublicTranslationService(()=>({translations:()=>f.owner}),options);
  try {
    worker.reconcile();await waitFor(()=>worker.status()?.state==="waiting");
    const waiting=worker.status();assert.equal(waiting.waitReason,"quota_exhausted");assert.equal(waiting.retryAfterSeconds,1800);
    assert.equal(waiting.nextRetryAt,new Date(now+1800000).toISOString());assert.equal(waiting.fieldsFailed,0);
    assert.equal(f.database.prepare("SELECT count(*) n FROM public_translations").get().n,0,"quota never marks untouched fields failed");
    assert.ok(!JSON.stringify(f.owner.runtime()).includes("PRIVATE_PROVIDER_ERROR"));
    await worker.resume();worker.reconcile();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(calls,1);
    await worker.stopAndDrain();f.database.close();
    // Actual file reopen + a new service preserve the deadline and exact queue checkpoint.
    const database=new DatabaseSync(path);f={...f,database,owner:new PublicTranslationStore(database)};
    worker=new PublicTranslationService(()=>({translations:()=>f.owner}),options);
    worker.reconcile();await waitFor(()=>worker.status()?.state==="waiting");assert.equal(calls,1);
    assert.equal(worker.status().nextRetryAt,waiting.nextRetryAt);
    worker.pause();now+=1800001;worker.reconcile();await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(calls,1,"user pause survives cooldown expiry and automatic reconcile");
    limited=false;await worker.resume();await waitFor(()=>worker.status().state==="complete");
    assert.equal(calls,2);assert.equal(worker.status().fieldsCompleted,10);assert.equal(worker.status().requestCount,2);
    assert.equal(f.owner.runtime().cooldown,null);
  } finally {await worker.stopAndDrain();f.database.close();rmSync(directory,{recursive:true,force:true});}
}
{
  const f=fixture(8);let now=0,calls=0;
  const worker=new PublicTranslationService(()=>({translations:()=>f.owner}),{allowed:()=>true,onChanged:()=>{},now:()=>now,translateBatch:async()=>{
    calls++;throw Object.assign(Error("rate"),{reason:"rate_limited",status:429});
  }});
  await worker.start({filter:{language:"en"},selection:f.selection});await waitFor(()=>worker.status().state==="waiting");
  assert.equal(Date.parse(worker.status().nextRetryAt),30000);now=30001;
  await worker.resume();await waitFor(()=>calls===2 && worker.status().state==="waiting");
  assert.equal(Date.parse(worker.status().nextRetryAt),90001,"consecutive limits use exponential cooldown");
  worker.cancel();assert.equal(worker.status().state,"cancelled");assert.equal(f.owner.runtime().automaticPaused,true);
  await worker.stopAndDrain();
  let resolveLate,lateCalls=0;
  const paused=new PublicTranslationService(()=>({translations:()=>f.owner}),{allowed:()=>true,onChanged:()=>{},now:()=>100000,translateBatch:items=>{
    lateCalls++;return new Promise(resolve=>{resolveLate=()=>resolve(keyedAnswer(items));});
  }});
  await paused.start({filter:{language:"en"},selection:f.selection});await waitFor(()=>Boolean(resolveLate));
  paused.pause();resolveLate();await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(f.database.prepare("SELECT count(*) n FROM public_translations").get().n,0,"pause discards in-flight answers");
  resolveLate=undefined;await paused.resume();await waitFor(()=>Boolean(resolveLate));
  paused.cancel();resolveLate();await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(paused.status().state,"cancelled");assert.equal(lateCalls,2);
  assert.equal(f.database.prepare("SELECT count(*) n FROM public_translations").get().n,0,"cancel discards late answers and does not silently resume");
  await paused.stopAndDrain();
  const restarted=new PublicTranslationService(()=>({translations:()=>f.owner}),{allowed:()=>true,onChanged:()=>{},translateBatch:async()=>{throw Error("must not run");}});
  f.owner.saveSettings({...f.owner.settings(),automatic:true});restarted.reconcile();await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(restarted.status().state,"cancelled","cancel remains terminal after restart/reconcile");
  await restarted.stopAndDrain();f.database.close();
}

console.log("Public translation bulk: bounded/deduped requests, per-item/duplicate validation, transactional outbox, manual/stale races, durable quota/restart, exponential retry, pause/resume/cancel OK.");

// Execute the real IPC registration with Electron supplied by the harness.
const {runInNewContext}=await import("node:vm");
const handlers=new Map(),exports={};
runInNewContext(readFileSync("apps/desktop-app/dist-electron/ipc/public-translation-ipc.js","utf8"),{exports,require:name=>name==='electron'?{ipcMain:{handle:(name,handler)=>handlers.set(name,handler)}}:require(name)});
exports.registerPublicTranslationIpc({database:()=>({translations:()=>store}),service,assertUnlocked:()=>{if(!allowed)throw Error("locked");},onChanged:()=>{}});
allowed=false;
for(const name of handlers.keys()) await assert.rejects(()=>handlers.get(name)({},{}),/locked/,name);
allowed=true; store.saveSettings({...store.settings(),enabled:false});
assert.equal((await handlers.get('translation:list')({},{language:'en'})).ok,false,"persisted service gate at IPC");
db.close();
console.log(`Public translations: manual priority, stale/hash race, retry, privacy, OFF and 10000 records OK (${Math.round(elapsed)} ms).`);
