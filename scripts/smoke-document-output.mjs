import assert from "node:assert/strict";
import { test, after } from "node:test";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

// Compile only the three owned modules; never consume stale desktop/shared builds.
const root = mkdtempSync(join(tmpdir(), "document-output-"));
const require = createRequire(import.meta.url);
for (const file of ["packages/shared/types/business-capabilities.ts", "packages/shared/types/document-output.ts", "apps/desktop-app/electron/document-output-store.ts", "apps/desktop-app/electron/document-output-render-snapshot.ts", "apps/desktop-app/electron/document-output-snapshot-store.ts", "apps/desktop-app/electron/document-form-images.ts", "apps/desktop-app/electron/document-output-html.ts", "apps/desktop-app/electron/document-output-pdf.ts", "apps/desktop-app/electron/document-output-print-claim.ts", "apps/desktop-app/electron/document-output-management.ts", "apps/desktop-app/electron/document-output-native-print.ts"]) {
  const target = join(root, file.replace(/\.ts$/, ".js"));
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
}
mkdirSync(join(root, "node_modules/@yardimci-asistan/shared"), { recursive: true });
writeFileSync(join(root, "node_modules/@yardimci-asistan/shared/index.js"), 'module.exports = {...require("../../../packages/shared/types/document-output.js"), ...require("../../../packages/shared/types/business-capabilities.js")};');
const shared = require(join(root, "packages/shared/types/document-output.js"));
const caps = require(join(root, "packages/shared/types/business-capabilities.js"));
const store = require(join(root, "apps/desktop-app/electron/document-output-store.js"));
const snapshots = require(join(root, "apps/desktop-app/electron/document-output-snapshot-store.js"));
const printClaim = require(join(root, "apps/desktop-app/electron/document-output-print-claim.js"));
const { composeDocumentHtml } = require(join(root, "apps/desktop-app/electron/document-output-html.js"));
mkdirSync(join(root, "node_modules/electron"), { recursive: true });
writeFileSync(join(root, "node_modules/electron/index.js"), 'module.exports = {};');
const { DocumentFormImages } = require(join(root, "apps/desktop-app/electron/document-form-images.js"));
const { printConfirmedDocument } = require(join(root, "apps/desktop-app/electron/document-output-native-print.js"));
after(() => rmSync(root, { recursive: true, force: true }));
const C = caps.BUSINESS_CAPABILITIES;
const layout = () => ({ unit: "mm10", pageWidth: 800, pageHeight: 2000,
  fields: [{ binding: "business.name", x: 20, y: 20, width: 600, height: 50 }],
  lineBlock: { y: 100, rowHeight: 50, maxRows: 20, fields: [{ binding: "line.description", x: 20, y: 0, width: 600, height: 50 }] },
  scan: { originalImageRef: "original_1", processedImageRef: "processed_1", foreground: true } });
function fixture(t) {
  const db = new DatabaseSync(join(root, `fixture-${crypto.randomUUID()}.sqlite`));
  t.after(() => db.close());
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(readFileSync("apps/desktop-app/db/schema.sql", "utf8"));
  for (const id of ["b1", "b2"]) {
    db.prepare("INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES(?,?,?,'market','now','now')").run(id,id,id);
    for (const capability of [C.PRINTING, C.SALES]) enable(db, capability, true, id);
    db.prepare("INSERT INTO document_printer_bindings VALUES(?,?,?,?)").run(id,"install1","printer1","local-printer-1");
    store.createDocumentTemplate(db,id,"receipt",1,"sale_receipt",layout());
    rule(db, { businessId: id });
  }
  return db;
}
function enable(db, capability, enabled, business = "b1") {
  db.prepare("INSERT INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at) VALUES(?,?,?,'now','now') ON CONFLICT(business_id,capability_id) DO UPDATE SET is_enabled=excluded.is_enabled").run(business,capability,Number(enabled));
}
function rule(db, patch = {}) {
  store.saveDocumentOutputRule(db, { businessId: "b1", documentKind: "sale_receipt", trigger: "sale_completed", channel: "print", mode: "AUTOMATIC", adapter: "native_print", ...patch });
}
function job(db, patch = {}) {
  return store.createDocumentOutputJob(db, { businessId: "b1", installationId: "install1", sourceId: "sale1", operationId: "complete1", commandKind: "event", documentKind: "sale_receipt", trigger: "sale_completed", channel: "print", templateId: "receipt", templateRevision: 1, copies: 1, printerBindingId: "printer1", ...patch });
}
function row(db,id) { return db.prepare("SELECT * FROM document_output_jobs WHERE business_id='b1' AND id=?").get(id); }
function state(db,id,next) { db.prepare("UPDATE document_output_jobs SET state=? WHERE business_id='b1' AND id=?").run(next,id); }

test("native print adapter validates, claims once and records callback outcomes", async t => {
  const db=fixture(t), template=layout(); template.scan=null;
  store.createDocumentTemplate(db,"b1","manual-native",1,"sale_receipt",template);
  rule(db,{trigger:"manual",mode:"ASK_CONFIRMATION"});
  const makeJob = operationId => {
    const id=job(db,{commandKind:"manual",trigger:"manual",operationId,templateId:"manual-native",copies:2});
    const scope={businessId:"b1",installationId:"install1",jobId:id};
    snapshots.captureDocumentRenderSnapshot(db,scope,{"business.name":"İzmir\n<script>"},[{"line.description":"Satır\niki"}]);
    return scope;
  };
  let calls=0, confirmed=0, options, callbackMode="accepted", printers=[{name:"local-printer-1"}], destroyed;
  const authority={assertAuthorized(){},async assertExplicitUserConfirmation(){confirmed++;}};
  const dependencies={timeoutMs:5,prepare(db,scope){const snapshot=snapshots.readDocumentRenderSnapshot(db,scope); if (!snapshot) throw Error("DOCUMENT_SNAPSHOT_UNAVAILABLE"); return {snapshot,html:composeDocumentHtml(snapshot,snapshots.readDocumentSnapshotImages(db,scope))};},
    async open(html){assert.match(html,/MALİ BELGE DEĞİLDİR/); assert.match(html,/Satır\n iki|Satır\niki/); assert.match(html,/&lt;script&gt;/); return {async getPrinters(){return printers;},onDestroyed(cb){destroyed=cb;},close(){},print(value,cb){calls++;options=value; if(callbackMode==="accepted") cb(true); if(callbackMode==="failed") cb(false); if(callbackMode==="destroy") destroyed(); if(callbackMode==="throw") throw Error("driver");}};}};
  const first=makeJob("native1");
  assert.equal(await printConfirmedDocument(db,first,authority,dependencies),"accepted");
  assert.deepEqual(options,{silent:true,deviceName:"local-printer-1",printBackground:true,copies:2,pageSize:{width:80000,height:200000}});
  assert.equal(row(db,first.jobId).state,"accepted");
  assert.equal(await printConfirmedDocument(db,first,authority,dependencies),null); assert.equal(calls,1);
  for (const [mode,expected] of [["failed","failed"],["timeout","unknown"],["destroy","unknown"],["throw","unknown"]]) {
    callbackMode=mode; const scope=makeJob(`native-${mode}`);
    assert.equal(await printConfirmedDocument(db,scope,authority,dependencies),expected);
    assert.equal(row(db,scope.jobId).state,expected);
    const before=calls; assert.equal(await printConfirmedDocument(db,scope,authority,dependencies),null); assert.equal(calls,before);
  }
  const blocked=makeJob("native-blocked"), before=calls;
  printers=[]; await assert.rejects(printConfirmedDocument(db,blocked,authority,dependencies),/DOCUMENT_PRINTER_INVALID/);
  printers=[{name:"local-printer-1",options:{"printer-state-reasons":"offline-report"}}];
  await assert.rejects(printConfirmedDocument(db,blocked,authority,dependencies),/DOCUMENT_PRINTER_INVALID/);
  printers=[{name:"local-printer-1"}];
  await assert.rejects(printConfirmedDocument(db,blocked,{...authority,assertAuthorized(){throw Error("LOCKED");}},dependencies),/LOCKED/);
  await assert.rejects(printConfirmedDocument(db,blocked,{...authority,async assertExplicitUserConfirmation(){throw Error("DECLINED");}},dependencies),/DECLINED/);
  let locked=false;
  await assert.rejects(printConfirmedDocument(db,blocked,{assertAuthorized(){if(locked) throw Error("LOCKED");},async assertExplicitUserConfirmation(){locked=true;}},dependencies),/LOCKED/);
  await assert.rejects(printConfirmedDocument(db,{...blocked,installationId:"wrong"},authority,dependencies),/DOCUMENT_SNAPSHOT_UNAVAILABLE/);
  enable(db,C.SALES,false); await assert.rejects(printConfirmedDocument(db,blocked,authority,dependencies));
  assert.equal(row(db,blocked.jobId).state,"awaiting-confirmation"); assert.equal(calls,before); assert.ok(confirmed>0);
  enable(db,C.SALES,true);
  db.exec("DROP TRIGGER document_render_snapshot_no_update");
  db.prepare("UPDATE document_output_render_snapshots SET payload_json='{}' WHERE job_id=?").run(blocked.jobId);
  await assert.rejects(printConfirmedDocument(db,blocked,authority,dependencies),/DOCUMENT_SNAPSHOT_INVALID/);
  assert.equal(row(db,blocked.jobId).state,"awaiting-confirmation"); assert.equal(calls,before);
});

test("confirmed manual claim is atomic, scoped and never repeatable", t => {
  const db=fixture(t), template=layout(); template.scan=null;
  store.createDocumentTemplate(db,"b1","manual",1,"sale_receipt",template);
  rule(db,{trigger:"manual",mode:"ASK_CONFIRMATION"});
  const id=job(db,{commandKind:"manual",trigger:"manual",operationId:"manual1",templateId:"manual"});
  const scope={businessId:"b1",installationId:"install1",jobId:id};
  const authority={assertConfirmedAndAuthorized() {},availableDeviceNames:["local-printer-1"]};
  assert.throws(()=>printClaim.claimConfirmedManualPrint(db,scope,authority),/DOCUMENT_SNAPSHOT_UNAVAILABLE/);
  snapshots.captureDocumentRenderSnapshot(db,scope,{},[]);
  assert.throws(()=>printClaim.claimConfirmedManualPrint(db,scope,{...authority,assertConfirmedAndAuthorized(){throw Error("LOCKED");}}),/LOCKED/);
  assert.throws(()=>printClaim.claimConfirmedManualPrint(db,scope,{...authority,availableDeviceNames:[]}),/DOCUMENT_PRINTER_INVALID/);
  let checks=0;
  assert.throws(()=>printClaim.claimConfirmedManualPrint(db,scope,{...authority,assertConfirmedAndAuthorized(){if (++checks === 2) throw Error("LOCKED");}}),/LOCKED/);
  assert.throws(()=>printClaim.claimConfirmedManualPrint(db,{...scope,installationId:"other"},authority),/DOCUMENT_SNAPSHOT_UNAVAILABLE/);
  assert.equal(row(db,id).state,"awaiting-confirmation");
  enable(db,C.SALES,false);
  assert.throws(()=>printClaim.claimConfirmedManualPrint(db,scope,authority));
  enable(db,C.SALES,true);
  assert.deepEqual(printClaim.claimConfirmedManualPrint(db,scope,authority),{deviceName:"local-printer-1",copies:1});
  assert.equal(row(db,id).state,"sending");
  assert.equal(printClaim.claimConfirmedManualPrint(db,scope,authority),null);
  assert.equal(printClaim.finishManualPrintClaim(db,scope,"unknown"),true);
  assert.equal(printClaim.finishManualPrintClaim(db,scope,"accepted"),false);
  assert.equal(printClaim.claimConfirmedManualPrint(db,scope,authority),null);
  assert.equal(row(db,id).state,"unknown");
});

test("manual claim rejects incomplete frozen images and automatic jobs", t => {
  const db=fixture(t), authority={assertConfirmedAndAuthorized(){},availableDeviceNames:["local-printer-1"]};
  rule(db,{trigger:"manual",mode:"ASK_CONFIRMATION"});
  const id=job(db,{commandKind:"manual",trigger:"manual",operationId:"manual-images"});
  const scope={businessId:"b1",installationId:"install1",jobId:id};
  snapshots.captureDocumentRenderSnapshot(db,scope,{},[]);
  assert.throws(()=>printClaim.claimConfirmedManualPrint(db,scope,authority),/DOCUMENT_SNAPSHOT_IMAGES_INVALID/);
  assert.equal(row(db,id).state,"awaiting-confirmation");
  const template=layout(); template.scan=null;
  store.createDocumentTemplate(db,"b1","automatic",1,"sale_receipt",template);
  const automatic=job(db,{sourceId:"auto",templateId:"automatic"});
  const autoScope={...scope,jobId:automatic};
  snapshots.captureDocumentRenderSnapshot(db,autoScope,{},[]);
  assert.throws(()=>printClaim.claimConfirmedManualPrint(db,autoScope,authority),/DOCUMENT_PRINT_UNAVAILABLE/);
  assert.equal(row(db,automatic).state,"queued");
});

test("render snapshot capture is scoped, durable, immutable and identical-replay only", t => {
  const db=fixture(t), id=job(db), scope={businessId:"b1",installationId:"install1",jobId:id};
  assert.equal(snapshots.readDocumentRenderSnapshot(db,scope),null);
  const values={"business.name":"İlk"}, lines=[{"line.description":"Ürün"}];
  const original=snapshots.captureDocumentRenderSnapshot(db,scope,values,lines);
  assert.deepEqual(snapshots.captureDocumentRenderSnapshot(db,scope,values,lines),original);
  values["business.name"]="Son"; lines[0]["line.description"]="Değişti";
  assert.throws(() => snapshots.captureDocumentRenderSnapshot(db,scope,values,lines),/DOCUMENT_SNAPSHOT_CONFLICT/);
  assert.deepEqual(snapshots.readDocumentRenderSnapshot(db,scope),original);
  const path=db.prepare("PRAGMA database_list").all()[0].file;
  const reopened=new DatabaseSync(path); t.after(() => reopened.close());
  assert.deepEqual(snapshots.readDocumentRenderSnapshot(reopened,scope),original);
  assert.equal(original.legalMeaning,"non_fiscal_copy");
  assert.throws(() => db.prepare("UPDATE document_output_render_snapshots SET payload_json='{}'").run(),/DOCUMENT_SNAPSHOT_IMMUTABLE/);
  assert.throws(() => db.prepare("DELETE FROM document_output_render_snapshots").run(),/DOCUMENT_SNAPSHOT_IMMUTABLE/);
  assert.throws(() => db.prepare("INSERT OR REPLACE INTO document_output_render_snapshots VALUES('b1','install1',?,'{}')").run(id),/DOCUMENT_SNAPSHOT_IMMUTABLE/);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
});
test("snapshot access rejects wrong scope, missing jobs, invalid data and revoked capabilities", t => {
  const db=fixture(t), id=job(db), scope={businessId:"b1",installationId:"install1",jobId:id};
  for (const bad of [{...scope,businessId:"b2"},{...scope,installationId:"other"},{...scope,jobId:"missing"}]) {
    assert.throws(() => snapshots.captureDocumentRenderSnapshot(db,bad,{},[]),/DOCUMENT_SNAPSHOT_UNAVAILABLE/);
    assert.throws(() => snapshots.readDocumentRenderSnapshot(db,bad),/DOCUMENT_SNAPSHOT_UNAVAILABLE/);
  }
  assert.throws(() => db.prepare("INSERT INTO document_output_render_snapshots VALUES('b1','other',?,'{}')").run(id),/DOCUMENT_SNAPSHOT_JOB_MISSING/);
  assert.throws(() => db.prepare("INSERT INTO document_output_render_snapshots VALUES('b1','install1','missing','{}')").run(),/DOCUMENT_SNAPSHOT_JOB_MISSING/);
  assert.throws(() => snapshots.captureDocumentRenderSnapshot(db,scope,{"business.name":"ü".repeat(2049)},[]),/DOCUMENT_RENDER_VALUES_INVALID/);
  assert.equal(snapshots.readDocumentRenderSnapshot(db,scope),null);
  snapshots.captureDocumentRenderSnapshot(db,scope,{},[]);
  enable(db,C.PRINTING,false);
  assert.throws(() => snapshots.readDocumentRenderSnapshot(db,scope),/DOCUMENT_SNAPSHOT_UNAVAILABLE/);
  assert.throws(() => snapshots.captureDocumentRenderSnapshot(db,scope,{},[]),/DOCUMENT_SNAPSHOT_UNAVAILABLE/);
});
test("corrupt snapshot fails closed rather than being returned or replayed", t => {
  const db=fixture(t), id=job(db), scope={businessId:"b1",installationId:"install1",jobId:id};
  db.prepare("INSERT INTO document_output_render_snapshots VALUES(?,?,?,?)").run("b1","install1",id,'{}');
  assert.throws(() => snapshots.readDocumentRenderSnapshot(db,scope),/DOCUMENT_SNAPSHOT_INVALID/);
  assert.throws(() => snapshots.captureDocumentRenderSnapshot(db,scope,{},[]),/DOCUMENT_SNAPSHOT_INVALID/);
});

test("safe document composition uses frozen scoped content and empty image sets", t => {
  const db=fixture(t), template=layout(); template.scan=null;
  store.createDocumentTemplate(db,"b1","html",1,"sale_receipt",template);
  const id=job(db,{templateId:"html"}), scope={businessId:"b1",installationId:"install1",jobId:id};
  snapshots.captureDocumentRenderSnapshot(db,scope,{"business.name":"İzmir <script> &\nş"},[{"line.description":"Ürün"},{"line.description":"İkinci"}]);
  const html=composeDocumentHtml(snapshots.readDocumentRenderSnapshot(db,scope),snapshots.readDocumentSnapshotImages(db,scope));
  assert.match(html,/İzmir &lt;script&gt; &amp;\nş/); assert.doesNotMatch(html,/<script>/);
  assert.match(html,/MALİ BELGE DEĞİLDİR/); assert.match(html,/size:80mm 200mm/);
  assert.match(html,/top:15mm/); assert.match(html,/white-space:pre-wrap/);
  assert.match(html,/default-src 'none'/); assert.doesNotMatch(html,/<img/);
  for (const bad of [{...scope,businessId:"b2"},{...scope,installationId:"other"},{...scope,jobId:"missing"}]) assert.throws(() => snapshots.readDocumentSnapshotImages(db,bad));
});

test("frozen image bytes are scoped, atomic, immutable and independent of source files", t => {
  const db=fixture(t), png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aX8AAAAASUVORK5CYII=","base64");
  const source=join(root,`source-${crypto.randomUUID()}.png`); writeFileSync(source,png);
  const owner=new DocumentFormImages(root, bytes => ({width:1,height:1,png:bytes}));
  const original=owner.importOriginal(source,"b1","sale_receipt");
  const processed=owner.saveProcessed(original.imageRef,png.toString("base64"),"b1","sale_receipt");
  const template=layout(); template.scan={originalImageRef:original.imageRef,processedImageRef:processed.imageRef,foreground:false};
  store.createDocumentTemplate(db,"b1","frozen",1,"sale_receipt",template);
  const id=job(db,{templateId:"frozen"}), scope={businessId:"b1",installationId:"install1",jobId:id};
  assert.throws(() => snapshots.captureDocumentSnapshotImages(db,scope,owner),/DOCUMENT_SNAPSHOT_UNAVAILABLE/);
  snapshots.captureDocumentRenderSnapshot(db,scope,{},[]);
  assert.throws(() => snapshots.readDocumentSnapshotImages(db,scope),/DOCUMENT_SNAPSHOT_IMAGES_INVALID/);
  const result=snapshots.captureDocumentSnapshotImages(db,scope,owner);
  const html=composeDocumentHtml(snapshots.readDocumentRenderSnapshot(db,scope),result);
  assert.match(html,/class="scan background"/); assert.ok(html.includes(result[1].bytes.toString("base64")));
  const foreground={...snapshots.readDocumentRenderSnapshot(db,scope),scan:{...template.scan,foreground:true,processedImageRef:null}};
  assert.match(composeDocumentHtml(foreground,[result[0]]),/class="scan foreground"/);
  assert.deepEqual(result.map(x=>x.role),["original","processed"]);
  assert.deepEqual(snapshots.captureDocumentSnapshotImages(db,scope,owner),result);
  for (const bad of [{...scope,businessId:"b2"},{...scope,installationId:"other"},{...scope,jobId:"missing"}]) assert.throws(() => snapshots.readDocumentSnapshotImages(db,bad),/DOCUMENT_SNAPSHOT_UNAVAILABLE/);
  assert.throws(() => db.prepare("UPDATE document_output_snapshot_images SET sha256='x'").run(),/DOCUMENT_IMAGE_IMMUTABLE/);
  assert.throws(() => db.prepare("DELETE FROM document_output_snapshot_images").run(),/DOCUMENT_IMAGE_IMMUTABLE/);
  const folder=join(root,"doc-form-images",require("node:crypto").createHash("sha256").update("b1").digest("hex"),"sale_receipt");
  const altered=Buffer.from(png); altered[altered.length-1]^=1; writeFileSync(join(folder,`${original.imageRef}.png`),altered);
  assert.deepEqual(snapshots.readDocumentSnapshotImages(db,scope),result);
  assert.throws(() => snapshots.captureDocumentSnapshotImages(db,scope,owner),/DOCUMENT_SNAPSHOT_IMAGES_CONFLICT/);
  db.exec("DROP TRIGGER document_snapshot_image_no_update");
  db.prepare("UPDATE document_output_snapshot_images SET bytes=? WHERE role='original'").run(altered);
  assert.throws(() => snapshots.readDocumentSnapshotImages(db,scope),/DOCUMENT_SNAPSHOT_IMAGES_INVALID/);
});

test("no-scan snapshots need no image rows and incomplete captures roll back", t => {
  const db=fixture(t), template=layout(); template.scan=null;
  store.createDocumentTemplate(db,"b1","no-scan",1,"sale_receipt",template);
  const id=job(db,{templateId:"no-scan"}), scope={businessId:"b1",installationId:"install1",jobId:id};
  snapshots.captureDocumentRenderSnapshot(db,scope,{},[]);
  assert.deepEqual(snapshots.readDocumentSnapshotImages(db,scope),[]);
  assert.deepEqual(snapshots.captureDocumentSnapshotImages(db,scope,new DocumentFormImages(root,()=>{throw Error();})),[]);
  const other=job(db,{sourceId:"other"}), otherScope={...scope,jobId:other};
  snapshots.captureDocumentRenderSnapshot(db,otherScope,{},[]);
  assert.throws(() => snapshots.captureDocumentSnapshotImages(db,otherScope,new DocumentFormImages(root,()=>{throw Error();})));
  assert.equal(db.prepare("SELECT count(*) n FROM document_output_snapshot_images WHERE job_id=?").get(other).n,0);
});

test("PRINTING optional for all profiles, default OFF, no new sector roots", () => {
  for (const p of caps.getBusinessProfiles()) {
    assert.ok(p.optionalCapabilities.includes(C.PRINTING));
    assert.ok(!p.defaultCapabilities.includes(C.PRINTING));
    assert.ok(caps.getBusinessProfileSelectionCapabilities(p.id,[C.PRINTING]).includes(C.PRINTING));
  }
  assert.equal(shared.documentKindEnabled("product_label", caps.getBusinessProfileSelectionCapabilities("pension",[C.PRINTING])),false);
  assert.equal(shared.documentKindEnabled("table_bill",caps.getBusinessProfileSelectionCapabilities("market",[C.PRINTING])),false);
  assert.deepEqual(caps.validateBusinessCapabilitySet([C.PRINTING]),[]);
});
test("current SQLite schema integrity and persisted capability gating retain history", t => {
  const db=fixture(t); const id=job(db);
  enable(db,C.PRINTING,false);
  assert.throws(() => job(db,{sourceId:"sale2"}), /DOCUMENT_CAPABILITY_DISABLED/);
  assert.throws(() => state(db,id,"sending"),/DOCUMENT_CAPABILITY_DISABLED/);
  assert.equal(row(db,id).state,"queued");
  enable(db,C.PRINTING,true); enable(db,C.SALES,false);
  assert.throws(() => job(db,{sourceId:"sale2"}),/DOCUMENT_CAPABILITY_DISABLED/);
  assert.throws(() => state(db,id,"sending"),/DOCUMENT_EXECUTION_DISABLED/);
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
});
test("sector documents use persisted SQLite capabilities rather than profile labels", t => {
  const db=fixture(t);
  db.prepare("UPDATE business SET profile_id='pension' WHERE id='b2'").run();
  enable(db,C.SALES,false,"b2");
  for (const [businessId,kind,templateId] of [["b2","product_label","label"],["b1","table_bill","bill"],["b2","stay_statement","stay"]]) {
    store.createDocumentTemplate(db,businessId,templateId,1,kind,layout());
    rule(db,{businessId,documentKind:kind,trigger:"manual"});
  }
  const pensionLabel={businessId:"b2",documentKind:"product_label",trigger:"manual",commandKind:"manual",templateId:"label"};
  const marketBill={documentKind:"table_bill",trigger:"manual",commandKind:"manual",templateId:"bill"};
  assert.throws(() => job(db,pensionLabel),/DOCUMENT_CAPABILITY_DISABLED/);
  assert.throws(() => job(db,marketBill),/DOCUMENT_CAPABILITY_DISABLED/);
  enable(db,C.ACCOMMODATION_STAYS,true,"b2");
  assert.ok(job(db,{businessId:"b2",documentKind:"stay_statement",trigger:"manual",commandKind:"manual",templateId:"stay"}));
  for (const c of caps.expandBusinessCapabilities([C.FOOD_ORDERS])) enable(db,c,true);
  assert.ok(job(db,marketBill)); // Persisted authorization, never a profile-name switch.
});
test("mode and channel compatibility fail closed, independently configured channels", t => {
  const db=fixture(t);
  assert.throws(() => rule(db,{channel:"whatsapp",adapter:"whatsapp_webview"}),/DOCUMENT_RULE_INVALID/);
  assert.throws(() => rule(db,{channel:"print",adapter:"smtp"}),/DOCUMENT_RULE_INVALID/);
  assert.throws(() => rule(db,{mode:"invalid"}),/DOCUMENT_RULE_INVALID/);
  assert.throws(() => rule(db,{trigger:"table_closed"}),/DOCUMENT_RULE_INVALID/);
  assert.throws(() => db.prepare("UPDATE document_output_rules SET adapter='whatsapp_webview',channel='whatsapp'").run(),/CHECK/);
  rule(db,{mode:"OFF"}); assert.throws(() => job(db),/DOCUMENT_RULE_DISABLED/);
  rule(db,{mode:"ASK_CONFIRMATION"}); const print=job(db);
  assert.equal(row(db,print).state,"awaiting-confirmation");
  rule(db,{channel:"email",adapter:"smtp"});
  const email=job(db,{channel:"email",printerBindingId:undefined});
  assert.equal(row(db,email).state,"queued"); assert.notEqual(email,print);
  rule(db,{channel:"whatsapp",adapter:"whatsapp_webview",mode:"ASK_CONFIRMATION"});
  assert.throws(() => job(db,{channel:"whatsapp",printerBindingId:undefined}),/DOCUMENT_CAPABILITY_DISABLED/);
  enable(db,C.WHATSAPP,true);
  const wa=job(db,{channel:"whatsapp",printerBindingId:undefined}); assert.equal(row(db,wa).state,"awaiting-confirmation");
  assert.equal(shared.documentChannelCompatible("whatsapp","whatsapp_business_api","AUTOMATIC"),true);
  assert.throws(() => rule(db,{documentKind:"invoice_copy",trigger:"sale_completed"}),/DOCUMENT_RULE_INVALID/);
});
test("adapter readiness and real autonomous support are required independently of configured mode", t => {
  const db=fixture(t);
  const capabilities=db.prepare("SELECT capability_id FROM business_capabilities WHERE business_id='b1' AND is_enabled=1").all().map(r => r.capability_id);
  const policy={ businessId:"b1", documentKind:"sale_receipt", trigger:"sale_completed", channel:"print", mode:"AUTOMATIC", adapter:"native_print" };
  const support={ adapter:"native_print", available:false, supportsAutonomousDelivery:false };
  assert.equal(shared.documentOutputSupported(policy,capabilities,support),false);
  assert.equal(shared.documentOutputSupported(policy,capabilities,{...support,available:true}),false);
  assert.equal(shared.documentOutputSupported(policy,capabilities,{...support,available:true,supportsAutonomousDelivery:true}),true);
  assert.equal(shared.documentOutputSupported({...policy,mode:"OFF"},capabilities,{...support,available:true,supportsAutonomousDelivery:true}),false);
});
test("whitelist, 0.1mm integer geometry, scan refs and bounded template data", t => {
  const db=fixture(t);
  for (const mutate of [
    l => l.fields[0].binding="raw.html", l => l.fields[0].x=1.5, l => l.pageWidth=5001,
    l => l.fields[0].width=900, l => l.fields[0].script="alert(1)", l => l.unit="px",
    l => l.lineBlock.maxRows=201, l => l.scan.originalImageRef="https://example.test/image",
    l => l.fields[0].binding="line.price", l => l.lineBlock.fields[0].height=51,
    l => l.scan.ai="automatic", l => l.html="<script>run()</script>"
  ]) {
    const value=layout(); mutate(value);
    assert.throws(() => store.createDocumentTemplate(db,"b1",crypto.randomUUID(),1,"sale_receipt",value),/DOCUMENT_TEMPLATE_INVALID/);
    assert.throws(() => db.prepare("INSERT INTO document_print_templates VALUES('b1',?,1,'sale_receipt',?,'now')").run(crypto.randomUUID(),JSON.stringify(value)),/DOCUMENT_TEMPLATE_INVALID|CHECK/);
  }
  assert.throws(() => db.prepare("UPDATE document_print_templates SET revision=2").run(),/DOCUMENT_TEMPLATE_IMMUTABLE/);
  for (const copies of [0,101,1.5]) assert.throws(() => job(db,{copies}),/CHECK/);
});
test("event replay has one job even with changed operation; explicit reprints are new commands", t => {
  const db=fixture(t); const original=job(db);
  assert.equal(job(db),original);
  assert.equal(job(db,{operationId:"different-event-delivery"}),original);
  const copy=job(db,{commandKind:"manual",operationId:"user-reprint1",reprintOf:original});
  assert.notEqual(copy,original); assert.equal(row(db,copy).reprint_of,original);
  assert.equal(job(db,{commandKind:"manual",operationId:"user-reprint1",reprintOf:original}),copy);
  assert.throws(() => job(db,{commandKind:"manual",operationId:"user-reprint1",reprintOf:original,copies:2}),/DOCUMENT_COMMAND_CONFLICT/);
  assert.notEqual(job(db,{commandKind:"manual",operationId:"user-reprint2",reprintOf:original}),copy);
  assert.throws(() => job(db,{commandKind:"manual",operationId:"bad-lineage",sourceId:"other",reprintOf:original}),/DOCUMENT_REPRINT_LINEAGE/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM document_output_jobs WHERE business_id='b1'").get().n,3);
  assert.notEqual(job(db,{businessId:"b2"}),original);
  const columns = db.prepare("PRAGMA table_info(document_output_jobs)").all().map(r => r.name);
  const duplicate = { ...row(db,original), id: "different-id", operation_id: "different-operation" };
  assert.throws(() => db.prepare(`INSERT INTO document_output_jobs (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...columns.map(c => duplicate[c])),/UNIQUE/);
});
test("binding and state writes are private to installation and business", t => {
  const db=fixture(t);
  assert.throws(() => job(db,{installationId:"install2"}),/FOREIGN KEY/);
  rule(db,{mode:"ASK_CONFIRMATION"}); const id=job(db);
  assert.equal(store.transitionDocumentOutputJob(db,"b1","install2",id,"awaiting-confirmation","queued"),false);
  db.prepare("INSERT INTO document_printer_bindings VALUES('b1','install2','printer1','private-printer-2')").run();
  const copy=job(db,{commandKind:"manual",operationId:"second-install-command",installationId:"install2",reprintOf:id});
  assert.equal(row(db,copy).installation_id,"install2");
  assert.equal(db.prepare("SELECT printer_ref FROM document_printer_bindings WHERE business_id='b1' AND installation_id='install1'").get().printer_ref,"local-printer-1");
  assert.throws(() => db.prepare("UPDATE document_printer_bindings SET printer_ref='reroute'").run(),/DOCUMENT_BINDING_IMMUTABLE/);
});
test("snapshots immutable, no legal issuance, unknown terminal and adapter absent", t => {
  const db=fixture(t); const id=job(db);
  assert.equal(row(db,id).legal_meaning,"non_fiscal_copy");
  assert.throws(() => state(db,id,"issued"),/DOCUMENT_STATE_TRANSITION|CHECK/);
  assert.throws(() => db.prepare("UPDATE document_output_jobs SET source_id='changed' WHERE id=?").run(id),/DOCUMENT_JOB_IMMUTABLE/);
  assert.throws(() => store.transitionDocumentOutputJob(db,"b1","install1",id,"queued","sending"),/DOCUMENT_ADAPTER_NOT_IMPLEMENTED/);
  state(db,id,"sending"); enable(db,C.PRINTING,false); state(db,id,"unknown"); enable(db,C.PRINTING,true);
  assert.throws(() => db.prepare("DELETE FROM document_output_jobs WHERE id=?").run(id),/DOCUMENT_JOB_IMMUTABLE/);
  assert.throws(() => state(db,id,"queued"),/DOCUMENT_STATE_TRANSITION/);
  assert.throws(() => state(db,id,"sending"),/DOCUMENT_STATE_TRANSITION/);
  assert.equal(job(db),id); assert.equal(row(db,id).state,"unknown");
  const copy=job(db,{commandKind:"manual",operationId:"explicit-after-review",reprintOf:id});
  assert.notEqual(copy,id);
});
test("confirmation, CAS claim, accepted means adapter acknowledgement only", t => {
  const db=fixture(t); rule(db,{mode:"ASK_CONFIRMATION"}); const id=job(db);
  assert.throws(() => state(db,id,"sending"),/DOCUMENT_STATE_TRANSITION/);
  assert.equal(store.transitionDocumentOutputJob(db,"b1","install1",id,"awaiting-confirmation","queued"),true);
  assert.equal(store.transitionDocumentOutputJob(db,"b1","install1",id,"awaiting-confirmation","queued"),false);
  rule(db,{mode:"OFF"}); assert.throws(() => state(db,id,"sending"),/DOCUMENT_EXECUTION_DISABLED/);
  rule(db,{mode:"ASK_CONFIRMATION"}); state(db,id,"sending"); state(db,id,"accepted");
  assert.throws(() => state(db,id,"queued"),/DOCUMENT_STATE_TRANSITION/);
});

test("extended document kinds mirror SQL capabilities and trigger compatibility", t => {
  const db = fixture(t);
  const extensions = [
    ["credit_statement", C.CUSTOMER_CREDIT, ["customer_statement_requested"]],
    ["shipping_label", C.ORDERS, ["order_dispatched", "shipment_created"]],
    ["kitchen_ticket", C.FOOD_ORDERS, ["order_created"]]
  ];
  const triggers = ["manual", "sale_completed", "table_closed", "stay_checked_out", "customer_statement_requested", "order_dispatched", "shipment_created", "order_created", "invalid"];
  for (const [kind, capability, events] of extensions) {
    store.createDocumentTemplate(db, "b1", kind, 1, kind, layout());
    for (const trigger of triggers) {
      const compatible = trigger === "manual" || events.includes(trigger);
      assert.equal(shared.documentTriggerCompatible(kind, trigger), compatible);
      const insert = () => db.prepare("INSERT OR REPLACE INTO document_output_rules VALUES('b1',?,?, 'print','AUTOMATIC','native_print')").run(kind, trigger);
      if (compatible) insert(); else assert.throws(insert, /CHECK/);
    }
    const input = { documentKind: kind, templateId: kind, trigger: events[0], sourceId: kind };
    assert.equal(shared.documentKindEnabled(kind, [C.PRINTING]), false);
    assert.throws(() => job(db, input), /DOCUMENT_CAPABILITY_DISABLED/);
    for (const c of caps.expandBusinessCapabilities([capability])) enable(db, c, true);
    assert.equal(shared.documentKindEnabled(kind, [C.PRINTING, capability]), true);
    const id = job(db, input);
    enable(db, capability, false);
    assert.throws(() => state(db, id, "sending"), /DOCUMENT_EXECUTION_DISABLED/);
  }
  assert.equal(shared.documentTriggerCompatible("invoice_copy", "sale_completed"), false);
  assert.equal(shared.documentKindEnabled("shipping_label", caps.getBusinessProfileSelectionCapabilities("market", [C.PRINTING])), false);
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
});
