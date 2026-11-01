import assert from "node:assert/strict";
import { test, after } from "node:test";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, statSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const root = mkdtempSync(join(tmpdir(), "document-output-management-"));
const require = createRequire(import.meta.url);
for (const file of ["packages/shared/types/business-capabilities.ts", "packages/shared/types/document-output.ts", "apps/desktop-app/electron/document-printer-installation.ts", "apps/desktop-app/electron/document-form-images.ts", "apps/desktop-app/electron/document-output-store.ts", "apps/desktop-app/electron/document-output-sale-job.ts", "apps/desktop-app/electron/document-output-sale-source.ts", "apps/desktop-app/electron/document-output-render-snapshot.ts", "apps/desktop-app/electron/document-output-snapshot-store.ts", "apps/desktop-app/electron/document-output-ready.ts", "apps/desktop-app/electron/document-output-html.ts", "apps/desktop-app/electron/document-output-pdf.ts", "apps/desktop-app/electron/document-output-print-claim.ts", "apps/desktop-app/electron/document-output-native-print.ts", "apps/desktop-app/electron/document-output-management.ts", "apps/desktop-app/electron/ipc/document-output-ipc.ts", "apps/desktop-app/electron/preload.ts"]) {
  const target = join(root, file.replace(/\.ts$/, ".js"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
}
for (const name of ["electron", "@yardimci-asistan/shared"]) mkdirSync(join(root, "node_modules", name), { recursive: true });
writeFileSync(join(root, "node_modules/@yardimci-asistan/shared/index.js"), 'module.exports = {...require("../../../packages/shared/types/document-output.js"), ...require("../../../packages/shared/types/business-capabilities.js")};');
writeFileSync(join(root, "node_modules/electron/index.js"), `const state = { handlers: new Map(), calls: [], locked: false };
module.exports = { state,
app: {getPath:name=>{if(name!=='userData') throw Error('unexpected path');return state.userData;}},
BrowserWindow: {fromWebContents:sender=>sender===state.event.sender ? state.parent : null},
 dialog: {showMessageBox:async(parent,options)=>{state.confirmDialog={parent,options};return {response:await state.confirm()};},showOpenDialog:async(parent,options)=>{state.dialog={parent,options};const source=await state.chooseImage();return {canceled:source===null,filePaths:source===null?[]:[source]};}},
nativeImage: {createFromBuffer:bytes=>{const value=state.decodeImage(bytes);return {isEmpty:()=>false,getSize:()=>({width:value.width,height:value.height}),toPNG:()=>value.png};}},
ipcMain: { handle: (channel, handler) => state.handlers.set(channel, handler) },
contextBridge: { exposeInMainWorld: (_name, bridge) => state.bridge = bridge }, webFrame: {},
ipcRenderer: { invoke: async (channel, ...args) => { state.calls.push(channel); if(channel === 'appLock:getStatus') { const locked = state.locked; if(state.lockAfterPreflight) state.locked = true; return {locked}; } return state.handlers.get(channel)(state.event, ...args); } } };`);
// Load the established production/dev URL predicate itself without booting Electron.
const runtimeSource = ts.createSourceFile("desktop-runtime.ts", readFileSync("apps/desktop-app/electron/desktop-runtime.ts", "utf8"), ts.ScriptTarget.Latest, true);
const predicateNode = runtimeSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "createTrustedDesktopRendererUrlPredicate");
assert.ok(predicateNode);
writeFileSync(join(root, "trusted-url.js"), ts.transpileModule(predicateNode.getText(runtimeSource), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
const { createTrustedDesktopRendererUrlPredicate } = require(join(root, "trusted-url.js"));
const { state } = require(join(root, "node_modules/electron"));
const { registerDocumentOutputIpcHandlers } = require(join(root, "apps/desktop-app/electron/ipc/document-output-ipc.js"));
const { DocumentOutputManagement, sanitizeDocumentPrinters } = require(join(root, "apps/desktop-app/electron/document-output-management.js"));
const { BUSINESS_CAPABILITIES: C } = require(join(root, "packages/shared/types/business-capabilities.js"));
require(join(root, "apps/desktop-app/electron/preload.js"));
after(() => rmSync(root, { recursive: true, force: true }));
function fixture(t, native = false) {
  const path = join(root, `${crypto.randomUUID()}.sqlite`);
  const db = new DatabaseSync(path);
  t.after(() => db.close());
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(readFileSync("apps/desktop-app/db/schema.sql", "utf8"));
  for (const id of ["b1", "b2"]) {
    db.prepare("INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES(?,?,?,'market',?, 'now')").run(id,id,id,id);
    db.prepare("INSERT INTO settings(id,business_id,created_at,updated_at) VALUES(?,?,'now','now')").run(id,id);
    for (const capability of [C.PRINTING, C.SALES, C.WHATSAPP]) enable(db,id,capability,true);
  }
  const frame = { url: "http://localhost:5173/" };
  state.printers = [{name:"Printer A",displayName:"Desk printer",isDefault:true}]; state.enumerations = 0;
  state.event = { sender: { getPrintersAsync: async () => { state.enumerations++; return state.printers; }, getType: () => "window", mainFrame: frame }, senderFrame: frame };
  state.installation = "device-a";
  state.locked = false; state.lockAfterPreflight = false; state.calls = [];
  const imageRoot = mkdtempSync(join(root,"images-"));
  state.userData = imageRoot;state.parent={};state.dialog=null;
  state.chooseImage = async () => null;
  state.decodeImage = bytes => { assert.deepEqual(bytes, smallPng); return {width:1,height:1,png:smallPng}; };
  state.confirm = async () => 0; state.printDocument = undefined; state.previewDocument = undefined;
  registerDocumentOutputIpcHandlers({ previewDocument: (...args) => state.previewDocument(...args), printDocument: (...args) => state.printDocument(...args), formImages: native ? undefined : {userData:()=>imageRoot, choose:()=>state.chooseImage(), decode:bytes=>state.decodeImage(bytes)}, installationId: () => state.installation ?? "device-a", databasePath: () => path,
    assertUnlocked: () => { if(state.locked) throw Error("locked"); },
    isTrustedRendererUrl: createTrustedDesktopRendererUrlPredicate(true, "http://localhost:5173") });
  const invoke = (channel, ...args) => state.handlers.get(`documentOutput:${channel}`)(state.event, ...args);
  return { db, invoke, imageRoot, read: () => invoke("read", { documentKind: "sale_receipt" }) };
}
function enable(db,business,capability,enabled) {
  db.prepare("INSERT INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at) VALUES(?,?,?,'now','now') ON CONFLICT(business_id,capability_id) DO UPDATE SET is_enabled=excluded.is_enabled").run(business,capability,Number(enabled));
}
const rule = patch => ({ documentKind: "sale_receipt", trigger: "manual", channel: "print", mode: "AUTOMATIC", adapter: "native_print", ...patch });
test("sale receipt IPC requires trusted unlocked owner and persists one real ready job without printing", async t => {
  const f = fixture(t);
  const store = require(join(root,"apps/desktop-app/electron/document-output-store.js"));
  f.db.exec(`INSERT INTO commerce_sales(id,business_id,status,subtotal,discount_total,total,currency,opened_at,closed_at,created_at,updated_at) VALUES('s','b1','paid',10,0,10,'TRY','now','2026-10-28T12:30:00.000Z','now','now'),('foreign','b2','paid',10,0,10,'TRY','now','2026-10-28T12:30:00.000Z','now','now');
    INSERT INTO catalog_products(id,business_id,name,sale_price,created_at,updated_at) VALUES('p','b1','Ürün',10,'now','now');
    INSERT INTO commerce_sale_items(id,sale_id,product_id,product_name,barcode,unit_price,quantity,line_total,created_at) VALUES('i','s','p','Ürün','',10,1,10,'now');`);
  const invoke = input => f.invoke("prepareSaleReceipt", input);
  for (const input of [{saleId:"s",businessId:"b2"}, {saleId:""}, {saleId:3}, {}, {saleId:"s",html:"x"}]) assert.equal(invoke(input).code,"DOCUMENT_INPUT_INVALID");
  assert.equal(invoke({saleId:"s"}).code,"DOCUMENT_SALE_JOB_CONFIGURATION_MISSING");
  const receiptLayout = {unit:"mm10",pageWidth:800,pageHeight:1600,fields:[{binding:"business.name",x:10,y:10,width:500,height:40}],lineBlock:{y:100,rowHeight:40,maxRows:2,fields:["line.description","line.quantity","line.total"].map((binding,index)=>({binding,x:10+index*200,y:0,width:190,height:40}))},scan:null};
  store.createDocumentTemplate(f.db,"b1","default:sale_receipt",1,"sale_receipt",{...receiptLayout,lineBlock:null});
  f.db.prepare("INSERT INTO document_printer_bindings VALUES('b1','device-a','sale_receipt','Printer A')").run();
  store.saveDocumentOutputRule(f.db,{businessId:"b1",...rule({mode:"AUTOMATIC"})});
  assert.equal(invoke({saleId:"s"}).code,"DOCUMENT_SALE_JOB_CONFIGURATION_MISSING");
  store.saveDocumentOutputRule(f.db,{businessId:"b1",...rule({mode:"ASK_CONFIRMATION"})});
  const missingLines = invoke({saleId:"s"});
  assert.equal(missingLines.code,"DOCUMENT_SALE_JOB_LINES_MISSING");
  assert.match(missingLines.message,/Baskı Yönetimi > Satış fişi > Düzenle > Ürün satırlarını ekle > Şablonları kaydet/);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM document_output_jobs").get().n,0);
  store.createDocumentTemplate(f.db,"b1","default:sale_receipt",2,"sale_receipt",{...receiptLayout,fields:[...receiptLayout.fields,{binding:"product.barcode",x:10,y:50,width:100,height:40}]});
  assert.equal(invoke({saleId:"s"}).code,"DOCUMENT_SALE_PREPARE_FAILED");
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM document_output_jobs").get().n,0);
  store.createDocumentTemplate(f.db,"b1","default:sale_receipt",3,"sale_receipt",receiptLayout);
  assert.equal(invoke({saleId:"foreign"}).code,"DOCUMENT_SALE_SOURCE_INVALID");
  assert.equal(invoke({saleId:"unknown"}).code,"DOCUMENT_SALE_SOURCE_INVALID");
  for (const capability of [C.PRINTING,C.SALES]) { enable(f.db,"b1",capability,false); assert.equal(invoke({saleId:"s"}).code,"DOCUMENT_CAPABILITY_DISABLED"); enable(f.db,"b1",capability,true); }
  state.locked=true; assert.equal(invoke({saleId:"s"}).code,"DOCUMENT_SESSION_LOCKED"); state.locked=false;
  const frame=state.event.senderFrame; state.event.senderFrame={url:frame.url}; assert.equal(invoke({saleId:"s"}).code,"DOCUMENT_OWNER_REQUIRED"); state.event.senderFrame=frame;
  frame.url="https://untrusted.invalid"; assert.equal(invoke({saleId:"s"}).code,"DOCUMENT_OWNER_REQUIRED"); frame.url="http://localhost:5173/";
  const result = await state.bridge.prepareSaleReceipt({saleId:"s"});
  assert.equal(result.ok,true); assert.deepEqual(invoke({saleId:"s"}),result);
  assert.deepEqual((await f.invoke("listReady",{documentKind:"sale_receipt"})).value.map(item=>item.jobId),[result.value.jobId]);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM document_output_jobs").get().n,1);
  assert.equal(f.db.prepare("SELECT state FROM document_output_jobs").get().state,"awaiting-confirmation");
  store.saveDocumentOutputRule(f.db,{businessId:"b1",...rule({mode:"OFF"})});
  assert.equal(invoke({saleId:"s"}).code,"DOCUMENT_SALE_JOB_CONFIGURATION_MISSING");
  assert.equal(state.enumerations,0); assert.equal(state.confirmDialog,undefined);
});
test("ready IPC scopes frozen jobs and explicit native confirmation; cancel, revocation and repeat never spool", async t => {
  const f = fixture(t);
  const store = require(join(root,"apps/desktop-app/electron/document-output-store.js"));
  const snapshots = require(join(root,"apps/desktop-app/electron/document-output-snapshot-store.js"));
  const native = require(join(root,"apps/desktop-app/electron/document-output-native-print.js"));
  const layout = {unit:"mm10",pageWidth:800,pageHeight:1600,fields:[{binding:"business.name",x:10,y:10,width:500,height:40}],lineBlock:null,scan:null};
  f.db.prepare("INSERT INTO document_printer_bindings VALUES('b1','device-a','p','Printer A')").run();
  f.db.prepare("INSERT INTO document_printer_bindings VALUES('b1','device-b','p','Printer A')").run();
  f.db.prepare("INSERT INTO document_printer_bindings VALUES('b2','device-a','p','Printer A')").run();
  store.createDocumentTemplate(f.db,"b1","t",1,"sale_receipt",layout);
  store.createDocumentTemplate(f.db,"b2","t",1,"sale_receipt",layout);
  store.saveDocumentOutputRule(f.db,{businessId:"b1",...rule({mode:"ASK_CONFIRMATION"})});
  store.saveDocumentOutputRule(f.db,{businessId:"b2",...rule({mode:"ASK_CONFIRMATION"})});
  const make = (operationId, installationId = "device-a") => store.createDocumentOutputJob(f.db,{businessId:"b1",installationId,sourceId:"s",operationId,commandKind:"manual",documentKind:"sale_receipt",trigger:"manual",channel:"print",templateId:"t",templateRevision:1,copies:1,printerBindingId:"p"});
  const id = make("one"), missing = make("missing"), other = make("other","device-b");
  const foreign = store.createDocumentOutputJob(f.db,{businessId:"b2",installationId:"device-a",sourceId:"s",operationId:"foreign",commandKind:"manual",documentKind:"sale_receipt",trigger:"manual",channel:"print",templateId:"t",templateRevision:1,copies:1,printerBindingId:"p"});
  snapshots.captureDocumentRenderSnapshot(f.db,{businessId:"b1",installationId:"device-a",jobId:id},{"business.name":"Gerçek"},[]);
  snapshots.captureDocumentRenderSnapshot(f.db,{businessId:"b1",installationId:"device-b",jobId:other},{"business.name":"Başka"},[]);
  snapshots.captureDocumentRenderSnapshot(f.db,{businessId:"b2",installationId:"device-a",jobId:foreign},{"business.name":"Başka işletme"},[]);
  let spools = 0;
  state.printDocument = (db,scope,authority) => native.printConfirmedDocument(db,scope,authority,{
    prepare(db,scope) { const snapshot = snapshots.readDocumentRenderSnapshot(db,scope); if (!snapshot) throw Error(); snapshots.readDocumentSnapshotImages(db,scope); return {snapshot,html:"test"}; },
    async open() { return {getPrinters:async()=>[{name:"Printer A"}],print(_options,callback){spools++;callback(true);},onDestroyed(){},close(){}}; }, timeoutMs:1000
  });
  const input = {documentKind:"sale_receipt"};
  const pdfOwner = require(join(root,"apps/desktop-app/electron/document-output-pdf.js"));
  let checks, previews = 0;
  state.previewDocument = async (db, scope, parent, check) => { assert.equal(parent,state.parent); check(); const rendered = pdfOwner.prepareDocumentHtml(db,scope); assert.match(rendered.html,/Gerçek/); assert.match(rendered.html,/MALİ BELGE DEĞİLDİR/); checks=check; previews++; };
  assert.deepEqual(await state.bridge.previewReadyDocument({...input,jobId:id}),{ok:true,value:null});
  assert.equal(previews,1); assert.equal(spools,0);
  for (const jobId of [missing,other,foreign,"0".repeat(64)]) assert.equal((await f.invoke("previewReady",{...input,jobId})).ok,false);
  assert.equal((await f.invoke("previewReady",{...input,jobId:id,html:"x"})).code,"DOCUMENT_INPUT_INVALID");
  assert.equal((await f.invoke("previewReady",{documentKind:"table_bill",jobId:id})).ok,false);
  state.locked=true; assert.throws(checks); assert.equal((await f.invoke("previewReady",{...input,jobId:id})).code,"DOCUMENT_SESSION_LOCKED"); state.locked=false;
  state.installation="device-b"; assert.throws(checks); state.installation="device-a";
  enable(f.db,"b1",C.PRINTING,false); assert.throws(checks); enable(f.db,"b1",C.PRINTING,true);
  assert.equal(f.db.prepare("SELECT state FROM document_output_jobs WHERE id=?").get(id).state,"awaiting-confirmation");
  assert.deepEqual((await f.invoke("listReady",input)).value.map(item=>item.jobId),[id]);
  assert.equal((await f.invoke("listReady",{...input,businessId:"b2"})).code,"DOCUMENT_INPUT_INVALID");
  assert.equal((await f.invoke("printReady",{...input,jobId:"bad"})).code,"DOCUMENT_INPUT_INVALID");
  assert.equal((await f.invoke("printReady",{...input,jobId:missing})).ok,false);
  assert.equal((await f.invoke("printReady",{...input,jobId:other})).ok,false);
  assert.equal((await f.invoke("printReady",{...input,jobId:foreign})).ok,false);
  assert.equal((await f.invoke("printReady",{documentKind:"table_bill",jobId:id})).ok,false);
  assert.equal((await f.invoke("printReady",{...input,jobId:id})).code,"DOCUMENT_PRINT_CANCELLED");
  assert.equal(state.confirmDialog.parent,state.parent); assert.equal(state.confirmDialog.options.defaultId,0); assert.equal(state.confirmDialog.options.cancelId,0);
  assert.equal(spools,0); assert.equal(f.db.prepare("SELECT state FROM document_output_jobs WHERE id=?").get(id).state,"awaiting-confirmation");
  state.confirm = async () => {state.locked=true;return 1;};
  assert.equal((await f.invoke("printReady",{...input,jobId:id})).code,"DOCUMENT_SESSION_LOCKED");
  assert.equal(spools,0); state.locked=false;
  state.confirm = async () => {enable(f.db,"b1",C.PRINTING,false);return 1;};
  assert.equal((await f.invoke("printReady",{...input,jobId:id})).code,"DOCUMENT_CAPABILITY_DISABLED");
  assert.equal(spools,0); enable(f.db,"b1",C.PRINTING,true);
  state.confirm = async () => 1;
  assert.equal((await f.invoke("printReady",{...input,jobId:id})).value,"accepted");
  assert.equal((await f.invoke("printReady",{...input,jobId:id})).value,null);
  assert.equal(spools,1); assert.deepEqual((await f.invoke("listReady",input)).value,[]);
  assert.equal((await f.invoke("previewReady",{...input,jobId:id})).ok,false); assert.throws(checks);
  state.locked=true; assert.equal((await f.invoke("listReady",input)).code,"DOCUMENT_SESSION_LOCKED");
});
test("actual IPC + real SQLite: authoritative empty read, save/read all modes and triggers, no jobs", t => {
  const f=fixture(t);
  assert.deepEqual(f.read().value.rules,[]);
  const syncBefore = f.db.prepare("SELECT COUNT(*) AS n FROM sync_outbox").get().n;
  for(const mode of ["OFF","ASK_CONFIRMATION","AUTOMATIC"]) {
    assert.equal(f.invoke("saveRule",rule({mode})).ok,true);
    assert.equal(f.read().value.rules[0].mode,mode);
  }
  assert.equal(f.invoke("saveRule",rule({trigger:"sale_completed"})).ok,true);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_output_jobs").get().n,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM sync_outbox").get().n,syncBefore);
  assert.equal(f.db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
});
test("owner, lock, untrusted URL, webview and subframe gates reject before domain access", t => {
  const f=fixture(t); const original=state.event;
  state.locked=true; assert.equal(f.read().code,"DOCUMENT_SESSION_LOCKED"); state.locked=false;
  for(const patch of [
    { senderFrame:{url:"https://evil.test"} },
    { sender:{...original.sender,getType:()=>"webview"} },
    { senderFrame:{url:"http://localhost:5173/"} },
    { senderFrame:null }
  ]) { state.event={...original,...patch}; assert.equal(f.read().code,"DOCUMENT_OWNER_REQUIRED"); }
  const badFrame={url:"https://evil.test"}; state.event={sender:{...original.sender,mainFrame:badFrame},senderFrame:badFrame};
  assert.equal(f.read().code,"DOCUMENT_OWNER_REQUIRED");
  const fileFrame={url:"file:///app/index.html"}; state.event={sender:{...original.sender,mainFrame:fileFrame},senderFrame:fileFrame};
  assert.equal(f.read().ok,true);
  assert.throws(()=>new DocumentOutputManagement(f.db,{role:"customer",assertAuthorized(){}}).read({documentKind:"sale_receipt"}),/DOCUMENT_OWNER_REQUIRED/);
});
test("tenant cannot be selected by renderer; other tenant rules never leak or mutate", t => {
  const f=fixture(t);
  f.db.prepare("INSERT INTO document_output_rules VALUES('b2','sale_receipt','manual','print','ASK_CONFIRMATION','native_print')").run();
  assert.deepEqual(f.read().value.rules,[]);
  for(const field of ["businessId","installationId","databasePath","sql","templateHtml","recipient"]) {
    assert.equal(f.invoke("saveRule",rule({[field]:"b2"})).code,"DOCUMENT_INPUT_INVALID");
    assert.equal(f.invoke("read",{documentKind:"sale_receipt",[field]:"b2"}).code,"DOCUMENT_INPUT_INVALID");
  }
  assert.equal(f.invoke("saveRule",rule()).ok,true);
  assert.equal(f.db.prepare("SELECT mode FROM document_output_rules WHERE business_id='b2'").get().mode,"ASK_CONFIRMATION");
  assert.equal(f.invoke("read").code,"DOCUMENT_INPUT_INVALID");
  assert.equal(f.invoke("read",{documentKind:"sale_receipt"},{}).code,"DOCUMENT_INPUT_INVALID");
});
test("persisted document/PRINTING revocation blocks read and write, independent of profile", t => {
  const f=fixture(t);
  for(const capability of [C.PRINTING,C.SALES]) {
    enable(f.db,"b1",capability,false);
    assert.equal(f.read().code,"DOCUMENT_CAPABILITY_DISABLED");
    assert.equal(f.invoke("saveRule",rule()).code,"DOCUMENT_CAPABILITY_DISABLED");
    enable(f.db,"b1",capability,true);
  }
  assert.equal(f.invoke("read",{documentKind:"product_label"}).code,"DOCUMENT_CAPABILITY_DISABLED");
  f.db.prepare("UPDATE business SET deleted_at='gone'").run();
  assert.equal(f.read().code,"DOCUMENT_TENANT_REQUIRED");
});
test("strict kind/trigger/mode/adapter whitelist; no email, fiscal invoice or WhatsApp auto", t => {
  const f=fixture(t);
  for(const patch of [{documentKind:"invoice_copy"},{documentKind:"unknown"},{trigger:"table_closed"},{trigger:"constructor"},{mode:"on"},{channel:"email",adapter:"smtp"},{adapter:"whatsapp_business_api",channel:"whatsapp"},{channel:"whatsapp",adapter:"whatsapp_webview"},{adapter:"__proto__"}]) assert.equal(f.invoke("saveRule",rule(patch)).ok,false);
  const whatsapp=rule({channel:"whatsapp",adapter:"whatsapp_webview",mode:"ASK_CONFIRMATION"});
  assert.equal(f.invoke("saveRule",whatsapp).ok,true);
  enable(f.db,"b1",C.WHATSAPP,false);
  assert.equal(f.read().value.whatsappEnabled,false);
  assert.equal(f.read().value.rules.length,0);
  assert.equal(f.invoke("saveRule",whatsapp).ok,false);
  enable(f.db,"b1",C.WHATSAPP,true);
  f.db.prepare("UPDATE settings SET whatsapp_mode='cloud' WHERE business_id='b1'").run();
  assert.equal(f.invoke("saveRule",whatsapp).ok,false);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_output_jobs").get().n,0);
});
test("actual preload: named non-commerce methods use unlock preflight; main rechecks TOCTOU", async t => {
  const f=fixture(t);
  assert.equal((await state.bridge.getDocumentOutputSettings({documentKind:"sale_receipt"})).ok,true);
  assert.deepEqual(state.calls,["appLock:getStatus","documentOutput:read"]);
  state.calls=[]; state.locked=true;
  await assert.rejects(state.bridge.saveDocumentOutputRule(rule()),/kilitli/);
  assert.deepEqual(state.calls,["appLock:getStatus"]);
  assert.equal(f.invoke("saveRule",rule()).code,"DOCUMENT_SESSION_LOCKED");
  state.locked=false; state.lockAfterPreflight=true;
  assert.equal((await state.bridge.saveDocumentOutputRule(rule())).code,"DOCUMENT_SESSION_LOCKED");
  state.locked=false; state.lockAfterPreflight=false;
  assert.equal((await state.bridge.saveDocumentOutputRule(rule())).ok,true);
});

test("all eligible document/event pairs persist independently; failed SQLite write rolls back safely", t => {
  const f=fixture(t);
  for(const capability of [C.FOOD_ORDERS,C.ACCOMMODATION_STAYS,C.CUSTOMER_CREDIT,C.ORDERS,C.RETAIL_LABELS]) enable(f.db,"b1",capability,true);
  for(const [documentKind,trigger] of [["sale_receipt","sale_completed"],["table_bill","table_closed"],["stay_statement","stay_checked_out"],["product_label","manual"],["credit_statement","customer_statement_requested"],["shipping_label","order_dispatched"],["shipping_label","shipment_created"],["kitchen_ticket","order_created"]]) {
    const value=rule({documentKind,trigger});
    assert.equal(f.invoke("saveRule",value).ok,true);
    assert.ok(f.invoke("read",{documentKind}).value.rules.some(row => row.trigger===trigger && row.mode==="AUTOMATIC"));
  }
  f.db.exec("CREATE TRIGGER fail_test_rule BEFORE UPDATE ON document_output_rules BEGIN SELECT RAISE(ABORT,'private database fault'); END");
  const result=f.invoke("saveRule",rule({trigger:"sale_completed",mode:"OFF"}));
  assert.equal(result.code,"DOCUMENT_SETTINGS_FAILED");
  assert.doesNotMatch(JSON.stringify(result),/private database fault/);
  assert.equal(f.read().value.rules[0].mode,"AUTOMATIC");
  f.db.exec("DROP TRIGGER fail_test_rule");
  assert.equal(f.invoke("saveRule",rule({trigger:"sale_completed",mode:"OFF"})).ok,true);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_output_jobs").get().n,0);
});

test("established trusted URL predicate distinguishes dev origin and packaged file frames", () => {
  const dev=createTrustedDesktopRendererUrlPredicate(true,"http://localhost:5173");
  const packaged=createTrustedDesktopRendererUrlPredicate(false);
  assert.equal(dev("http://localhost:5173/settings"),true);
  assert.equal(dev("http://localhost:5174/"),false);
  assert.equal(dev("https://evil.test/"),false);
  assert.equal(packaged("http://localhost:5173/"),false);
  assert.equal(packaged("file:///app/index.html"),true);
  assert.equal(packaged("invalid"),false);
});

const templateLayout = () => ({ unit: "mm10", pageWidth: 800, pageHeight: 1600,
  fields: [{binding:"business.name",x:10,y:20,width:600,height:50}],
  lineBlock: { y:200,rowHeight:50,maxRows:3,fields:[{binding:"line.description",x:0,y:0,width:600,height:50}] },
  scan: { originalImageRef:"original_1",processedImageRef:null,foreground:false } });
const templateInput = patch => ({ documentKind:"sale_receipt",expectedRevision:null,layout:templateLayout(),...patch });
test("template actual IPC/preload: first revision, reopen, immutable history, stale CAS, preserved line/scan, no jobs", async t => {
  const f=fixture(t);
  assert.deepEqual((await state.bridge.readDocumentOutputTemplate({documentKind:"sale_receipt"})).value,{documentKind:"sale_receipt",revision:null,layout:null});
  const first=await state.bridge.saveDocumentOutputTemplate(templateInput());
  assert.equal(first.value.revision,1);
  assert.ok(state.calls.includes("documentOutput:readTemplate"));
  assert.ok(state.calls.includes("documentOutput:saveTemplate"));
  const original=f.db.prepare("SELECT layout_json FROM document_print_templates WHERE business_id='b1' AND revision=1").get().layout_json;
  const second=templateLayout(); second.fields[0].x=30;
  assert.equal(f.invoke("saveTemplate",templateInput({expectedRevision:1,layout:second})).value.revision,2);
  assert.equal(f.invoke("readTemplate",{documentKind:"sale_receipt"}).value.layout.fields[0].x,30);
  assert.equal(f.invoke("saveTemplate",templateInput({expectedRevision:1})).code,"DOCUMENT_TEMPLATE_CONFLICT");
  assert.equal(f.invoke("saveTemplate",templateInput()).code,"DOCUMENT_TEMPLATE_CONFLICT");
  assert.equal(f.db.prepare("SELECT layout_json FROM document_print_templates WHERE business_id='b1' AND revision=1").get().layout_json,original);
  assert.throws(()=>f.db.exec("UPDATE document_print_templates SET layout_json='{}' WHERE revision=1"));
  assert.throws(()=>f.db.exec("DELETE FROM document_print_templates WHERE revision=1"));
  assert.deepEqual(f.invoke("readTemplate",{documentKind:"sale_receipt"}).value.layout.lineBlock,second.lineBlock);
  assert.deepEqual(f.invoke("readTemplate",{documentKind:"sale_receipt"}).value.layout.scan,second.scan);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_output_jobs").get().n,0);
});
test("template exact payloads, geometry, unknown bindings, UTF-8 bound and safe errors", t => {
  const f=fixture(t);
  for(const patch of [{businessId:"b2"},{databasePath:"secret"},{expectedRevision:0},{expectedRevision:1.1},{expectedRevision:"1"},{documentKind:"invoice_copy"},{layout:null}]) assert.equal(f.invoke("saveTemplate",templateInput(patch)).ok,false);
  for(const patch of [{x:-1},{x:790},{width:0},{height:0.1},{binding:"customer.secret"},{binding:"line.total"},{extra:"x"}]) {
    const layout=templateLayout(); Object.assign(layout.fields[0],patch);
    assert.equal(f.invoke("saveTemplate",templateInput({layout})).code,"DOCUMENT_TEMPLATE_INVALID");
  }
  for(const patch of [{pageWidth:100},{unit:"px"},{extra:"x"},{fields:Array.from({length:101},()=>templateLayout().fields[0])},{scan:{originalImageRef:"/private/path",processedImageRef:null,foreground:true}},{scan:{originalImageRef:"ş".repeat(20000),processedImageRef:null,foreground:false}}]) {
    assert.equal(f.invoke("saveTemplate",templateInput({layout:{...templateLayout(),...patch}})).code,"DOCUMENT_TEMPLATE_INVALID");
  }
  assert.equal(f.invoke("readTemplate",{documentKind:"sale_receipt",businessId:"b2"}).code,"DOCUMENT_INPUT_INVALID");
  assert.equal(f.invoke("saveTemplate",templateInput(),{}).code,"DOCUMENT_INPUT_INVALID");
  f.db.exec("CREATE TRIGGER fail_template_test BEFORE INSERT ON document_print_templates BEGIN SELECT RAISE(ABORT,'secret SQL data'); END");
  const failed=f.invoke("saveTemplate",templateInput());
  assert.equal(failed.code,"DOCUMENT_SETTINGS_FAILED"); assert.doesNotMatch(JSON.stringify(failed),/secret SQL/);
  f.db.exec("DROP TRIGGER fail_template_test");
  assert.equal(f.invoke("saveTemplate",templateInput()).value.revision,1);
});
test("template tenant isolation and fixed independent per-kind identity", t => {
  const f=fixture(t);
  f.db.prepare("INSERT INTO document_print_templates VALUES('b2','default:sale_receipt',1,'sale_receipt',?,'now')").run(JSON.stringify(templateLayout()));
  assert.equal(f.invoke("readTemplate",{documentKind:"sale_receipt"}).value.revision,null);
  assert.equal(f.invoke("saveTemplate",templateInput()).value.revision,1);
  enable(f.db,"b1",C.RETAIL_LABELS,true);
  assert.equal(f.invoke("saveTemplate",templateInput({documentKind:"product_label"})).value.revision,1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_print_templates WHERE business_id='b2'").get().n,1);
  assert.deepEqual(f.db.prepare("SELECT id FROM document_print_templates WHERE business_id='b1' ORDER BY id").all().map(row=>row.id),["default:product_label","default:sale_receipt"]);
});
test("template trusted owner, lock/preflight TOCTOU and persisted capability gates", async t => {
  const f=fixture(t); const read=()=>f.invoke("readTemplate",{documentKind:"sale_receipt"});
  const original=state.event;
  for(const patch of [{senderFrame:{url:"http://localhost:5173/"}},{sender:{...original.sender,getType:()=>"webview"}},{senderFrame:null}]) {
    state.event={...original,...patch}; assert.equal(read().code,"DOCUMENT_OWNER_REQUIRED"); assert.equal(f.invoke("saveTemplate",templateInput()).code,"DOCUMENT_OWNER_REQUIRED");
  }
  const frame={url:"https://evil.test"}; state.event={sender:{...original.sender,mainFrame:frame},senderFrame:frame};
  assert.equal(read().code,"DOCUMENT_OWNER_REQUIRED"); state.event=original;
  state.locked=true;
  await assert.rejects(state.bridge.readDocumentOutputTemplate({documentKind:"sale_receipt"}),/kilitli/);
  await assert.rejects(state.bridge.saveDocumentOutputTemplate(templateInput()),/kilitli/);
  assert.equal(f.invoke("saveTemplate",templateInput()).code,"DOCUMENT_SESSION_LOCKED");
  state.locked=false; state.lockAfterPreflight=true;
  assert.equal((await state.bridge.saveDocumentOutputTemplate(templateInput())).code,"DOCUMENT_SESSION_LOCKED");
  state.lockAfterPreflight=false;state.locked=false;
  for(const capability of [C.PRINTING,C.SALES]) {
    enable(f.db,"b1",capability,false);
    assert.equal(read().code,"DOCUMENT_CAPABILITY_DISABLED"); assert.equal(f.invoke("saveTemplate",templateInput()).code,"DOCUMENT_CAPABILITY_DISABLED");
    enable(f.db,"b1",capability,true);
  }
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_print_templates").get().n,0);
});
test("template concurrent native IPC writers: exactly one next revision wins", async t => {
  const { spawn } = await import("node:child_process");
  const f=fixture(t);
  const path=f.db.prepare("PRAGMA database_list").get().file;
  const worker=join(root,"template-race.cjs");
  writeFileSync(worker, `const {state}=require('./node_modules/electron');
const {registerDocumentOutputIpcHandlers}=require('./apps/desktop-app/electron/ipc/document-output-ipc');
const frame={url:'file:///app/index.html'};state.event={sender:{getType:()=> 'window',mainFrame:frame},senderFrame:frame};
registerDocumentOutputIpcHandlers({databasePath:()=>process.argv[2],assertUnlocked(){},isTrustedRendererUrl:()=>true});
process.send('ready');process.on('message', input=>{process.send(state.handlers.get('documentOutput:saveTemplate')(state.event,input));process.disconnect();});`);
  const launch=()=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[worker,path],{stdio:["ignore","ignore","pipe","ipc"]});
    child.once("error",reject); child.once("message",()=>resolve(child));
  });
  for(const expectedRevision of [null,1]) {
    const children=await Promise.all([launch(),launch()]);
    const results=await Promise.all(children.map(child=>new Promise((resolve,reject)=>{ child.once("message",resolve);child.once("error",reject);child.send(templateInput({expectedRevision})); })));
    assert.equal(results.filter(result=>result.ok).length,1);
    assert.equal(results.filter(result=>result.code==="DOCUMENT_TEMPLATE_CONFLICT").length,1);
  }
  assert.equal(f.invoke("readTemplate",{documentKind:"sale_receipt"}).value.revision,2);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_print_templates").get().n,2);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_output_jobs").get().n,0);
});
test("template stored JSON and document identity are verified before read or append", t => {
  const f=fixture(t);
  assert.equal(f.invoke("saveTemplate",templateInput()).ok,true);
  // Corruption fixture only: remove the immutable update protection in this disposable DB.
  f.db.exec("DROP TRIGGER document_template_immutable; PRAGMA ignore_check_constraints=ON");
  const change=f.db.prepare("UPDATE document_print_templates SET layout_json=?,document_kind=? WHERE business_id='b1'");
  for(const [json,kind] of [["{","sale_receipt"],[JSON.stringify({...templateLayout(),pageWidth:0}),"sale_receipt"],[JSON.stringify(templateLayout()),"product_label"]]) {
    change.run(json,kind);
    assert.equal(f.invoke("readTemplate",{documentKind:"sale_receipt"}).code,"DOCUMENT_TEMPLATE_INVALID");
    assert.equal(f.invoke("saveTemplate",templateInput({expectedRevision:1})).code,"DOCUMENT_TEMPLATE_INVALID");
  }
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_print_templates").get().n,1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_output_jobs").get().n,0);
});

const printerInput = patch => ({ documentKind: "sale_receipt", printerRef: "Printer A", ...patch });
test("printer actual preload/native enumeration: sanitized allowlist, save/reopen/change/clear, independent kinds and no jobs", async t => {
  const f=fixture(t);
  state.printers.push({name:"Printer B",secret:"not returned"},{name:"Printer A"},{name:""},{name:"x".repeat(257)},{name:"ş".repeat(129)},{name:"bad\0name"},null,{name:42});
  const result=await state.bridge.getDocumentPrinters({documentKind:"sale_receipt"});
  assert.deepEqual(result.value.printers,[{name:"Printer A",displayName:"Desk printer",isDefault:true},{name:"Printer B"}]);
  assert.equal(result.value.printerRef,null);
  assert.equal((await state.bridge.savePrinterBinding(printerInput())).ok,true);
  assert.equal((await state.bridge.readPrinterBinding({documentKind:"sale_receipt"})).value.printerRef,"Printer A");
  assert.equal((await f.invoke("savePrinterBinding",printerInput({printerRef:"Printer B"}))).ok,true);
  enable(f.db,"b1",C.RETAIL_LABELS,true);
  assert.equal((await f.invoke("savePrinterBinding",printerInput({documentKind:"product_label"}))).ok,true);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_printer_bindings").get().n,2);
  assert.equal((await f.invoke("savePrinterBinding",printerInput({printerRef:null}))).value.printerRef,null);
  assert.equal(f.db.prepare("SELECT id FROM document_printer_bindings").get().id,"product_label");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_output_jobs").get().n,0);
  assert.ok(state.calls.includes("documentOutput:getPrinters"));
  assert.ok(state.calls.includes("documentOutput:readPrinterBinding"));
  assert.ok(state.calls.includes("documentOutput:savePrinterBinding"));
});
test("native installation UUID exclusive file: persistent, separate userData identities, malformed file fails closed", () => {
  const {getDocumentPrinterInstallationId}=require(join(root,"apps/desktop-app/electron/document-printer-installation.js"));
  const a=mkdtempSync(join(root,"user-a-")),b=mkdtempSync(join(root,"user-b-"));
  const id=getDocumentPrinterInstallationId(a);
  assert.match(id,/^[0-9a-f-]{36}$/);
  assert.equal(getDocumentPrinterInstallationId(a),id);
  assert.notEqual(getDocumentPrinterInstallationId(b),id);
  writeFileSync(join(a,"document-printer-installation-id"),"invalid");
  assert.throws(()=>getDocumentPrinterInstallationId(a),/DOCUMENT_INSTALLATION_INVALID/);
});
test("printer binding isolated by trusted installation, business and document; rejects renderer identity and bogus names", async t => {
  const f=fixture(t);
  f.db.prepare("INSERT INTO document_printer_bindings VALUES('b2','device-a','sale_receipt','Other tenant')").run();
  assert.equal((await f.invoke("savePrinterBinding",printerInput())).ok,true);
  state.installation="device-b";
  assert.equal((await f.invoke("readPrinterBinding",{documentKind:"sale_receipt"})).value.printerRef,null);
  assert.equal((await f.invoke("savePrinterBinding",printerInput())).ok,true);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_printer_bindings").get().n,3);
  for(const field of ["businessId","business_id","installationId","installation_id","databasePath","printers"]) {
    assert.equal((await f.invoke("savePrinterBinding",printerInput({[field]:"b2"}))).code,"DOCUMENT_INPUT_INVALID");
    assert.equal((await f.invoke("getPrinters",{documentKind:"sale_receipt",[field]:"b2"})).code,"DOCUMENT_INPUT_INVALID");
  }
  for(const printerRef of ["unknown","",42," Printer A","x".repeat(257),"ş".repeat(129),"bad\0name"]) assert.equal((await f.invoke("savePrinterBinding",printerInput({printerRef}))).code,"DOCUMENT_PRINTER_INVALID");
  assert.equal(f.db.prepare("SELECT printer_ref FROM document_printer_bindings WHERE business_id='b2'").get().printer_ref,"Other tenant");
  assert.equal((await f.invoke("savePrinterBinding",printerInput({documentKind:"invoice_copy"}))).ok,false);
});
test("printer removed/offline retained without reassignment; save re-enumerates current list; discovery failure preserves binding", async t => {
  const f=fixture(t);
  assert.equal((await f.invoke("savePrinterBinding",printerInput())).ok,true);
  state.printers=[];
  const result=await f.invoke("getPrinters",{documentKind:"sale_receipt"});
  assert.equal(result.value.missing,true);assert.equal(result.value.printerRef,"Printer A");assert.deepEqual(result.value.printers,[]);
  assert.equal((await f.invoke("savePrinterBinding",printerInput())).code,"DOCUMENT_PRINTER_INVALID");
  state.event.sender.getPrintersAsync=async()=>{throw Error("private spooler error");};
  const failed=await f.invoke("savePrinterBinding",printerInput({printerRef:null}));
  assert.equal(failed.code,"DOCUMENT_SETTINGS_FAILED");assert.doesNotMatch(JSON.stringify(failed),/private spooler/);
  assert.equal(f.db.prepare("SELECT printer_ref FROM document_printer_bindings").get().printer_ref,"Printer A");
  state.event.sender.getPrintersAsync=async()=>[];
  assert.equal((await f.invoke("savePrinterBinding",printerInput({printerRef:null}))).ok,true);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_printer_bindings").get().n,0);
});
test("printer sender, lock, capabilities and delayed discovery TOCTOU independently deny native writes", async t => {
  const f=fixture(t), original=state.event;
  for(const patch of [{senderFrame:null},{senderFrame:{url:"http://localhost:5173/"}},{sender:{...original.sender,getType:()=>"webview"}}]) {
    state.event={...original,...patch};assert.equal((await f.invoke("savePrinterBinding",printerInput())).code,"DOCUMENT_OWNER_REQUIRED");
  }
  state.event=original;state.locked=true;
  assert.equal((await f.invoke("getPrinters",{documentKind:"sale_receipt"})).code,"DOCUMENT_SESSION_LOCKED");
  await assert.rejects(state.bridge.savePrinterBinding(printerInput()),/kilitli/);
  assert.equal(state.enumerations,0);state.locked=false;
  for(const capability of [C.PRINTING,C.SALES]) {
    enable(f.db,"b1",capability,false);
    assert.equal((await f.invoke("savePrinterBinding",printerInput())).code,"DOCUMENT_CAPABILITY_DISABLED");
    enable(f.db,"b1",capability,true);
  }
  for(const change of [()=>{state.locked=true;},()=>enable(f.db,"b1",C.PRINTING,false),()=>f.db.exec("UPDATE business SET deleted_at='gone' WHERE id='b1'")]) {
    let release; state.event.sender.getPrintersAsync=()=>new Promise(resolve=>{release=resolve;});
    const pending=f.invoke("savePrinterBinding",printerInput()); change(); release([{name:"Printer A"}]);
    assert.equal((await pending).ok,false);
    state.locked=false;enable(f.db,"b1",C.PRINTING,true);
  }
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_printer_bindings").get().n,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_output_jobs").get().n,0);
});

test("printer database failure rolls back replacement and preserves unrelated rules/templates and sync", async t => {
  const f=fixture(t);
  assert.equal((await f.invoke("savePrinterBinding",printerInput())).ok,true);
  const syncBefore=f.db.prepare("SELECT COUNT(*) AS n FROM sync_outbox").get().n;
  state.printers.push({name:"Printer B"});
  f.db.exec("CREATE TRIGGER fail_binding_test BEFORE INSERT ON document_printer_bindings BEGIN SELECT RAISE(ABORT,'private binding SQL'); END");
  const result=await f.invoke("savePrinterBinding",printerInput({printerRef:"Printer B"}));
  assert.equal(result.code,"DOCUMENT_SETTINGS_FAILED");assert.doesNotMatch(JSON.stringify(result),/private binding SQL/);
  assert.equal(f.db.prepare("SELECT printer_ref FROM document_printer_bindings").get().printer_ref,"Printer A");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_output_jobs").get().n,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM sync_outbox").get().n,syncBefore);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_output_rules").get().n,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_print_templates").get().n,0);
  f.db.exec("DROP TRIGGER fail_binding_test");
  assert.equal((await f.invoke("savePrinterBinding",printerInput({printerRef:"Printer B"}))).ok,true);
  assert.equal(f.db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
});
test("printer exact native Unicode bounds and trust/preload TOCTOU guard every bridge method", async t => {
  const f=fixture(t),original=state.event;
  for(const name of ["x".repeat(256),"ş".repeat(128)]) {
    state.printers=[{name,displayName:42,isDefault:"fake",options:{credential:"private"}}];
    assert.deepEqual((await f.invoke("getPrinters",{documentKind:"sale_receipt"})).value.printers,[{name}]);
    assert.equal((await f.invoke("savePrinterBinding",printerInput({printerRef:name}))).ok,true);
  }
  const frame={url:"https://untrusted.test"};state.event={sender:{...original.sender,mainFrame:frame},senderFrame:frame};
  for(const channel of ["getPrinters","readPrinterBinding","savePrinterBinding"]) assert.equal((await f.invoke(channel,channel==="savePrinterBinding"?printerInput():{documentKind:"sale_receipt"})).code,"DOCUMENT_OWNER_REQUIRED");
  state.event=original;
  for(const method of ["getDocumentPrinters","readPrinterBinding","savePrinterBinding"]) {
    state.locked=false;state.lockAfterPreflight=true;
    assert.equal((await state.bridge[method](method==="savePrinterBinding"?printerInput():{documentKind:"sale_receipt"})).code,"DOCUMENT_SESSION_LOCKED");
  }
  assert.equal((await f.invoke("getPrinters",{documentKind:"sale_receipt"},{})).ok,false);
});

test("explicit native offline signals are unavailable and retained bindings are missing, never reassigned", async t => {
  const f=fixture(t);
  assert.equal((await f.invoke("savePrinterBinding",printerInput())).ok,true);
  state.printers=[{name:"Printer A",options:{"printer-state-reasons":"offline-report,other"}},{name:"Printer B"}];
  const result=await f.invoke("getPrinters",{documentKind:"sale_receipt"});
  assert.deepEqual(result.value.printers,[{name:"Printer B"}]);
  assert.equal(result.value.printerRef,"Printer A");assert.equal(result.value.missing,true);
  assert.equal((await f.invoke("savePrinterBinding",printerInput())).code,"DOCUMENT_PRINTER_INVALID");
  assert.deepEqual(sanitizeDocumentPrinters([{name:"offline",status:0x80},{name:"online",status:0},{name:"offline-plus",status:0x82}],"win32"),[{name:"online"}]);
  assert.deepEqual(sanitizeDocumentPrinters([{name:"unknown-status",status:0x80}],"linux"),[{name:"unknown-status"}]);
});

// A real 1x1 PNG; the injected decoder verifies fixture bytes and returns a fixed PNG.
const smallPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC", "base64");
const imageInput = patch => ({ documentKind:"sale_receipt", ...patch });
function chooseFixture(f, bytes=smallPng) {
  const source=join(f.imageRoot,`source-${crypto.randomUUID()}`);
  writeFileSync(source,bytes);state.chooseImage=async()=>source;return source;
}
test("form image actual bridge: cancel has no mutation; immutable IDs, fixed PNG, draft read before explicit revision save", async t => {
  const f=fixture(t), syncBefore=f.db.prepare("SELECT COUNT(*) AS n FROM sync_outbox").get().n;
  assert.deepEqual(await state.bridge.pickFormImage(imageInput()),{ok:true,value:null});
  assert.deepEqual(readdirSync(f.imageRoot),[]);
  const source=chooseFixture(f);
  const a=await state.bridge.pickFormImage(imageInput());assert.equal(a.ok,true);
  const b=await state.bridge.pickFormImage(imageInput());assert.equal(b.ok,true);
  assert.notEqual(a.value.imageRef,b.value.imageRef);
  assert.deepEqual(Buffer.from(a.value.dataUrl.split(",")[1],"base64"),smallPng);
  writeFileSync(source,"changed source");
  assert.deepEqual(await state.bridge.readFormImage(imageInput({imageRef:a.value.imageRef})),a);
  assert.doesNotMatch(JSON.stringify(a),/source-|doc-form-images|businessId/);
  const {createHash}=await import("node:crypto");
  const file=join(f.imageRoot,"doc-form-images",createHash("sha256").update("b1").digest("hex"),"sale_receipt",`${a.value.imageRef}.png`);
  assert.equal(statSync(file).mode & 0o777,0o600);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_print_templates").get().n,0);
  const layout={...templateLayout(),scan:{originalImageRef:a.value.imageRef,processedImageRef:null,foreground:false}};
  assert.equal(f.invoke("saveTemplate",templateInput({layout})).ok,true);
  assert.deepEqual(f.invoke("readTemplate",imageInput()).value.layout.scan,layout.scan);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_output_jobs").get().n,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM sync_outbox").get().n,syncBefore);
});
test("form image exact input, opaque ID and business/document isolation including unsaved originals", async t => {
  const f=fixture(t);chooseFixture(f);
  const a=(await f.invoke("pickFormImage",imageInput())).value;
  enable(f.db,"b1",C.RETAIL_LABELS,true);
  assert.equal((await f.invoke("readFormImage",{documentKind:"product_label",imageRef:a.imageRef})).ok,false);
  for(const imageRef of ["../x","/tmp/x","https://x",42,"a".repeat(129)]) assert.equal((await f.invoke("readFormImage",imageInput({imageRef}))).ok,false);
  for(const field of ["businessId","filePath","path","installationId"]) {
    assert.equal((await f.invoke("pickFormImage",imageInput({[field]:"b2"}))).code,"DOCUMENT_INPUT_INVALID");
    assert.equal((await f.invoke("readFormImage",imageInput({imageRef:a.imageRef,[field]:"b2"}))).code,"DOCUMENT_INPUT_INVALID");
  }
  assert.equal((await f.invoke("pickFormImage",imageInput(),{})).ok,false);
  assert.equal((await f.invoke("pickFormImage",{documentKind:"invoice_copy"})).ok,false);
  f.db.exec("UPDATE business SET deleted_at='gone' WHERE id='b1'");
  assert.equal((await f.invoke("readFormImage",imageInput({imageRef:a.imageRef}))).ok,false);
});
test("form image real signature, source/output bounds, decoded dimensions and malformed input fail before asset creation", async t => {
  const f=fixture(t);
  const huge=Buffer.from(smallPng);huge.writeUInt32BE(5001,16);huge.writeUInt32BE(5000,20);
  for(const bytes of [Buffer.from("<svg/>"),Buffer.from([255,216,255,192]),Buffer.alloc(12*1024*1024+1),huge,smallPng.subarray(0,30),Buffer.concat([smallPng,Buffer.from("bad")])]) {
    chooseFixture(f,bytes);assert.equal((await f.invoke("pickFormImage",imageInput())).ok,false);
  }
  chooseFixture(f);
  for(const decoded of [{width:5001,height:5000,png:smallPng},{width:1,height:1,png:Buffer.alloc(12*1024*1024+1)},{width:1,height:1,png:Buffer.from("invalid")},{width:2,height:1,png:smallPng}]) {
    state.decodeImage=()=>decoded;assert.equal((await f.invoke("pickFormImage",imageInput())).ok,false);
  }
  assert.ok(!readdirSync(f.imageRoot).includes("doc-form-images"));
});
test("form image sender/lock/capability gates and chooser TOCTOU reject pick and read", async t => {
  const f=fixture(t);chooseFixture(f);
  const a=(await f.invoke("pickFormImage",imageInput())).value;
  const original=state.event;
  for(const patch of [{senderFrame:null},{senderFrame:{url:"http://localhost:5173/"}},{sender:{...original.sender,getType:()=>"webview"}}]) {
    state.event={...original,...patch};
    assert.equal((await f.invoke("pickFormImage",imageInput())).code,"DOCUMENT_OWNER_REQUIRED");
    assert.equal((await f.invoke("readFormImage",imageInput({imageRef:a.imageRef}))).code,"DOCUMENT_OWNER_REQUIRED");
  }
  state.event=original;state.locked=true;
  await assert.rejects(state.bridge.pickFormImage(imageInput()),/kilitli/);
  await assert.rejects(state.bridge.readFormImage(imageInput({imageRef:a.imageRef})),/kilitli/);
  assert.equal((await f.invoke("pickFormImage",imageInput())).code,"DOCUMENT_SESSION_LOCKED");state.locked=false;
  for(const capability of [C.PRINTING,C.SALES]) {
    enable(f.db,"b1",capability,false);
    assert.equal((await f.invoke("readFormImage",imageInput({imageRef:a.imageRef}))).code,"DOCUMENT_CAPABILITY_DISABLED");
    assert.equal((await f.invoke("pickFormImage",imageInput())).code,"DOCUMENT_CAPABILITY_DISABLED");
    enable(f.db,"b1",capability,true);
  }
  for(const change of [()=>{state.locked=true;},()=>enable(f.db,"b1",C.PRINTING,false),()=>f.db.exec("UPDATE business SET deleted_at='gone' WHERE id='b1'")]) {
    const source=chooseFixture(f);let release;
    state.chooseImage=()=>new Promise(resolve=>{release=resolve;});
    const pending=f.invoke("pickFormImage",imageInput());change();release(source);
    assert.equal((await pending).ok,false);state.locked=false;enable(f.db,"b1",C.PRINTING,true);
  }
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_print_templates").get().n,0);
});

test("form image production native picker/decoder wiring uses trusted parent, userData and JPG/PNG-only single file choice", async t => {
  const f=fixture(t,true);
  assert.deepEqual(await f.invoke("pickFormImage",imageInput()),{ok:true,value:null});
  assert.equal(state.dialog.parent,state.parent);
  assert.deepEqual(state.dialog.options.properties,["openFile"]);
  assert.deepEqual(state.dialog.options.filters,[{name:"JPG / PNG",extensions:["jpg","jpeg","png"]}]);
  chooseFixture(f);
  const result=await f.invoke("pickFormImage",imageInput());assert.equal(result.ok,true);
  assert.deepEqual(await f.invoke("readFormImage",imageInput({imageRef:result.value.imageRef})),result);
  // Decoder output, rather than source metadata/trailing bytes, is stored.
  const source=chooseFixture(f,Buffer.concat([smallPng,Buffer.from("source-metadata")]));
  state.decodeImage=()=>({width:1,height:1,png:smallPng});
  const normalized=await f.invoke("pickFormImage",imageInput());assert.equal(normalized.ok,true);
  assert.deepEqual(Buffer.from(normalized.value.dataUrl.split(",")[1],"base64"),smallPng);
  assert.notDeepEqual(readFileSync(source),smallPng);
});

test("processed derivative actual preload + SQLite: new immutable refs on retry, sanitized PNG, original preserved, explicit revision only", async t => {
  const f=fixture(t,true);chooseFixture(f);
  const original=await state.bridge.pickFormImage(imageInput());assert.equal(original.ok,true);
  const syncBefore=f.db.prepare("SELECT COUNT(*) AS n FROM sync_outbox").get().n;
  const input=imageInput({originalImageRef:original.value.imageRef,pngBase64:smallPng.toString("base64")});
  const a=await state.bridge.saveProcessedFormImage(input),b=await state.bridge.saveProcessedFormImage(input);
  assert.equal(a.ok,true);assert.equal(b.ok,true);
  assert.notEqual(a.value.imageRef,b.value.imageRef);assert.notEqual(a.value.imageRef,original.value.imageRef);
  assert.deepEqual(await state.bridge.readFormImage(imageInput({imageRef:original.value.imageRef})),original);
  assert.deepEqual(await state.bridge.readFormImage(imageInput({imageRef:a.value.imageRef})),a);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_print_templates").get().n,0);
  const layout={...templateLayout(),scan:{originalImageRef:original.value.imageRef,processedImageRef:a.value.imageRef,foreground:false}};
  assert.equal(f.invoke("saveTemplate",templateInput({layout})).ok,true);
  assert.deepEqual(f.invoke("readTemplate",imageInput()).value.layout.scan,layout.scan);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_print_templates").get().n,1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_output_jobs").get().n,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM sync_outbox").get().n,syncBefore);
  const extra=Buffer.concat([smallPng,Buffer.from("foreign metadata")]);
  state.decodeImage=bytes=>{assert.deepEqual(bytes,extra);return {width:1,height:1,png:smallPng};};
  const clean=await f.invoke("saveProcessedFormImage",{...input,pngBase64:extra.toString("base64")});
  assert.equal(clean.ok,true);assert.deepEqual(Buffer.from(clean.value.dataUrl.split(",")[1],"base64"),smallPng);
});
test("processed exact payload, strict bounded PNG and native normalization fail closed without writes", async t => {
  const f=fixture(t);chooseFixture(f);
  const original=(await f.invoke("pickFormImage",imageInput())).value;
  const input=imageInput({originalImageRef:original.imageRef,pngBase64:smallPng.toString("base64")});
  const {createHash}=await import("node:crypto");
  const folder=join(f.imageRoot,"doc-form-images",createHash("sha256").update("b1").digest("hex"),"sale_receipt");
  for(const field of ["businessId","path","imageRef","bytes","documentPath"]) assert.equal((await f.invoke("saveProcessedFormImage",{...input,[field]:"foreign"})).code,"DOCUMENT_INPUT_INVALID");
  for(const pngBase64 of [null,42,"",input.pngBase64+"\n","data:image/png;base64,"+input.pngBase64,"!!!!",Buffer.from("<svg/>").toString("base64"),"A".repeat(4*Math.ceil(12*1024*1024/3)+4)]) assert.equal((await f.invoke("saveProcessedFormImage",{...input,pngBase64})).code,"DOCUMENT_IMAGE_INVALID");
  let decoded=0;state.decodeImage=()=>{decoded++;throw Error("private decoder detail");};
  const bomb=Buffer.from(smallPng);bomb.writeUInt32BE(25_000_001,16);
  assert.equal((await f.invoke("saveProcessedFormImage",{...input,pngBase64:bomb.toString("base64")})).code,"DOCUMENT_IMAGE_INVALID");assert.equal(decoded,0);
  const failure=await f.invoke("saveProcessedFormImage",input);assert.equal(failure.ok,false);assert.doesNotMatch(JSON.stringify(failure),/private decoder/);
  for(const output of [{width:5001,height:5000,png:smallPng},{width:2,height:1,png:smallPng},{width:1,height:1,png:Buffer.alloc(12*1024*1024+1)},{width:1,height:1,png:Buffer.from("bad")}]) {
    state.decodeImage=()=>output;assert.equal((await f.invoke("saveProcessedFormImage",input)).code,"DOCUMENT_IMAGE_INVALID");
  }
  assert.deepEqual(readdirSync(folder),[`${original.imageRef}.png`]);
  assert.equal((await f.invoke("saveProcessedFormImage",input,{})).code,"DOCUMENT_INPUT_INVALID");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_output_jobs").get().n,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_print_templates").get().n,0);
});
test("processed original ownership, kind, sender, lock and persisted capabilities guard before decoding", async t => {
  const f=fixture(t);chooseFixture(f);
  const original=(await f.invoke("pickFormImage",imageInput())).value;
  const input=imageInput({originalImageRef:original.imageRef,pngBase64:smallPng.toString("base64")});
  let decoded=0;state.decodeImage=()=>{decoded++;return {width:1,height:1,png:smallPng};};
  for(const originalImageRef of ["../x","/tmp/x",null,crypto.randomUUID()]) assert.equal((await f.invoke("saveProcessedFormImage",{...input,originalImageRef})).ok,false);
  enable(f.db,"b1",C.RETAIL_LABELS,true);
  assert.equal((await f.invoke("saveProcessedFormImage",{...input,documentKind:"product_label"})).ok,false);
  const event=state.event;
  for(const patch of [{senderFrame:null},{senderFrame:{url:"https://evil.test"}},{sender:{...event.sender,getType:()=>"webview"}}]) {
    state.event={...event,...patch};assert.equal((await f.invoke("saveProcessedFormImage",input)).code,"DOCUMENT_OWNER_REQUIRED");
  }
  state.event=event;state.locked=true;
  await assert.rejects(state.bridge.saveProcessedFormImage(input),/kilitli/);
  assert.equal((await f.invoke("saveProcessedFormImage",input)).code,"DOCUMENT_SESSION_LOCKED");
  state.locked=false;state.lockAfterPreflight=true;
  assert.equal((await state.bridge.saveProcessedFormImage(input)).code,"DOCUMENT_SESSION_LOCKED");state.locked=false;state.lockAfterPreflight=false;
  for(const capability of [C.PRINTING,C.SALES]) {
    enable(f.db,"b1",capability,false);assert.equal((await f.invoke("saveProcessedFormImage",input)).code,"DOCUMENT_CAPABILITY_DISABLED");enable(f.db,"b1",capability,true);
  }
  f.db.exec("UPDATE business SET deleted_at='gone' WHERE id='b1'");
  assert.equal((await f.invoke("saveProcessedFormImage",input)).ok,false);assert.equal(decoded,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_output_jobs").get().n,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM document_print_templates").get().n,0);
});
