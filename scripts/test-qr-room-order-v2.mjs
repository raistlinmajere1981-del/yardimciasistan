import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const nodeRequire=createRequire(import.meta.url);
function load(path,deps={}) {
  const js=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
  }}).outputText;
  const module={exports:{}};
  new Function("module","exports","require",js)(module,module.exports,key=>{
    if(key in deps)return deps[key];
    if(key.startsWith("node:"))return nodeRequire(key);
    throw Error("Unresolved test adapter: "+key);
  });
  return module.exports;
}
const qr=load("apps/desktop-app/electron/database/qr-room-order-config.ts",{
  "./sync-runtime-store.js":{queueSyncJob:()=>{}}
});
let failItem="";
const menu={
  categories:[{id:"cat1",is_active:true}],
  items:[{id:"menu1",name:"Çay",category_id:"cat1",is_available:true,price:30,currency:"TRY",
    stock_quantity:50,stock_consumption_quantity:1,hide_when_out_of_stock:false},
    {id:"menu2",name:"Kahve",category_id:"cat1",is_available:true,price:50,currency:"TRY",
      stock_quantity:50,stock_consumption_quantity:1,hide_when_out_of_stock:false}]
};
const mockFolio={
  getRoomFolioChargeState(db,folioId){
    const row=db.prepare("SELECT f.status,s.status AS stay_status FROM room_folios f JOIN customer_room_stays s ON s.id=f.stay_id WHERE f.id=?").get(folioId);
    return {canAddItems:row?.status==="open" && row.stay_status==="checked_in"};
  },
  addRoomFolioMenuItemInTransaction(db,{folioId,menuEntryId,quantity},{itemId}){
    if(menuEntryId===failItem)return {ok:false,message:"Stok yetersiz"};
    db.prepare("INSERT INTO mock_folio_lines(id,folio_id,menu_id,quantity) VALUES(?,?,?,?)")
      .run(itemId,folioId,menuEntryId,quantity);
    return {ok:true,message:"Kaydedildi"};
  }
};
const accept=load("apps/desktop-app/electron/room-order-request-acceptance.ts",{
  "./database/qr-room-order-config.js":qr,
  "./database/menu-store.js":{getPublishedMenu:()=>menu},
  "./room-folio.js":mockFolio,
  "./database/event-store.js":{insertDatabaseEvent:()=>{}}
});
function fixture(){
  const dir=mkdtempSync(join(tmpdir(),"ya-roomqr-v2-"));
  const path=join(dir,"test.sqlite");
  const db=new DatabaseSync(path);
  db.exec(readFileSync("apps/desktop-app/db/schema.sql","utf8"));
  db.prepare("INSERT INTO business(id,name,display_name,profile_id,qr_room_orders_enabled,qr_room_order_secret,created_at,updated_at) VALUES('b','Pansiyon','Pansiyon','pension_restaurant',1,?,'t','t')").run("secret-for-test");
  db.prepare("INSERT INTO rooms(id,name,number,created_at,updated_at) VALUES('room1','Oda 101','101','t','t')").run();
  db.prepare("INSERT INTO customers(id,full_name,phone,created_at,updated_at) VALUES('customer1','Misafir','','t','t')").run();
  db.prepare("INSERT INTO customer_room_stays(id,room_id,customer_id,status,check_in_date,guest_count,checked_in_at,created_at,updated_at) VALUES('stay1','room1','customer1','checked_in','2026-11-20',1,'now','t','t')").run();
  db.prepare("INSERT INTO room_folios(id,stay_id,room_id,customer_id,status,check_in_date,guest_count,currency,opened_at,created_at,updated_at) VALUES('folio1','stay1','room1','customer1','open','2026-11-20',1,'TRY','now','t','t')").run();
  db.exec("CREATE TABLE mock_folio_lines(id TEXT PRIMARY KEY,folio_id TEXT,menu_id TEXT,quantity INTEGER)");
  return {db,path,close(){db.close();rmSync(dir,{force:true,recursive:true});}};
}
function addRequest(db,{id="r1",hash=qr.qrRoomOrderTokenHash("secret-for-test","room1","stay1"),
  items=[{menu_entry_id:"menu1",name:"Çay",unit_price:30,currency:"TRY",quantity:2,note:""}]}={}){
  db.prepare("INSERT INTO requests(id,request_type,source,status,customer_name,customer_phone,room_id,order_token_hash,order_items_json,created_at,updated_at) VALUES(?,'room_order','web_form','new','Oda 101','', 'room1',?,?,?,?)")
    .run(id,hash,JSON.stringify(items),new Date().toISOString(),new Date().toISOString());
}
function count(db){return Number(db.prepare("SELECT count(*) n FROM mock_folio_lines").get().n);}
test("per-stay token authorization; only checked-in folios are listed",()=>{
  const f=fixture();
  try {
    const rooms=qr.listQrOrderRooms(f.db);
    assert.equal(rooms.length,1);
    assert.equal(rooms[0].token.length,24);
    assert.notEqual(qr.qrRoomOrderToken("secret-for-test","room1","stay1"),
      qr.qrRoomOrderToken("secret-for-test","room1","stay2"));
    const invalid=qr.qrRoomOrderTokenHash("secret-for-test","room1","stay2");
    addRequest(f.db,{hash:invalid});
    const result=accept.acceptQrRoomOrderRequest(f.db,"r1");
    assert.equal(result.ok,false);
    assert.match(result.message,/mevcut konaklamaya ait değil/);
    assert.equal(count(f.db),0);
    f.db.prepare("UPDATE customer_room_stays SET status='checked_out',checked_out_at='now' WHERE id='stay1'").run();
    assert.equal(qr.listQrOrderRooms(f.db).length,0);
  }finally{f.close();}
});
test("owner approval writes one folio charge and replay is idempotent",()=>{
  const f=fixture();try{
    addRequest(f.db);
    const result=accept.acceptQrRoomOrderRequest(f.db,"r1");
    assert.equal(result.ok,true,result.message);
    assert.equal(result.folioId,"folio1");
    assert.equal(count(f.db),1);
    assert.equal(f.db.prepare("SELECT status,accepted_folio_id FROM requests WHERE id='r1'").get().accepted_folio_id,"folio1");
    assert.equal(accept.acceptQrRoomOrderRequest(f.db,"r1").ok,true);
    assert.equal(count(f.db),1);
  }finally{f.close();}
});
test("price tampering, closed stay and a failing later line never partially charge",()=>{
  const f=fixture();try{
    addRequest(f.db,{id:"bad",items:[{menu_entry_id:"menu1",name:"Çay",unit_price:1,currency:"TRY",quantity:1,note:""}]});
    assert.match(accept.acceptQrRoomOrderRequest(f.db,"bad").message,/fiyatı değişmiş/);
    assert.equal(count(f.db),0);
    addRequest(f.db,{id:"batch",items:[
      {menu_entry_id:"menu1",name:"Çay",unit_price:30,currency:"TRY",quantity:1,note:""},
      {menu_entry_id:"menu2",name:"Kahve",unit_price:50,currency:"TRY",quantity:1,note:""}
    ]});
    failItem="menu2";
    const result=accept.acceptQrRoomOrderRequest(f.db,"batch");
    failItem="";
    assert.equal(result.ok,false);
    assert.equal(count(f.db),0);
    assert.equal(f.db.prepare("SELECT status FROM requests WHERE id='batch'").get().status,"new");
    f.db.prepare("UPDATE room_folios SET status='closed' WHERE id='folio1'").run();
    assert.match(accept.acceptQrRoomOrderRequest(f.db,"batch").message,/aktif konaklaması ve açık oda hesabı/);
  }finally{f.close();failItem="";}
});
