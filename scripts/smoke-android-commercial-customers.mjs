import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {DatabaseSync} from "node:sqlite";
import {createTemporaryDesktopDatabase} from "./test-helpers/desktop-database.mjs";
import {createSmokeSetupInput} from "./test-helpers/desktop-setup.mjs";

const require=createRequire(import.meta.url);
const {BUSINESS_CAPABILITIES:C}=require("../packages/shared/dist/index.js");
const {setBusinessCapability}=require("../apps/desktop-app/dist-electron/business-capability-store.js");
const {createAndroidOperationsSnapshot}=require("../apps/desktop-app/dist-electron/android-operations-snapshot.js");
const {projectLocalAndroidSnapshotForDevice}=require("../apps/desktop-app/dist-electron/local-android-device-projection.js");
const {projectAndroidOperationsSnapshot}=require("../apps/desktop-app/dist-electron/android-capability-projection.js");
const {database,cleanup}=createTemporaryDesktopDatabase("ya-commercial-d-");
const DEVICE="commercial-admin-smoke";
const STAFF="commercial-staff-smoke";
const now=()=>new Date().toISOString();
const action=(id,type,payload,device=DEVICE)=>({id,action_type:type,payload,device_id:device,
  device_name:device,app_version:"smoke",created_at:now(),last_seen_at:now(),status:"pending",error_message:""});
const profile=(company_name,tax_number,extra={})=>({
  company_name,tax_office:"Ankara",tax_number,authorized_person:"Mert",...extra
});
let raw;
try {
  database.initialize();
  const setup=database.saveInitialSetup(createSmokeSetupInput({
    profileId:"market",businessName:"Android Ticari Müşteri",phone:"+905550000001",whatsapp:"",
    syncSecret:"commercial-d-secret",servicePreferences:{android:true,whatsapp:false}
  }));
  assert.equal(setup.ok,true,setup.message);
  if(!database.getEnabledBusinessCapabilities().includes(C.ANDROID))
    setBusinessCapability(database.databasePath,{capability:C.ANDROID,enabled:true});
  database.upsertAndroidDeviceSightings([DEVICE,STAFF].map(device_id=>({
    device_id,device_name:device_id,app_version:"smoke",first_seen_at:now(),last_seen_at:now()
  })));
  assert.equal(database.setAndroidDeviceActive(DEVICE,true).ok,true);
  assert.equal(database.setAndroidDeviceRole(DEVICE,"admin").ok,true);
  assert.equal(database.setAndroidDeviceActive(STAFF,true).ok,true);
  raw=new DatabaseSync(database.databasePath);
  const customerRow=()=>raw.prepare("SELECT id,updated_at FROM customers WHERE phone='+905550000055' AND deleted_at=''").get();
  const commercialRow=id=>raw.prepare("SELECT company_name,tax_office,tax_number,authorized_person,dealer_status,price_group,payment_term_days FROM customer_commercial_profiles WHERE customer_id=?").get(id);
  const create=action("android-commercial-create-01","customer_create",{
    full_name:"Örnek Gıda Ltd.",phone:"+905550000055",
    commercial_profile:profile("Örnek Gıda Ltd.","1234567890")
  });
  assert.equal(database.applyAndroidAction(create).ok,true,"Commercial customer allowed without wholesale");
  assert.equal(database.applyAndroidAction(create).alreadyApplied,true,"ACK replay once");
  const created=customerRow();assert.ok(created);
  assert.equal(commercialRow(created.id).tax_number,"1234567890");
  assert.equal(commercialRow(created.id).dealer_status,"inactive");

  const snapshot=()=>createAndroidOperationsSnapshot(database,database.getDashboardData());
  const initial=snapshot();
  const projected=projectAndroidOperationsSnapshot(initial,database.getEnabledBusinessCapabilities(),now());
  const candidate=projected.customers.find(row=>row.id===created.id);
  assert.equal(candidate.commercial_profile.company_name,"Örnek Gıda Ltd.");
  assert.equal(candidate.commercial_profile.tax_number,"1234567890");
  assert.equal(candidate.commercial_profile.dealer_status,"inactive");
  const manager=projectLocalAndroidSnapshotForDevice(projected,DEVICE);
  assert.equal(manager.customers.find(row=>row.id===created.id).commercial_profile.tax_office,"Ankara");
  const employee=projectLocalAndroidSnapshotForDevice(projected,STAFF);
  assert.ok(employee.customers.every(row=>!row.commercial_profile),"Staff cannot receive commercial tax identity");

  const change=action("android-commercial-update-01","customer_update",{
    customer_id:created.id,expected_updated_at:customerRow().updated_at,
    full_name:"Örnek Gıda Ticaret Ltd.",phone:"+905550000055",
    commercial_profile:profile("Örnek Gıda Ticaret Ltd.","1234567890")
  });
  assert.equal(database.applyAndroidAction(change).ok,true);
  assert.equal(commercialRow(created.id).company_name,"Örnek Gıda Ticaret Ltd.");
  assert.equal(database.applyAndroidAction(action("android-commercial-stale-01","customer_update",{
    ...change.payload,full_name:"Stale",expected_updated_at:created.updated_at
  })).ok,false,"Stale update rejected");

  assert.equal(database.applyAndroidAction(action("android-commercial-legacy-01","customer_update",{
    customer_id:created.id,expected_updated_at:customerRow().updated_at,
    full_name:"Eski Telefon Güncellemesi",phone:"+905550000055"
  })).ok,true);
  assert.equal(commercialRow(created.id).company_name,"Örnek Gıda Ticaret Ltd.","Legacy update preserves profile");

  const malformed=[
    profile("Firma","1234567890",{dealer_status:"active"}),
    profile("Firma","1234567890",{price_group:"dealer_a"}),
    profile("Firma","1234567890",{payment_term_days:90}),
    profile("Firma","1234567890",{admin:true}),
    profile("","1234567890"),
    profile("X".repeat(181),"1234567890"),
    profile("Firma","1234567890",{tax_number:"x".repeat(33)})
  ];
  for(let i=0;i<malformed.length;i++){
    const result=database.applyAndroidAction(action("android-commercial-invalid-"+i,"customer_update",{
      customer_id:created.id,expected_updated_at:customerRow().updated_at,
      full_name:"Eski Telefon Güncellemesi",phone:"+905550000055",commercial_profile:malformed[i]
    }));
    assert.equal(result.ok,false,"Invalid commercial input "+i);
  }
  assert.equal(commercialRow(created.id).dealer_status,"inactive");
  assert.equal(database.applyAndroidAction(action("android-commercial-duplicate-01","customer_create",{
    full_name:"İkinci Firma",commercial_profile:profile("İkinci Firma","1234567890")
  })).ok,false,"Duplicate tax number rejected");

  // Wholesale elevation is permitted only when that business capability exists.
  if(!database.getEnabledBusinessCapabilities().includes(C.ORDERS))
    setBusinessCapability(database.databasePath,{capability:C.ORDERS,enabled:true});
  const enabled=setBusinessCapability(database.databasePath,{capability:C.WHOLESALE,enabled:true});
  assert.equal(enabled.enabledCapabilities.includes(C.WHOLESALE),true);
  const grant=database.applyAndroidAction(action("android-commercial-dealer-grant-01","customer_update",{
    customer_id:created.id,expected_updated_at:customerRow().updated_at,
    full_name:"Eski Telefon Güncellemesi",phone:"+905550000055",
    commercial_profile:profile("Örnek Gıda Ticaret Ltd.","1234567890",{
      dealer_status:"active",price_group:"dealer_a",payment_term_days:45
    })
  }));
  assert.equal(grant.ok,true,grant.message);
  assert.equal(commercialRow(created.id).dealer_status,"active");
  assert.equal(commercialRow(created.id).price_group,"dealer_a");
  const withWholesale=projectAndroidOperationsSnapshot(snapshot(),database.getEnabledBusinessCapabilities(),now());
  assert.equal(withWholesale.customers.find(row=>row.id===created.id).commercial_profile.dealer_status,"active");

  const disabled=setBusinessCapability(database.databasePath,{capability:C.WHOLESALE,enabled:false});
  assert.equal(disabled.enabledCapabilities.includes(C.WHOLESALE),false);
  const afterDisable=projectAndroidOperationsSnapshot(snapshot(),database.getEnabledBusinessCapabilities(),now());
  assert.equal(afterDisable.customers.find(row=>row.id===created.id).commercial_profile.dealer_status,"inactive");
  assert.equal(afterDisable.customers.find(row=>row.id===created.id).commercial_profile.price_group,"retail");
  const taxUpdate=database.applyAndroidAction(action("android-commercial-no-wholesale-update","customer_update",{
    customer_id:created.id,expected_updated_at:customerRow().updated_at,
    full_name:"Eski Telefon Güncellemesi",phone:"+905550000055",
    commercial_profile:profile("Yeni Vergi Dairesi Ltd.","1234567890")
  }));
  assert.equal(taxUpdate.ok,true,taxUpdate.message);
  assert.equal(commercialRow(created.id).company_name,"Yeni Vergi Dairesi Ltd.");
  assert.equal(commercialRow(created.id).dealer_status,"active","Disabled wholesale cannot modify stored dealer privilege");
  assert.equal(commercialRow(created.id).price_group,"dealer_a");

  const remove=database.applyAndroidAction(action("android-commercial-remove-01","customer_update",{
    customer_id:created.id,expected_updated_at:customerRow().updated_at,
    full_name:"Eski Telefon Güncellemesi",phone:"+905550000055",commercial_profile:null
  }));
  assert.equal(remove.ok,true,remove.message);
  assert.equal(commercialRow(created.id),undefined);
  assert.equal(projectAndroidOperationsSnapshot(snapshot(),database.getEnabledBusinessCapabilities(),now())
    .customers.find(row=>row.id===created.id).commercial_profile,null);
  console.log("android-commercial-customers-smoke-ok: retail tax, wholesale grants, admin masking, stale, duplicate, legacy, opt-out");
} finally {
  raw?.close();
  cleanup();
}
