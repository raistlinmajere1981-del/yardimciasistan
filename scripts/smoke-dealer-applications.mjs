import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import http from "node:http";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { installDemoSite } from "./test-helpers/demo-site.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { SyncCoordinator } = require("../apps/desktop-app/dist-electron/sync-coordinator.js");
const { WebSyncIngress } = require("../apps/desktop-app/dist-electron/web-sync-ingress.js");
const { createAndroidOperationsSnapshot } = require("../apps/desktop-app/dist-electron/android-operations-snapshot.js");
const { PhpHostingSyncTransport } = require("../packages/sync-core/dist/index.js");
const { BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist/index.js");
const root = mkdtempSync(join(tmpdir(), "ya-dealer-applications-")), publicRoot = join(root, "public");
mkdirSync(publicRoot); const hosting = installDemoSite(publicRoot);
const secret = "application-fixture-private-sync";
const configFile = join(hosting, "config/business.json");
writeFileSync(configFile, JSON.stringify({ ...JSON.parse(readFileSync(configFile)), sync_secret: secret }));
const port = await new Promise(resolve => { const s = http.createServer(); s.listen(0, "127.0.0.1", () => { const port = s.address().port; s.close(() => resolve(port)); }); });
const siteUrl = `http://127.0.0.1:${port}`, baseUrl = `${siteUrl}/yardimci-asistan`;
const server = spawn("php", ["-d", "upload_max_filesize=11M", "-d", "post_max_size=52M", "-d", "max_file_uploads=20", "-S", `127.0.0.1:${port}`, "-t", publicRoot], {stdio:["ignore","pipe","pipe"]});
let logs = "", browser, webDb, uiServer;
for (const stream of [server.stdout,server.stderr]) stream.on("data", data => logs += data);
const database = new DesktopDatabase({ appPath: join(process.cwd(), "apps/desktop-app"), userDataPath: join(root,"desktop") });
const setup = createSmokeSetupInput({ businessName: "Başvuru İşletmesi", profileId: "market", profileOptions:[C.WHOLESALE,C.REQUESTS], dealerPortalEnabled:true,
  dealerApplicationEnabled:false, phone:"",whatsapp:"",syncSecret:secret,servicePreferences:{android:false,whatsapp:false},initialCounts:{rooms:0,tables:0},tableCategories:[] });
const coordinator = new SyncCoordinator({database,getSyncConfig:()=>({baseUrl,syncSecret:secret}), createAndroidSnapshot:()=>createAndroidOperationsSnapshot(database,database.getDashboardData()),onDashboardChanged(){},onStatusChanged(){}});
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=", "base64");
const fields = {request_type:"dealer_application",customer_name:"Başvuru Yetkilisi",authorized_person:"Başvuru Yetkilisi",customer_phone:"05551234567",company_name:"Yeni Bayi Ltd",email:"yetkili@example.test",tax_office:"Merkez",tax_number:"1234567890",message:"Başvuru notu",guest_count:"1",price_group:"dealer_b",customer_id:"attacker-selected-customer"};
function clearGuard() { if (webDb?.prepare("SELECT 1 FROM sqlite_master WHERE name='public_request_guard_events'").get()) webDb.exec("DELETE FROM public_request_guard_events"); }
async function submit(key, docs = [], extra = {}) {
  clearGuard(); const data = new FormData();
  for (const [field,value] of Object.entries({...fields,...extra,idempotency_key:key})) data.set(field,String(value));
  for (const doc of docs) { data.append("documents[]",new Blob([doc.bytes],{type:doc.mime??"application/octet-stream"}),doc.name); data.append("document_kinds[]",doc.kind??"other"); }
  const response = await fetch(`${baseUrl}/api/request.php`,{method:"POST",body:data});
  return {status:response.status, body:await response.json()};
}
async function sync() { const result = await coordinator.runNow(); assert.equal(result.ok,true,result.message); }
async function claim(invite) { clearGuard(); const result = await fetch(`${baseUrl}/api/dealer/claim.php`,{method:"POST",headers:{"Content-Type":"application/json","X-YA-Dealer":"1"},body:JSON.stringify({invite_token:new URLSearchParams(new URL(invite).hash.slice(1)).get("invite")})}); return {status:result.status,cookie:result.headers.get("set-cookie")?.split(";")[0]}; }
async function session(cookie) { return (await fetch(`${baseUrl}/api/dealer/session.php`,{headers:{Cookie:cookie}})).status; }
try {
  for (let i=0;;i++) { try { if ((await fetch(`${baseUrl}/api/business.php`)).ok) break; } catch {} if(i>100)throw new Error("PHP did not start"); await new Promise(resolve=>setTimeout(resolve,30)); }
  database.initialize(); assert.equal(database.saveInitialSetup(setup).ok,true); await sync();
  webDb = new DatabaseSync(join(hosting,"data/yardimci-asistan.sqlite"));
  assert.equal((await submit(randomUUID())).status,403,"default disabled");
  assert.equal(webDb.prepare("SELECT COUNT(*) n FROM web_requests").get().n,0);
  assert.equal(database.saveInitialSetup({...setup,dealerApplicationEnabled:true}).ok,true); await sync();
  assert.equal((await (await fetch(`${baseUrl}/api/business.php`)).json()).business.dealer_application_enabled,true,JSON.stringify({local:database.getSetupData().dealerApplicationEnabled,portal:database.getSetupData().dealerPortalEnabled,caps:database.getEnabledBusinessCapabilities(),published:webDb.prepare("SELECT name,payload_json FROM publications WHERE name IN ('business_context','dealer_access_private','android_snapshot')").all().map(row=>({name:row.name,payload:row.name==='business_context'?JSON.parse(row.payload_json).dealerApplicationEnabled:row.name==='android_snapshot'?JSON.parse(row.payload_json).business_capabilities:JSON.parse(row.payload_json).enabled}))}));
  const docs = [{name:"vergi.pdf",bytes:pdf,kind:"tax_certificate"},{name:"faaliyet.png",bytes:png,kind:"activity_certificate"}];
  const key=randomUUID(), created=await submit(key,docs); assert.equal(created.status,201,JSON.stringify(created));
  const id=created.body.request_id;
  assert.match(created.body.whatsapp_message,/Talep türü: Bayi başvurusu/);
  assert.match(created.body.whatsapp_message,/Firma: Yeni Bayi Ltd/);
  assert.match(created.body.whatsapp_message,/Yetkili: Başvuru Yetkilisi/);
  assert.match(created.body.whatsapp_message,/E-posta: yetkili@example\.test/);
  assert.doesNotMatch(created.body.whatsapp_message,/(?:Tarih:|Kişi sayısı:|Bilgi talebi|1234567890)/);
  const replay=await submit(key,docs); assert.equal(replay.body.request_id,id);
  assert.equal((await submit(key,docs,{company_name:"Değişen Firma"})).status,409);
  assert.equal(webDb.prepare("SELECT COUNT(*) n FROM web_requests").get().n,1);
  const privateRoot = readdirSync(root).find(name=>name.startsWith(".ya-request-documents-"));
  assert.equal(readdirSync(join(root,privateRoot)).length,2,"retry does not duplicate stored bytes");
  const beforeFailure=webDb.prepare("SELECT COUNT(*) n FROM web_requests").get().n;
  webDb.exec("CREATE TRIGGER fixture_receipt_failure BEFORE INSERT ON web_request_submission_receipts BEGIN SELECT RAISE(ABORT,'fixture_receipt_failure'); END");
  try { assert.equal((await submit(randomUUID(),docs)).status,500); assert.equal(webDb.prepare("SELECT COUNT(*) n FROM web_requests").get().n,beforeFailure); assert.equal(readdirSync(join(root,privateRoot)).length,2,"failed receipt rolls back request and new files"); }
  finally {webDb.exec("DROP TRIGGER fixture_receipt_failure");}
  assert.equal((await submit(randomUUID(),[{name:"fake.pdf",bytes:Buffer.from("<script>unsafe</script>")}])).status,422);
  assert.equal((await submit(randomUUID(),[{name:"big.pdf",bytes:Buffer.alloc(10*1024*1024+1)}])).status,422);
  assert.equal((await submit(randomUUID(),Array.from({length:6},(_,i)=>({name:`${i}.pdf`,bytes:pdf})))).status,422);
  assert.equal((await submit(randomUUID(),[],{document_kinds:"missing"})).status,422);
  const jpeg=readFileSync("scripts/fixtures/instagram-square.jpg");
  assert.equal((await submit(randomUUID(),[...docs,{name:"yetki.jpg",bytes:jpeg,kind:"authorization"},{name:"diger.jpeg",bytes:jpeg,kind:"other"},{name:"ek.pdf",bytes:pdf,kind:"other"}],{customer_phone:"05553334455",tax_number:"3333333333"})).status,201,"all five optional files and all formats are supported");
  const rawRequest=JSON.parse(webDb.prepare("SELECT payload_json FROM web_requests WHERE id=?").get(id).payload_json);
  assert.equal(rawRequest.customer_id,""); assert.equal(rawRequest.dealer_application.tax_number,fields.tax_number); assert.equal("price_group" in rawRequest.dealer_application,false);
  assert.equal((await fetch(`${baseUrl}/api/dealer/catalog.php`)).status,401,"unapproved applicants have no catalog");
  const runtime=database.getSyncRuntimeStatus();
  const transport=new PhpHostingSyncTransport({baseUrl,syncSecret:secret,clientId:runtime.clientId,sourceEpoch:runtime.sourceEpoch});
  const download=transport.downloadRequestDocument.bind(transport);
  transport.downloadRequestDocument=async()=>{throw new Error("network interrupted");};
  const ingress=new WebSyncIngress({database},()=>"test",()=>{});
  assert.ok((await ingress.pullRequestPages(transport)).error); assert.equal(database.getSyncRuntimeStatus().requestCursor,0);
  assert.equal(database.getRequestById(id),null,"incomplete files cannot ACK/import request");
  transport.downloadRequestDocument=download; await sync();
  const imported=database.getRequestById(id); assert.equal(imported.documents.length,2); assert.equal(imported.customer_id,"");
  assert.equal(database.getDashboardData().customers.length,0,"submission cannot activate/create dealer");
  const query={action:"request_document",request_id:id,document_id:imported.documents[0].id};
  const downloadPost=headers=>fetch(`${baseUrl}/api/sync.php`,{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(query)});
  assert.equal((await downloadPost({})).status,401);
  assert.equal((await downloadPost({Cookie:"ya_dealer_session="+"x".repeat(43)})).status,401);
  assert.deepEqual(Buffer.from(await (await downloadPost({"X-YA-Sync-Secret":secret})).arrayBuffer()),pdf);
  assert.equal((await fetch(`${baseUrl}/data/${query.document_id}`)).status,404);
  assert.equal(database.approveDealerApplication(id,"client-decides").ok,false);
  assert.equal(database.updateRequestStatus({requestId:id,status:"approved"}).ok,false,"generic status cannot bypass conversion");
  const approved=database.approveDealerApplication(id,"dealer_a"); assert.equal(approved.ok,true,approved.message);
  const customerId=approved.customerId;
  assert.equal(database.getCustomer(customerId).commercialProfile.priceGroup,"dealer_a");
  assert.equal(database.getDealerWebAccess(customerId).enabled,true);
  assert.equal(database.approveDealerApplication(id,"dealer_b").customerId,customerId);
  assert.equal(database.getCustomer(customerId).commercialProfile.priceGroup,"dealer_a","retry cannot change owner choice");
  assert.equal(database.getDashboardData().customers.length,1);
  database.upsertRequests([rawRequest]); assert.equal(database.getRequestById(id).status,"approved"); assert.equal(database.getRequestById(id).customer_id,customerId);
  assert.equal(database.getCustomerRequests(customerId)[0].documents.length,2,"history keeps original files");
  const firstInvite=database.changeDealerWebAccess(customerId,"invite").inviteUrl; await sync();
  const web=await claim(firstInvite); assert.equal(web.status,200);
  const nextInvite=database.changeDealerWebAccess(customerId,"invite").inviteUrl; await sync();
  assert.equal(await session(web.cookie),200,"new Android invitation preserves web session");
  const android=await claim(nextInvite); assert.equal(android.status,200); assert.equal(await session(web.cookie),200); assert.equal(await session(android.cookie),200);
  database.changeDealerWebAccess(customerId,"revoke_sessions"); const unused=database.changeDealerWebAccess(customerId,"invite").inviteUrl;
  database.changeDealerWebAccess(customerId,"revoke_sessions"); await sync();
  assert.equal(await session(web.cookie),401); assert.equal(await session(android.cookie),401); assert.equal((await claim(unused)).status,400);
  const pending=database.changeDealerWebAccess(customerId,"invite").inviteUrl; await sync(); const beforeInactive=await claim(pending);
  let customer=database.getCustomer(customerId); assert.equal(database.saveCustomer({...customer,commercialProfile:{...customer.commercialProfile,dealerStatus:"inactive"}}).ok,true); await sync();
  assert.equal(await session(beforeInactive.cookie),401);
  customer=database.getCustomer(customerId); assert.equal(database.saveCustomer({...customer,commercialProfile:{...customer.commercialProfile,dealerStatus:"active"}}).ok,true); await sync();
  assert.equal(await session(beforeInactive.cookie),401); assert.equal((await claim(pending)).status,400);
  // Matching an existing customer preserves its card, with conflicts failing atomically.
  const second=await submit(randomUUID(),[],{customer_phone:"05552223344",tax_number:"2222222222",company_name:"Mevcut Firma"});
  const existing=database.saveCustomer({...customer,id:"",fullName:"Korunan Müşteri",phone:"05552223344",commercialProfile:null}); assert.equal(existing.ok,true);
  await sync(); const matched=database.approveDealerApplication(second.body.request_id,"retail"); assert.equal(matched.customerId,existing.savedId); assert.equal(database.getCustomer(existing.savedId).fullName,"Korunan Müşteri");
  const conflict=await submit(randomUUID(),[],{customer_phone:"05552223344",tax_number:fields.tax_number}); await sync();
  const count=database.getDashboardData().customers.length; assert.equal(database.approveDealerApplication(conflict.body.request_id,"dealer_b").ok,false); assert.equal(database.getDashboardData().customers.length,count);
  // A failed canonical write cannot leave a customer, conversion link or approved request.
  const rollbackRequest=await submit(randomUUID(),[],{customer_phone:"05557776655",tax_number:"7777777777"}); await sync();
  const rawDesktop=new DatabaseSync(database.databasePath);
  try {
    rawDesktop.exec("CREATE TRIGGER fixture_reject_dealer BEFORE INSERT ON customer_commercial_profiles WHEN NEW.tax_number='7777777777' BEGIN SELECT RAISE(ABORT,'fixture_failure'); END");
    const before=database.getDashboardData().customers.length;
    assert.equal(database.approveDealerApplication(rollbackRequest.body.request_id,"dealer_b").ok,false);
    assert.equal(database.getDashboardData().customers.length,before); assert.equal(database.getRequestById(rollbackRequest.body.request_id).status,"new");
    rawDesktop.exec("DROP TRIGGER fixture_reject_dealer");
    const desired=database.createDealerAccessProjection(); desired.dealers.find(item=>item.access_id===database.getDealerWebAccess(customerId).accessId).invite_revision-=1;
    const revision=rawDesktop.prepare("SELECT source_revision FROM sync_publication_payloads WHERE job_key='dealer_access'").get().source_revision;
    assert.equal((await transport.publishDealerAccess({sourceRevision:revision+1,idempotencyKey:randomUUID(),value:desired})).ok,false,"delayed invite publication cannot reinstate retired invite");
  } finally {rawDesktop.close();}
  // Real IPC handlers: lock/capability/document binding, PDF open, image preview and Save As.
  const handlers=new Map(), opened=[]; let locked=false, allowed=true;
  const originalLoad=Module._load;
  Module._load=function(name,...args) { if(name==="electron")return {ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},shell:{openPath:async path=>{opened.push(path);assert.ok(readFileSync(path).length);return "";}},dialog:{showSaveDialog:async()=>({canceled:false,filePath:join(root,"download.pdf")})}};return originalLoad.call(this,name,...args); };
  try {
    const {registerRequestIpcHandlers}=require("../apps/desktop-app/dist-electron/ipc/request-ipc.js");
    registerRequestIpcHandlers({getDatabase:()=>database,assertUnlocked:()=>{if(locked)throw new Error("locked");},assertCapability:()=>{if(!allowed)throw new Error("denied");},assertRequestType(){},finalizeRecordDeletion:r=>r});
  } finally {Module._load=originalLoad;}
  const document=handlers.get("request:document"), doc=imported.documents[0];
  await document({},id,doc.id,"open"); assert.equal(opened.length,1);
  await document({},id,doc.id,"download"); assert.deepEqual(readFileSync(join(root,"download.pdf")),pdf);
  assert.match(await document({},id,imported.documents[1].id,"preview"),/^data:image\/png;base64,/);
  await assert.rejects(()=>document({},second.body.request_id,doc.id,"open"),/bulunamadı/);
  locked=true; await assert.rejects(()=>document({},id,doc.id,"open"),/locked/); locked=false; allowed=false; await assert.rejects(()=>document({},id,doc.id,"open"),/denied/); allowed=true;
  // Real Widget form: selection/removal, failed upload retry retains identity.
  browser=await launchChromiumForSmoke(chromium); const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(siteUrl); await page.waitForFunction(()=>window.YardimciAsistanWidget); await page.evaluate(()=>window.YardimciAsistanWidget.open());
  await page.getByRole("button",{name:/Bayi Başvurusu/}).click(); const form=page.locator("[data-dealer-application]");
  for(const [name,value]of Object.entries(fields))if(await form.locator(`[name="${name}"]`).count())await form.locator(`[name="${name}"]`).fill(value);
  await form.locator('[data-document-picker]').setInputFiles([{name:"belge.pdf",mimeType:"application/pdf",buffer:pdf},{name:"resim.png",mimeType:"image/png",buffer:png}]);
  await expect(form.locator('[data-document-list] button')).toHaveCount(2); await form.getByRole("button",{name:"Kaldır"}).first().click(); await expect(form.locator('[data-document-list] button')).toHaveCount(1);
  const attempts=[];
  await page.route("**/api/request.php",async route=>{attempts.push(route.request().postDataBuffer().toString()); if(attempts.length===1)await route.abort();else await route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({ok:true,request_id:"widget-accepted"})});});
  await form.getByRole("button",{name:"Başvuruyu Gönder"}).click(); await expect(form.locator('[data-application-status]')).toContainText("yeniden deneyin");
  await form.getByRole("button",{name:"Başvuruyu Gönder"}).click(); await expect(form.locator('[data-application-status]')).toContainText("değerlendirmesi bekleniyor");
  const keyFrom=body=>body.match(/name="idempotency_key"\r\n\r\n([^\r]+)/)[1]; assert.equal(keyFrom(attempts[0]),keyFrom(attempts[1])); assert.match(attempts[0],/dealer_application/);
  // Desktop request details and customer history use the same real document handlers.
  const uiRequest=await submit(randomUUID(),docs,{customer_phone:"05558889900",tax_number:"8888888888",company_name:"UI Firma"}); await sync();
  const appPath=join(process.cwd(),"apps/desktop-app");
  uiServer=await createServer({root:appPath,configFile:join(appPath,"vite.renderer.config.ts"),logLevel:"error",server:{port:0,host:"127.0.0.1"},plugins:[{name:"dealer-application-ui-fixture",configureServer(instance){instance.middlewares.use("/dealer-application-ui",async (_req,res)=>{res.setHeader("Content-Type","text/html");res.end(await instance.transformIndexHtml("/dealer-application-ui",`<!doctype html><html lang="tr" data-color-scheme="light" data-density="compact"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs/${join(process.cwd(),"scripts/fixtures/dealer-application-ui.tsx")}"></script></body></html>`));});}}]});
  await uiServer.listen();
  const ui=await browser.newPage({viewport:{width:1280,height:900}}); ui.setDefaultTimeout(8000); const errors=[]; ui.on("pageerror",error=>errors.push(error.message));
  await ui.exposeFunction("__applicationCall",async (method,args)=>{if(method==="approve")return database.approveDealerApplication(...args);if(method==="status")return database.updateRequestStatus({requestId:args[0],status:args[1]});if(method==="document")return document({},...args);if(method==="access")return database.getDealerWebAccess(...args);if(method==="changeAccess")return database.changeDealerWebAccess(...args);throw new Error(method);});
  await ui.addInitScript(({data,id})=>{window.__applicationData=data;window.__applicationId=id;window.yardimciDesktop={approveDealerApplication:(...args)=>window.__applicationCall("approve",args),requestDocument:(...args)=>window.__applicationCall("document",args),getDealerWebAccess:(...args)=>window.__applicationCall("access",args),changeDealerWebAccess:(...args)=>window.__applicationCall("changeAccess",args)};},{data:database.getDashboardData(),id:uiRequest.body.request_id});
  await ui.goto(`http://127.0.0.1:${uiServer.httpServer.address().port}/dealer-application-ui`);
  const review=ui.getByRole("region",{name:"Bayi başvurusu",exact:true}); await expect(review).toContainText("UI Firma"); await expect(review).toContainText("8888888888");
  await expect(review.getByRole("button",{name:"Onayla ve Bayi Oluştur"})).toBeDisabled();
  await review.getByRole("button",{name:"Görseli önizle"}).click(); await expect(review.getByAltText("Başvuru belgesi önizlemesi")).toBeVisible();
  await review.getByRole("button",{name:"Önizlemeyi kapat"}).click(); await review.getByRole("button",{name:"PDF aç"}).click();
  await ui.getByRole("button",{name:"Reddet",exact:true}).click(); await expect(review.getByRole("button",{name:"Onayla ve Bayi Oluştur"})).toHaveCount(0);
  assert.equal(database.getRequestById(uiRequest.body.request_id).dealer_customer_id,"");
  await ui.getByRole("button",{name:"Yeniden Aç"}).click(); await review.getByLabel("Fiyat grubu",{exact:true}).selectOption("dealer_b");
  await review.getByRole("button",{name:"Onayla ve Bayi Oluştur"}).click(); await expect(review.getByRole("region",{name:"Bayi Girişi"})).toBeVisible();
  assert.equal(database.getCustomer(database.getRequestById(uiRequest.body.request_id).dealer_customer_id).commercialProfile.priceGroup,"dealer_b");
  await ui.getByRole("button",{name:"Müşteri geçmişi",exact:true}).click(); await expect(ui.getByRole("region",{name:"Başvuru belgeleri"})).toContainText("vergi.pdf");
  await ui.getByRole("button",{name:"Görseli önizle"}).click(); await expect(ui.getByAltText("Başvuru belgesi önizlemesi")).toBeVisible(); assert.deepEqual(errors,[]);
  assert.equal(database.saveInitialSetup({...setup,dealerApplicationEnabled:false}).ok,true); await sync(); assert.equal((await submit(randomUUID(),docs)).status,403);
  assert.ok(!logs.includes(secret)); console.log("dealer-applications-smoke-ok: gate, multipart validation, retry, durable files, approval, matching, concurrent sessions, revocation, IPC authorization and Widget");
} finally {await uiServer?.close();await browser?.close();webDb?.close();database.close();server.kill();await new Promise(resolve=>server.once("exit",resolve));rmSync(root,{recursive:true,force:true});}
