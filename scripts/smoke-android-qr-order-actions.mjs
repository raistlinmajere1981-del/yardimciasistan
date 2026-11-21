import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {DatabaseSync} from "node:sqlite";
import {createTemporaryDesktopDatabase} from "./test-helpers/desktop-database.mjs";
import {createSmokeSetupInput} from "./test-helpers/desktop-setup.mjs";
import {seedSmokeBusinessLayout} from "./test-helpers/business-layout.mjs";
import {saveMenuProductFixture} from "./test-helpers/menu-product-fixture.mjs";

const require=createRequire(import.meta.url);
const {BUSINESS_CAPABILITIES:C}=require("../packages/shared/dist/index.js");
const {androidActionAllowedByCapabilities}=require("../packages/sync-core/dist/index.js");
const {setBusinessCapability}=require("../apps/desktop-app/dist-electron/business-capability-store.js");
const {qrRoomOrderTokenHash}=require("../apps/desktop-app/dist-electron/database/qr-room-order-config.js");
const {DesktopRoomFolioService}=require("../apps/desktop-app/dist-electron/room-folio.js");
const {database,cleanup}=createTemporaryDesktopDatabase("yardimci-qr-action-c-");
let raw;
const deviceId="android-qr-operator-c";
const now=()=>new Date().toISOString();
const action=(id,type,request,extra={})=>({
  id,action_type:type,device_id:deviceId,device_name:"Android QR Test",
  app_version:"smoke",created_at:now(),last_seen_at:now(),status:"pending",
  error_message:"",payload:{
    request_id:request.id,expected_updated_at:request.updated_at,...extra
  }
});
const readRequest=id=>raw.prepare("SELECT id,status,updated_at,accepted_folio_id,accepted_order_id FROM requests WHERE id=?").get(id);
const count=table=>Number(raw.prepare("SELECT COUNT(*) n FROM "+table).get().n);
try {
  database.initialize();
  const setup=database.saveInitialSetup(createSmokeSetupInput({
    businessName:"Android QR Güvenli Kabul",syncSecret:"qr-c-test-secret",phone:"+905550000011",
    whatsapp:"",servicePreferences:{whatsapp:false,android:true}
  }));
  assert.equal(setup.ok,true,setup.message);
  seedSmokeBusinessLayout(database.databasePath,{
    roomCount:1,tableCategories:[{name:"Salon",tableCount:1}]
  });
  for(const capability of [C.ANDROID,C.CUSTOMERS,C.REQUESTS,C.QR_MENU,C.FOOD_MENU,C.FOOD_ORDERS,
    C.FOOD_TABLES,C.ACCOMMODATION_ROOMS,C.ACCOMMODATION_STAYS,C.ACCOMMODATION_FOLIO]){
    if (database.getEnabledBusinessCapabilities().includes(capability)) continue;
    const applied=setBusinessCapability(database.databasePath,{capability,enabled:true});
    assert.equal(applied.enabledCapabilities.includes(capability),true,capability+" should be enabled");
  }
  const cat=database.saveMenuCategory({name:"İçecekler",description:"",is_active:true,sort_order:1});
  assert.equal(cat.ok,true);
  const product=saveMenuProductFixture(database,{
    category_id:cat.savedId,name:"Kahve",description:"",price:30,currency:"TRY",
    image_url:"",is_available:true,is_featured:false,tags:[],allergens:[],sort_order:1,
    stock_quantity:100
  });
  assert.equal(product.ok,true,product.message);
  const menu=database.getPublishedMenu().items.find(item=>item.id===product.savedId);
  assert.ok(menu);
  raw=new DatabaseSync(database.databasePath);
  raw.exec("PRAGMA foreign_keys=ON;");
  const room=raw.prepare("SELECT id FROM rooms WHERE deleted_at='' AND is_active=1 LIMIT 1").get();
  const table=raw.prepare("SELECT id FROM tables WHERE deleted_at='' AND is_active=1 LIMIT 1").get();
  assert.ok(room?.id && table?.id);
  database.upsertAndroidDeviceSightings([{
    device_id:deviceId,device_name:deviceId,app_version:"smoke",first_seen_at:now(),last_seen_at:now()
  }]);
  assert.equal(database.setAndroidDeviceActive(deviceId,true).ok,true);
  assert.equal(database.setAndroidDeviceRole(deviceId,"admin").ok,true);

  const timestamp=now();
  const today=timestamp.slice(0,10);
  raw.prepare("INSERT INTO customers(id,full_name,phone,created_at,updated_at) VALUES('qr-c-customer','Test Misafir','','t','t')").run();
  raw.prepare("INSERT INTO customer_room_stays(id,customer_id,room_id,status,check_in_date,guest_count,checked_in_at,created_at,updated_at) VALUES('qr-c-stay','qr-c-customer',?,'planned',?,1,'','t','t')").run(room.id,today);
  assert.equal(database.checkInStay("qr-c-stay").ok,true);
  const opened=new DesktopRoomFolioService(database.databasePath).openFolio("qr-c-stay");
  assert.equal(opened.ok,true,opened.message);
  assert.ok(opened.folioId);
  raw.prepare("UPDATE business SET qr_room_orders_enabled=1,publish_qr_menu_web=1,publish_rooms_web=1,qr_room_order_secret='test-c-secret' WHERE deleted_at=''").run();
  const token=qrRoomOrderTokenHash("test-c-secret",String(room.id),"qr-c-stay");
  const lines=[{menu_entry_id:menu.id,quantity:2,note:"Az şeker",unit_price:menu.price,currency:"TRY",name:menu.name}];
  const insertRequest=(id,type="table_order",status="new",badPrice=false)=>{
    raw.prepare("INSERT INTO requests (id,request_type,source,status,customer_name,customer_phone,table_id,room_id,order_token_hash,order_items_json,created_at,updated_at) VALUES(?,?,'web_form',?,'Test Misafir','',?,?,?,?,?,?)")
      .run(id,type,status,table.id,room.id,token,JSON.stringify(badPrice?[{...lines[0],unit_price:1}]:lines),now(),now());
    return readRequest(id);
  };
  const tableRequest=insertRequest("qr-c-table");
  const roomRequest=insertRequest("qr-c-room","room_order");
  const rejectedRequest=insertRequest("qr-c-reject");
  const staleRequest=insertRequest("qr-c-stale");
  const malformedRequest=insertRequest("qr-c-bad-price","room_order","new",true);

  const first=action("qr-c-accept-table-01","qr_table_order_accept",tableRequest);
  const originalCount=count("table_order_items");
  assert.equal(database.applyAndroidAction(first).ok,true,"QR table approval must work in outer Android owner transaction");
  assert.equal(readRequest(tableRequest.id).status,"approved");
  assert.equal(count("table_order_items"),originalCount+1);
  const firstReplay=database.applyAndroidAction(first);
  assert.equal(firstReplay.ok,true,firstReplay.message);
  assert.equal(firstReplay.alreadyApplied,true);
  assert.equal(count("table_order_items"),originalCount+1);
  const reuse=database.applyAndroidAction({
    ...first,payload:{...first.payload,request_id:staleRequest.id}
  });
  assert.equal(reuse.ok,false,"Existing ACK ID cannot be rebound to another request");
  assert.match(reuse.message,/kimliği farklı/);

  const second=action("qr-c-accept-room-01","qr_room_order_accept",roomRequest);
  const originalFolioLines=count("room_folio_items");
  const accepted=database.applyAndroidAction(second);
  assert.equal(accepted.ok,true,accepted.message);
  assert.equal(readRequest(roomRequest.id).status,"approved");
  assert.equal(readRequest(roomRequest.id).accepted_folio_id,opened.folioId);
  assert.equal(count("room_folio_items"),originalFolioLines+1);
  assert.equal(database.applyAndroidAction(second).alreadyApplied,true);
  assert.equal(count("room_folio_items"),originalFolioLines+1);

  const rejected=database.applyAndroidAction(action("qr-c-reject-order-01","qr_order_reject",rejectedRequest));
  assert.equal(rejected.ok,true,rejected.message);
  assert.equal(readRequest(rejectedRequest.id).status,"rejected");
  assert.equal(count("table_order_items"),originalCount+1);

  const oldRequestVersion=staleRequest.updated_at;
  raw.prepare("UPDATE requests SET updated_at=? WHERE id=?").run("2099-01-01T00:00:00.000Z",staleRequest.id);
  const stale=database.applyAndroidAction(action("qr-c-stale-rejected","qr_order_reject",{
    ...staleRequest,updated_at:oldRequestVersion
  }));
  assert.equal(stale.ok,false);
  assert.match(stale.message,/değişmiş|yenile/i);
  assert.equal(readRequest(staleRequest.id).status,"new");

  const price=database.applyAndroidAction(action("qr-c-price-invalid","qr_room_order_accept",malformedRequest));
  assert.equal(price.ok,false);
  assert.equal(count("room_folio_items"),originalFolioLines+1);
  assert.equal(readRequest(malformedRequest.id).status,"new");

  for(const type of ["customer_request_approve","customer_request_reject","customer_request_reopen",
      "customer_request_mark_answered","customer_request_delete"]){
    const denied=database.applyAndroidAction(action("qr-c-legacy-"+type,type,staleRequest));
    assert.equal(denied.ok,false,"Old generic action should not mutate QR: "+type);
    assert.equal(readRequest(staleRequest.id).status,"new");
  }
  for(const wrong of ["qr_room_order_accept","qr_table_order_accept"]){
    const r=database.applyAndroidAction(action("qr-c-wrong-"+wrong,wrong,
      wrong==="qr_room_order_accept"?staleRequest:malformedRequest));
    assert.equal(r.ok,false,"Wrong source type must be rejected");
  }
  const forbidden=database.applyAndroidAction(action("qr-c-unsupported-key","qr_order_reject",
    {...staleRequest,updated_at:readRequest(staleRequest.id).updated_at},{status:"approved"}));
  assert.equal(forbidden.ok,false);
  const permissions=raw.prepare("SELECT permissions_json FROM android_devices WHERE device_id=?").get(deviceId).permissions_json;
  raw.prepare("UPDATE android_devices SET role='staff',permissions_json='[]' WHERE device_id=?").run(deviceId);
  const denied=database.applyAndroidAction(action("qr-c-unprivileged","qr_order_reject",
    {...staleRequest,updated_at:readRequest(staleRequest.id).updated_at}));
  assert.equal(denied.ok,false);
  raw.prepare("UPDATE android_devices SET role='admin',permissions_json=? WHERE device_id=?").run(permissions,deviceId);
  const expectedCapabilities=database.getEnabledBusinessCapabilities();
  assert.ok(expectedCapabilities.includes(C.QR_MENU));
  const tableContext={requestType:"table_order",payload:{request_id:staleRequest.id}};
  const roomContext={requestType:"room_order",payload:{request_id:roomRequest.id}};
  assert.equal(androidActionAllowedByCapabilities("qr_table_order_accept",expectedCapabilities,tableContext),true);
  assert.equal(androidActionAllowedByCapabilities("qr_room_order_accept",expectedCapabilities,roomContext),true);
  assert.equal(androidActionAllowedByCapabilities("qr_order_reject",expectedCapabilities,tableContext),true);
  assert.equal(androidActionAllowedByCapabilities("qr_order_reject",expectedCapabilities,roomContext),true);
  assert.equal(androidActionAllowedByCapabilities("qr_order_reject",expectedCapabilities,{requestType:"general_info"}),false);
  for(const cap of [C.QR_MENU,C.REQUESTS,C.FOOD_MENU,C.FOOD_ORDERS]){
    const disabled=expectedCapabilities.filter(current=>current!==cap);
    assert.equal(androidActionAllowedByCapabilities("qr_table_order_accept",disabled,tableContext),false,cap);
    assert.equal(androidActionAllowedByCapabilities("qr_room_order_accept",disabled,roomContext),false,cap);
    assert.equal(androidActionAllowedByCapabilities("qr_order_reject",disabled,tableContext),false,cap);
  }
  assert.equal(androidActionAllowedByCapabilities("qr_table_order_accept",
    expectedCapabilities.filter(cap=>cap!==C.FOOD_TABLES),tableContext),false);
  assert.equal(androidActionAllowedByCapabilities("qr_room_order_accept",
    expectedCapabilities.filter(cap=>cap!==C.ACCOMMODATION_FOLIO),roomContext),false);
  assert.equal(androidActionAllowedByCapabilities("qr_order_reject",
    expectedCapabilities.filter(cap=>cap!==C.ACCOMMODATION_STAYS),roomContext),false);
  assert.equal(database.applyAndroidAction(action("qr-c-post-approval","qr_order_reject",
    {...tableRequest,updated_at:readRequest(tableRequest.id).updated_at})).ok,false);
  assert.equal(count("android_action_receipts")>=3,true);
  console.log("android-qr-order-actions-smoke-ok: table/folio writes, reject, version, permissions, legacy, replay/ACK");
}finally{
  raw?.close();
  cleanup();
}
