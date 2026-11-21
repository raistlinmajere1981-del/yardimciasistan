import assert from "node:assert/strict";
import { createRequire } from "node:module";
import Module from "node:module";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const require=createRequire(import.meta.url);
const {BUSINESS_CAPABILITIES:C}=require("@yardimci-asistan/shared");
const handlers=new Map();
let confirms=0,spools=0,html="",yes=true,locked=false;
const parent={isDestroyed:()=>false};
const fakeElectron={
  ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},
  BrowserWindow:{getFocusedWindow:()=>parent,getAllWindows:()=>[parent],fromWebContents:()=>parent},
  dialog:{showMessageBox:async()=>{confirms++;return {response:yes?1:0};}}
};
const original=Module._load;
Module._load=function(...args) {if(args[0]==="electron")return fakeElectron;return original.apply(this,args);};
let qr, pdf, management;
try {
  pdf=require("../apps/desktop-app/dist-electron/document-output-pdf.js");
  pdf.openDocumentWindow=async nextHtml=>{
    html=nextHtml;
    return {window:{webContents:{
      getPrintersAsync:async()=>[{name:"Printer A"}],
      print:(_options,done)=>{spools++;done(true);}
    },once:()=>{}},close:()=>{}};
  };
  qr=require("../apps/desktop-app/dist-electron/document-output-qr-print.js");
  management=require("../apps/desktop-app/dist-electron/document-output-management.js");
}finally{Module._load=original;}
const folder=mkdtempSync(join(tmpdir(),"qr-print-fixture-"));
const path=join(folder,"db.sqlite");
const db=new DatabaseSync(path);
try {
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(readFileSync("apps/desktop-app/db/schema.sql","utf8"));
  db.prepare("INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at,qr_room_orders_enabled,qr_room_order_secret,qr_table_orders_enabled,qr_table_order_secret) VALUES('b','Fixture','Fixture','pension_restaurant','now','now',1,'roomsecret',1,'tablesecret')").run();
  db.prepare("INSERT INTO settings(id,business_id,created_at,updated_at) VALUES('b','b','now','now')").run();
  const capabilities=[C.PRINTING,C.QR_MENU,C.FOOD_MENU,C.REQUESTS,C.CUSTOMERS,C.ACCOMMODATION_ROOMS,C.ACCOMMODATION_STAYS,C.ACCOMMODATION_FOLIO,C.FOOD_TABLES,C.FOOD_ORDERS];
  const enable=db.prepare("INSERT INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at) VALUES('b',?,1,'now','now')");
  for(const cap of capabilities)enable.run(cap);
  db.prepare("INSERT INTO rooms(id,name,number,created_at,updated_at) VALUES('r1','Room One','101','now','now'),('r2','Room Two','102','now','now')").run();
  db.prepare("INSERT INTO customers(id,full_name,phone,created_at,updated_at) VALUES('c','Guest','','now','now'),('c2','Second Guest','','now','now')").run();
  db.prepare("INSERT INTO customer_room_stays(id,customer_id,room_id,status,check_in_date,created_at,updated_at) VALUES('s1','c','r1','checked_in','2030-01-01','now','now'),('s2','c2','r2','checked_in','2030-01-01','now','now')").run();
  db.prepare("INSERT INTO room_folios(id,stay_id,room_id,customer_id,check_in_date,opened_at,created_at,updated_at) VALUES('f1','s1','r1','c','2030-01-01','now','now','now'),('f2','s2','r2','c2','2030-01-01','now','now','now')").run();
  db.prepare("INSERT INTO tables(id,name,created_at,updated_at) VALUES('t1','Table 1','now','now')").run();
  const owner=new management.DocumentOutputManagement(db,{role:"desktop_owner",assertAuthorized(){if(locked)throw new Error("locked");}});
  const readRule=(kind,trigger="manual",mode="ASK_CONFIRMATION")=>({documentKind:kind,trigger,channel:"print",mode,adapter:"native_print"});
  for(const kind of ["qr_menu","qr_room","qr_table"]) {
    owner.saveRule(readRule(kind));
    owner.savePrinterBinding({documentKind:kind,printerRef:"Printer A"},"device",[{name:"Printer A"}]);
  }
  owner.saveRule(readRule("qr_room","stay_checked_in","AUTOMATIC"));
  assert.throws(()=>owner.saveRule(readRule("qr_menu","manual","AUTOMATIC")),/DOCUMENT_RULE_INVALID/);
  assert.throws(()=>owner.saveRule({...readRule("qr_room"),channel:"whatsapp",adapter:"whatsapp_webview"}),/DOCUMENT_RULE_INVALID/);
  const options={
    databasePath:()=>path,installationId:()=>"device",
    webModuleUrl:()=>"https://example.com/yardimci-asistan/",
    assertAuthorized(){if(locked)throw new Error("locked");},
    assertSender(){if(locked)throw new Error("locked");}
  };
  qr.registerQrPrintIpc(options);
  const call=input=>handlers.get("documentOutput:printQrCodes")({},input);
  for(const malformed of [
    {},{kind:"qr_menu",ids:[]},{kind:"qr_room",ids:[]},{kind:"qr_room",ids:["r1","r1"]},
    {kind:"qr_room",ids:["unknown"]},{kind:"qr_table",ids:["t1"],html:"<h1>evil</h1>"}
  ]) {
    const result=await call(malformed);assert.equal(result.ok,false);
  }
  assert.equal(spools,0);
  let result=await call({kind:"qr_menu"});assert.deepEqual(result,{ok:true,value:"accepted"});
  assert.match(html,/size:100mm 150mm/);assert.match(html,/QR Menü/);
  assert.ok(html.includes("<svg"));
  assert.equal(spools,1);
  result=await call({kind:"qr_table",ids:["t1"]});assert.equal(result.value,"accepted");
  assert.match(html,/Table 1/);
  result=await call({kind:"qr_room",ids:["r1"]});assert.equal(result.value,"accepted");
  assert.match(html,/Oda 101/);
  assert.equal(spools,3);
  yes=false;result=await call({kind:"qr_room",ids:["r2"]});assert.equal(result.value,null);
  assert.equal(spools,3);
  yes=true;
  const automatic=await qr.printQrAfterCheckIn(options,"s1");
  assert.equal(automatic.value,"accepted");
  assert.equal(spools,4);
  assert.equal((await qr.printQrAfterCheckIn(options,"s1")),null);
  assert.equal(spools,4);
  owner.saveRule(readRule("qr_room","stay_checked_in","ASK_CONFIRMATION"));
  yes=false;
  const prompted=await qr.printQrAfterCheckIn(options,"s2");
  assert.equal(prompted.value,null);
  const beforeConfirm=confirms;
  assert.equal(await qr.printQrAfterCheckIn(options,"s2"),null);
  assert.equal(confirms,beforeConfirm);
  const receipts=db.prepare("SELECT stay_id,mode FROM qr_room_print_arrival_receipts ORDER BY stay_id").all();
  assert.deepEqual(receipts.map(row=>[row.stay_id,row.mode]),[["s1","AUTOMATIC"],["s2","ASK_CONFIRMATION"]]);
  db.prepare("UPDATE customer_room_stays SET status='checked_out' WHERE id='s1'").run();
  result=await call({kind:"qr_room",ids:["r1"]});assert.equal(result.ok,false);
  locked=true;result=await call({kind:"qr_menu"});assert.equal(result.ok,false);locked=false;
  assert.equal(spools,4);
  console.log("qr-print-integration-ok: real SQLite config, native confirmation, A6 code printing, one-per-arrival dedupe, stale stay refusal and locked owner");
}finally{db.close();rmSync(folder,{recursive:true,force:true});}
