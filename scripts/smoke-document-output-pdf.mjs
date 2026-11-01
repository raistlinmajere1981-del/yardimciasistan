import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import ts from "typescript";

const root = mkdtempSync("/tmp/opencode/document-pdf-");
const require = createRequire(import.meta.url);
try {
  for (const file of ["packages/shared/types/business-capabilities.ts", "packages/shared/types/document-output.ts", "apps/desktop-app/electron/document-output-store.ts", "apps/desktop-app/electron/document-output-render-snapshot.ts", "apps/desktop-app/electron/document-output-snapshot-store.ts", "apps/desktop-app/electron/document-output-html.ts", "apps/desktop-app/electron/document-output-pdf.ts", "apps/desktop-app/electron/document-output-preview.ts"]) {
    const target = join(root, file.replace(/\.ts$/, ".js"));
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
  }
  mkdirSync(join(root, "node_modules/@yardimci-asistan/shared"), { recursive: true });
  writeFileSync(join(root, "node_modules/@yardimci-asistan/shared/index.js"), 'module.exports = {...require("../../../packages/shared/types/document-output.js"), ...require("../../../packages/shared/types/business-capabilities.js")};');
  const entry = join(root, "entry.cjs"), pdf = join(root, "out.pdf");
  writeFileSync(entry, `
const {app,nativeImage,BrowserWindow}=require('electron');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const store=require('./apps/desktop-app/electron/document-output-store.js');
const snapshots=require('./apps/desktop-app/electron/document-output-snapshot-store.js');
const {renderDocumentPdf}=require('./apps/desktop-app/electron/document-output-pdf.js');
const {previewReadyDocument}=require('./apps/desktop-app/electron/document-output-preview.js');
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const db=new DatabaseSync(':memory:'); db.exec(fs.readFileSync(${JSON.stringify(resolve("apps/desktop-app/db/schema.sql"))},'utf8'));
 db.prepare("INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES('b','b','b','market','now','now')").run();
 for(const cap of ['document.printing','commerce.sales']) db.prepare("INSERT INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at) VALUES('b',?,1,'now','now')").run(cap);
 db.prepare("INSERT INTO document_printer_bindings VALUES('b','i','p','printer')").run();
 const field=(binding,x,y,width,height)=>({binding,x,y,width,height});
 const layout={unit:'mm10',pageWidth:800,pageHeight:2000,fields:[field('business.name',20,20,700,150)],lineBlock:{y:200,rowHeight:100,maxRows:2,fields:[field('line.description',20,0,700,100)]},scan:null};
 store.createDocumentTemplate(db,'b','t',1,'sale_receipt',layout);
 store.saveDocumentOutputRule(db,{businessId:'b',documentKind:'sale_receipt',trigger:'sale_completed',channel:'print',mode:'AUTOMATIC',adapter:'native_print'});
 const id=store.createDocumentOutputJob(db,{businessId:'b',installationId:'i',sourceId:'s',operationId:'o',commandKind:'event',documentKind:'sale_receipt',trigger:'sale_completed',channel:'print',templateId:'t',templateRevision:1,copies:1,printerBindingId:'p'});
 const scope={businessId:'b',installationId:'i',jobId:id};
 snapshots.captureDocumentRenderSnapshot(db,scope,{'business.name':'İzmir Çeşme\\nDeneme <script>'},[{'line.description':'Ürün bir'},{'line.description':'İkinci satır'}]);
  const pdf=await renderDocumentPdf(db,scope); fs.writeFileSync(${JSON.stringify(pdf)},pdf);
  const parent=new BrowserWindow({show:false}); let authorized=true;
  await previewReadyDocument(db,scope,parent,()=>{if(!authorized) throw Error('locked');});
  const preview=BrowserWindow.getAllWindows().find(w=>w!==parent);
  if(!preview || preview.getParentWindow()!==parent || !preview.isVisible()) throw Error('preview window missing');
  const prefs=preview.webContents.getLastWebPreferences();
  if(prefs.javascript!==false || prefs.nodeIntegration!==false || prefs.sandbox!==true || prefs.contextIsolation!==true) throw Error('unsafe preview '+JSON.stringify(prefs));
  preview.webContents.openDevTools(); if(preview.webContents.isDevToolsOpened()) throw Error('devtools enabled');
  authorized=false; await new Promise(resolve=>setTimeout(resolve,750));
  if(!preview.isDestroyed()) throw Error('locked preview survived');
  authorized=true; await previewReadyDocument(db,scope,parent,()=>{if(!authorized) throw Error('locked');});
  const child=BrowserWindow.getAllWindows().find(w=>w!==parent); parent.destroy();
  if(!child.isDestroyed()) throw Error('parent preview survived');
 const png=nativeImage.createFromBitmap(Buffer.from([0,0,255,255]),{width:1,height:1}).toPNG();
 const imageLayout={...layout,scan:{originalImageRef:'orig',processedImageRef:'proc',foreground:false}};
 store.createDocumentTemplate(db,'b','image',1,'sale_receipt',imageLayout);
 const imageId=store.createDocumentOutputJob(db,{businessId:'b',installationId:'i',sourceId:'image',operationId:'image',commandKind:'event',documentKind:'sale_receipt',trigger:'sale_completed',channel:'print',templateId:'image',templateRevision:1,copies:1,printerBindingId:'p'});
 const imageScope={...scope,jobId:imageId}; snapshots.captureDocumentRenderSnapshot(db,imageScope,{'business.name':'Görsel'},[]);
 try {await renderDocumentPdf(db,imageScope); throw Error('missing images accepted');} catch(e) {if(!String(e).includes('DOCUMENT_SNAPSHOT_IMAGES_INVALID')) throw e;}
 snapshots.captureDocumentSnapshotImages(db,imageScope,{readBytes:()=>png});
 fs.writeFileSync(${JSON.stringify(join(root, "image.pdf"))},await renderDocumentPdf(db,imageScope));
 db.exec('DROP TRIGGER document_snapshot_image_no_update'); db.prepare("UPDATE document_output_snapshot_images SET bytes=? WHERE role='original'").run(Buffer.alloc(40));
 try {await renderDocumentPdf(db,imageScope); throw Error('tampered image accepted');} catch(e) {if(!String(e).includes('DOCUMENT_SNAPSHOT_IMAGES_INVALID')) throw e;}
 try {await renderDocumentPdf(db,{...scope,installationId:'wrong'}); throw Error('scope accepted');} catch(e) {if(!String(e).includes('DOCUMENT_SNAPSHOT_UNAVAILABLE')) throw e;}
 db.close(); app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
`);
  const run = spawnSync(require("electron"), ["--no-sandbox", entry], { encoding: "utf8", timeout: 45000, env: { ...process.env, ELECTRON_RUN_AS_NODE: "" } });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.equal(readFileSync(pdf).subarray(0, 5).toString(), "%PDF-");
  const text = spawnSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8" });
  assert.equal(text.status, 0); assert.match(text.stdout, /İzmir Çeşme/); assert.match(text.stdout, /Deneme <script>/); assert.match(text.stdout, /Ürün bir/); assert.match(text.stdout, /İkinci satır/); assert.match(text.stdout, /MALİ BELGE DEĞİLDİR/);
  const info = spawnSync("pdfinfo", [pdf], { encoding: "utf8" });
  assert.equal(info.status, 0); assert.match(info.stdout, /Pages:\s+1\b/); assert.match(info.stdout, /Title:\s+Belge/);
  const size = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(info.stdout);
  assert.ok(size); assert.ok(Math.abs(Number(size[1]) - 80 * 72 / 25.4) < 0.5); assert.ok(Math.abs(Number(size[2]) - 200 * 72 / 25.4) < 0.5);
  const images = spawnSync("pdfimages", ["-list", join(root, "image.pdf")], { encoding: "utf8" });
  assert.equal(images.status, 0, images.stderr); assert.match(images.stdout, /\bimage\s+1\s+1\s+icc\b/);
  console.log("Electron PDF, scoped rejection, Turkish text, rows, notice, PNG and 80x200mm: PASS");
} finally { rmSync(root, { recursive: true, force: true }); }
