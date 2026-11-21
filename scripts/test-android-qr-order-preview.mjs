import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require=createRequire(import.meta.url);
const {BUSINESS_CAPABILITIES:C}=require("../packages/shared/dist/index.js");
const {projectAndroidQrOrderPreview}=require("../apps/desktop-app/dist-electron/android-qr-order-preview.js");
const {projectAndroidOperationsSnapshot}=require("../apps/desktop-app/dist-electron/android-capability-projection.js");

const rooms=[{id:"room-01",number:"101",name:"Dört kişilik"}];
const tables=[{id:"table-01",name:"Masa 4"}];
const items=[{name:"Çay",menu_entry_id:"menu-1",quantity:2,note:"Az şeker",unit_price:15.50,currency:"TRY"},
  {name:"Kahve",menu_entry_id:"menu-2",quantity:1,note:"",unit_price:32,currency:"TRY"}];
const roomRequest={
  request_type:"room_order",room_id:"room-01",table_id:"",
  order_items:items,order_token_hash:"sensitive-qr-digest",accepted_folio_id:"private-folio"
};
const tableRequest={...roomRequest,request_type:"table_order",table_id:"table-01",room_id:""};
const room=projectAndroidQrOrderPreview(roomRequest,rooms,tables);
const table=projectAndroidQrOrderPreview(tableRequest,rooms,tables);
assert.equal(room.kind,"room");
assert.equal(room.source_label,"Oda 101");
assert.equal(table.kind,"table");
assert.equal(table.source_label,"Masa 4");
assert.equal(room.total,63);
assert.equal(room.items[0].quantity,2);
assert.equal(room.items[0].note,"Az şeker");
assert.equal(table.items[0].unit_price,15.5);
for (const preview of [room,table]) {
  assert.equal(JSON.stringify(preview).includes("sensitive-qr-digest"),false);
  assert.equal(JSON.stringify(preview).includes("private-folio"),false);
  assert.equal(JSON.stringify(preview).includes("menu-1"),false);
}
assert.equal(projectAndroidQrOrderPreview({...roomRequest,request_type:"general_info"},rooms,tables),undefined);
assert.equal(projectAndroidQrOrderPreview({...roomRequest,order_items:[]},rooms,tables).invalid_items,true);
assert.equal(projectAndroidQrOrderPreview({...roomRequest,order_items:[{...items[0],quantity:100}]},rooms,tables).invalid_items,true);
assert.equal(projectAndroidQrOrderPreview({...roomRequest,order_items:[{...items[0],unit_price:Infinity}]},rooms,tables).invalid_items,true);
assert.equal(projectAndroidQrOrderPreview({...roomRequest,order_items:[items[0],{...items[1],currency:"USD"}]},rooms,tables).invalid_items,true);
assert.equal(projectAndroidQrOrderPreview({...roomRequest,room_id:"removed-room"},rooms,tables).source_label,"Oda (arşiv)");

// Exercise real projection, including capability withdrawals. No new role
// permission or second request data source is introduced.
const fixture=JSON.parse(readFileSync("scripts/fixtures/android-operations-snapshot.json","utf8"));
const caps=[...new Set([...fixture.business_capabilities,
  C.ANDROID,C.CUSTOMERS,C.REQUESTS,C.QR_MENU,C.FOOD_MENU,C.FOOD_ORDERS,C.FOOD_TABLES,
  C.ACCOMMODATION_ROOMS,C.ACCOMMODATION_STAYS,C.ACCOMMODATION_FOLIO])];
const baseRequest=fixture.requests[0];
const source={
  ...fixture,
  customer_room_stays: [],
  room_folios: [],
  deleted_request_ids: [],
  admin_menu: structuredClone(fixture.menu),
  menu_product_candidates: [],
  androidPermissions: {},
  finance: {generated_at:"",currency:"TRY",today_income_minor:0,today_expense_minor:0,
    today_net_minor:0,outstanding_pension_minor:0,recent_entries:[]},
  reports: {},
  commerce: {orders:[],applications:[],shipments:[],online_sales:[],summary:{}},
  marketing: {status:[],summary:{}},
  voice: {stt_available:false},
  requests:[
    {...baseRequest,id:"qr-room",request_type:"room_order",status:"new",qr_order:room},
    {...baseRequest,id:"qr-table",request_type:"table_order",status:"new",qr_order:table},
    {...baseRequest,id:"plain",request_type:"general_info",status:"new"}
  ]
};
const projected=projectAndroidOperationsSnapshot(source,caps,"2026-07-17");
assert.deepEqual(projected.requests.map(r=>r.id),["qr-room","qr-table","plain"]);
assert.equal(projected.requests[0].qr_order.source_label,"Oda 101");
assert.equal(projected.requests[1].qr_order.total,63);
const check=(omit,expected)=>{
  const after=projectAndroidOperationsSnapshot(source,caps.filter(cap=>!omit.includes(cap)),"2026-07-17");
  assert.deepEqual(after.requests.map(r=>r.id),expected,omit.join(","));
  assert.equal(JSON.stringify(after.requests).includes("sensitive-qr-digest"),false);
};
check([C.QR_MENU],["plain"]);
check([C.FOOD_MENU],["plain"]);
check([C.FOOD_ORDERS],["plain"]);
check([C.FOOD_TABLES],["qr-room","plain"]);
check([C.ACCOMMODATION_FOLIO],["qr-table","plain"]);
check([C.ACCOMMODATION_STAYS],["qr-table","plain"]);
check([C.REQUESTS],[]);
check([C.CUSTOMERS],[]);
check([C.ANDROID],[]);
console.log("android-qr-order-preview-test-ok: source, lines, price, no credentials, capability withdrawal");
