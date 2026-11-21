import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
let id = 0;
const shared = {
  createId: prefix => prefix + String(++id),
  canConvertRequestToReservation: () => true,
  getRequestReservationType: type => type === "restaurant_reservation" ? "table" : null
};
function load(path, dep = {}) {
  const js=ts.transpileModule(readFileSync(path,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const module={exports:{}};
  new Function("module","exports","require",js)(module,module.exports,name=>{
    if(name==="@yardimci-asistan/shared")return shared;
    if(name in dep)return dep[name];
    if(name.startsWith("node:"))return require(name);
    throw Error("Unmocked: "+name);
  });
  return module.exports;
}
const slots=load("apps/desktop-app/electron/database/table-reservation-availability.ts");
const utils={
  normalizeDateInput:v=>/^\d{4}-\d{2}-\d{2}$/.test(v)?v:"",
  normalizeTimeInput:v=>/^\d{2}:\d{2}$/.test(v)?v:"",
  normalizeInteger:v=>Math.trunc(Number(v)),
  buildReservationTitle:r=>String(r.customer_name)+" - masa rezervasyonu",
  buildReservationNotes:r=>String(r.message??"")
};
const reservation=load("apps/desktop-app/electron/database/reservation-store.ts",{
  "./table-reservation-availability.js":slots,
  "./string-array-utils.js":{parseStoredStringArray:v=>{try{return JSON.parse(String(v??"[]"));}catch{return [];}}},
  "./event-store.js":{insertDatabaseEvent:()=>{}},
  "./customer-utils.js":{normalizeLimitedText:v=>String(v??"")},
  "./request-utils.js":utils
});
const intake=load("apps/desktop-app/electron/request-intake-service.ts",{
  "./database/customer-store":{getCustomer:()=>null,saveCustomer:()=>null},
  "./database/table-reservation-availability.js":slots,
  "./database/event-store.js":{insertDatabaseEvent:()=>{}},
  "./database/request-utils.js":utils
});
function fixture(){
  const dir=mkdtempSync(join(tmpdir(),"ya-reservation-"));
  const db=new DatabaseSync(join(dir,"test.sqlite"));
  db.exec(readFileSync("apps/desktop-app/db/schema.sql","utf8"));
  db.prepare("INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES('b','B','B','restaurant','t','t')").run();
  db.prepare("INSERT INTO customers(id,full_name,phone,created_at,updated_at) VALUES('c1','Test','','t','t')").run();
  db.prepare("INSERT INTO tables(id,name,capacity,is_active,created_at,updated_at) VALUES('small','İki Kişilik',2,1,'t','t')").run();
  db.prepare("INSERT INTO tables(id,name,capacity,is_active,created_at,updated_at) VALUES('large','Dört Kişilik',4,1,'t','t')").run();
  return {db,close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
function book(db,{tableId="small",date="2026-12-21",time="19:00",guestCount=2,durationMinutes=120}={}){
  return reservation.saveManualRestaurantReservation(db,{customerId:"c1",tableId,date,time,guestCount,durationMinutes,notes:""});
}
function request(db,id,time,guestCount=2){
  db.prepare(
    "INSERT INTO requests(id,request_type,source,status,customer_name,customer_phone,start_date,time,guest_count,created_at,updated_at) " +
    "VALUES(?,'restaurant_reservation','web_form','new','Misafir','','2026-12-21',?,?,'2026-12-01T00:00:00Z','2026-12-01T00:00:00Z')"
  ).run(id,time,guestCount);
}
test("overlap is interval-based; ends are exclusive; capacity and midnight are guarded",()=>{
  const f=fixture();try{
    assert.equal(book(f.db).ok,true);
    assert.match(book(f.db,{time:"19:30"}).message,/çakışan/);
    assert.match(book(f.db,{time:"20:59"}).message,/çakışan/);
    assert.equal(book(f.db,{time:"21:00"}).ok,true);
    assert.match(book(f.db,{tableId:"small",date:"2026-12-22",time:"13:00",guestCount:3}).message,/kapasite/);
    assert.equal(book(f.db,{tableId:"large",date:"2026-12-22",time:"23:30"}).ok,true);
    assert.match(book(f.db,{tableId:"large",date:"2026-12-23",time:"00:15"}).message,/çakışan/);
    assert.equal(slots.findTableReservationConflict(f.db,"large","2026-12-23","01:30",30),null);
    assert.equal(slots.tableReservationSlot("2026-02-30","19:00",120),null);
  }finally{f.close();}
});
test("SQLite write-time constraints reject simultaneous overlapping inserts/updates",()=>{
  const f=fixture();try{
    assert.equal(book(f.db).ok,true);
    const insert=f.db.prepare(
      "INSERT INTO reservations(id,customer_id,reservation_type,status,title,start_date,time,table_ids_json,created_at,updated_at) "+
      "VALUES('rogue','c1','table','approved','DB bypass','2026-12-21',?, '[\"small\"]','t','t')"
    );
    assert.throws(()=>insert.run("19:30"),/Masa rezervasyonu zaman aralığı çakışıyor/);
    insert.run("21:00");
    assert.throws(()=>f.db.prepare("UPDATE reservations SET time='20:00' WHERE id='rogue'").run(),/Masa rezervasyonu zaman aralığı çakışıyor/);
    assert.equal(f.db.prepare("SELECT time FROM reservations WHERE id='rogue'").get().time,"21:00");
  }finally{f.close();}
});
test("manual reservation without a table remains pending rather than confirmed",()=>{
  const f=fixture();try{
    const result=reservation.saveManualRestaurantReservation(f.db,{customerId:"c1",date:"2026-12-21",time:"18:00",guestCount:2,notes:""});
    assert.equal(result.ok,true);
    const row=f.db.prepare("SELECT status,table_ids_json FROM reservations LIMIT 1").get();
    assert.equal(row.status,"pending");assert.equal(row.table_ids_json,"[]");
  }finally{f.close();}
});
test("web reservation conversion allocates a capacity-matching free table exactly once",()=>{
  const f=fixture();try{
    assert.equal(book(f.db).ok,true);
    request(f.db,"r1","19:30",2);
    const result=intake.convertRequestToReservation(f.db,"r1",[],{now:"2026-12-01T00:00:00Z"});
    assert.equal(result.ok,true,result.message);
    const row=f.db.prepare("SELECT status,table_ids_json,duration_minutes FROM reservations WHERE request_id='r1'").get();
    assert.equal(row.status,"approved");
    assert.equal(row.table_ids_json,'["large"]');
    assert.equal(row.duration_minutes,120);
    const replay=intake.convertRequestToReservation(f.db,"r1",[],{now:"2026-12-01T00:01:00Z"});
    assert.equal(replay.ok,true);
    assert.equal(replay.reservationId,result.reservationId);
    request(f.db,"r2","20:00",3);
    const unavailable=intake.convertRequestToReservation(f.db,"r2",[],{now:"2026-12-01T00:02:00Z"});
    assert.equal(unavailable.ok,false);
    assert.match(unavailable.message,/uygun masa/);
    assert.equal(f.db.prepare("SELECT status FROM requests WHERE id='r2'").get().status,"new");
    assert.equal(Number(f.db.prepare("SELECT count(*) n FROM reservations WHERE request_id='r2'").get().n),0);
  }finally{f.close();}
});
