import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { seedSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";

const require = createRequire(import.meta.url);
const { KbsDeliveryService } = require("../apps/desktop-app/dist-electron/kbs-delivery-service.js");
const { KbsDeliveryRequestProcessor } = require("../apps/desktop-app/dist-electron/kbs-delivery-request-processor.js");
const { createAndroidOperationsSnapshot } = require("../apps/desktop-app/dist-electron/android-operations-snapshot.js");
const { projectLocalAndroidSnapshotForDevice } = require("../apps/desktop-app/dist-electron/local-android-device-projection.js");
const { projectAndroidOperationsSnapshot } = require("../apps/desktop-app/dist-electron/android-capability-projection.js");
const { androidKbsActionIntentHash } = require("../apps/desktop-app/dist-electron/android-kbs-actions.js");
const { createLocalAndroidSummaryResponse } = require("../apps/desktop-app/dist-electron/local-companion-server.js");
const { database, cleanup } = createTemporaryDesktopDatabase("android-kbs-");
let db;
const now = new Date().toISOString();
const deviceId = "android-kbs-admin";
let sequence = 0, posts = 0;
const success = { ok: true, state: "sent", provider: "egm", providerReference: "fixture-reference", message: "Mock success" };
const mock = { provider: "egm", send: async input => {
  posts++;
  assert.equal(db.isTransaction, false);
  assert.equal(row(input.notificationId).status, "submission_unknown", "The fence must already be committed before provider I/O");
  const other = new DatabaseSync(database.databasePath);
  try { assert.equal(other.prepare("SELECT status FROM hospitality_notifications WHERE id=?").get(input.notificationId).status, "submission_unknown"); }
  finally { other.close(); }
  return success;
} };
const ok = result => { assert.equal(result.ok,true,result.message); return result; };
const action = (id,type,payload,device=deviceId) => ({ id,action_type:type,payload,device_id:device,device_name:"Fixture",app_version:"fixture",created_at:now,status:"pending" });
const row = id => db.prepare("SELECT * FROM hospitality_notifications WHERE id=?").get(id);
const payload = id => ({ notification_id:id,provider:"egm",expected_status:row(id).status });
const request = id => action(`kbs_send_fixture_${++sequence}`,"kbs_send_request",payload(id));
const clone = (source,id,status="pending",proof=0) => {
  db.prepare(`INSERT INTO hospitality_notifications(id,guest_id,stay_id,room_id,kind,occurred_at,identity_snapshot,status,confirmed_rejection,created_at)
    SELECT ?,guest_id,stay_id,room_id,kind,occurred_at,identity_snapshot,?,?,created_at FROM hospitality_notifications WHERE id=?`).run(id,status,proof,source);
  return id;
};
const drain = () => database.processKbsDeliveryRequests([mock],()=>true);

try {
  database.initialize();
  ok(database.saveInitialSetup(createSmokeSetupInput({ businessName:"KBS mock fixture",phone:"+905550000001",whatsapp:"+905550000001",
    syncSecret:"kbs-fixture-only",servicePreferences:{android:true,whatsapp:false} })));
  seedSmokeBusinessLayout(database.databasePath,{roomCount:1,roomCapacity:1});
  db = new DatabaseSync(database.databasePath); db.exec("PRAGMA foreign_keys=ON");
  db.prepare(`INSERT INTO kbs_service_settings(id,enabled,provider,facility_code,username,authorized_identity_number,password_encrypted,created_at,updated_at)
    VALUES('primary',1,'egm','PRIVATE_FACILITY','PRIVATE_USERNAME','10000000146','PRIVATE_PASSWORD',?,?)`).run(now,now);
  const customer = ok(database.saveCustomer({fullName:"Mock Misafir",phone:"",email:"",notes:"",tags:[],identityType:"tc_identity_card",
    identityNumber:"10000000214",documentSerialNumber:"PRIVATE_DOCUMENT",nationality:"Türkiye",birthDate:"1990-01-01"})).savedId;
  const today = now.slice(0,10), tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10);
  const roomId = database.getDashboardData().rooms[0].id;
  const stay = ok(database.assignCustomerToRoom({customerId:customer,roomId,checkInDate:today,checkOutDate:tomorrow,
    guestCount:1,guestCustomerIds:[customer],status:"checked_in",notes:""})).savedId;
  const source = db.prepare("SELECT id FROM hospitality_notifications WHERE stay_id=? AND kind='arrival'").get(stay).id;
  database.upsertAndroidDeviceSightings([{device_id:deviceId,device_name:"Mock yönetici",app_version:"fixture",first_seen_at:now,last_seen_at:now}]);
  ok(database.setAndroidDeviceRole(deviceId,"admin"));
  ok(database.setAndroidDeviceActive(deviceId,true));
  const first = request(source);
  ok(database.applyAndroidAction(first)); assert.equal(posts,0,"Action SQLite transaction may only persist intent");
  assert.equal(row(source).status,"pending");
  assert.equal(database.applyAndroidAction(first).alreadyApplied,true);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM kbs_delivery_requests").get().n,1);
  assert.equal(database.applyAndroidAction(request(source)).ok,false,"No second outstanding send for the same notification");
  assert.equal(database.applyAndroidAction({...first,payload:{...first.payload,provider:"jandarma"}}).ok,false);
  assert.equal(database.applyAndroidAction({...first,action_type:"room_status_update",payload:{room_id:roomId,status:"cleaning"}}).ok,false);
  assert.equal(posts,0);
  // New worker connection represents restart after receipt commit, before any processing.
  const restartDb = new DatabaseSync(database.databasePath);
  try { assert.equal(await new KbsDeliveryService(restartDb,[mock]).processRequests(()=>true),1); }
  finally { restartDb.close(); }
  assert.equal(posts,1); assert.equal(row(source).status,"sent");
  ok(database.applyAndroidAction(first)); await drain(); assert.equal(posts,1);
  assert.equal(database.applyAndroidAction(request(source)).ok,false);
  assert.equal(database.retryKbsNotification(source).ok,false);

  const rolledBack = clone(source,"kbs-rollback");
  db.exec("CREATE TRIGGER fixture_kbs_receipt_abort BEFORE INSERT ON android_action_receipts WHEN NEW.id='kbs_receipt_failure' BEGIN SELECT RAISE(ABORT,'fixture'); END");
  assert.equal(database.applyAndroidAction(action("kbs_receipt_failure","kbs_send_request",payload(rolledBack))).ok,false);
  assert.equal(db.prepare("SELECT action_id FROM kbs_delivery_requests WHERE notification_id=?").get(rolledBack),undefined);
  db.exec("DROP TRIGGER fixture_kbs_receipt_abort");

  // Actual process exit after the canonical pre-I/O fence; accepted job remains recoverable.
  const crashed = clone(source,"kbs-crash-fenced"); ok(database.applyAndroidAction(request(crashed)));
  const child = spawnSync(process.execPath,["--input-type=module","-e",`
    import {createRequire} from 'node:module'; import {DatabaseSync} from 'node:sqlite';
    const require=createRequire(import.meta.url), {KbsDeliveryService}=require('./apps/desktop-app/dist-electron/kbs-delivery-service.js');
    const db=new DatabaseSync(process.argv[1]);
    await new KbsDeliveryService(db,[{provider:'egm',send:async()=>process.exit(0)}]).processRequests(()=>true); process.exit(9);
  `,database.databasePath],{encoding:"utf8",timeout:15000});
  assert.equal(child.status,0,child.stderr); assert.equal(row(crashed).status,"submission_unknown");
  assert.equal(db.prepare("SELECT completed_at FROM kbs_delivery_requests WHERE notification_id=?").get(crashed).completed_at,"");
  await drain(); assert.equal(posts,1); assert.equal(database.retryKbsNotification(crashed).ok,false);
  assert.equal(database.applyAndroidAction(request(crashed)).ok,false);

  // Queue completion failure after a provider success cannot produce a second POST.
  const completedLater = clone(source,"kbs-completion-failure"); ok(database.applyAndroidAction(request(completedLater)));
  db.exec("CREATE TRIGGER fixture_kbs_completion_abort BEFORE UPDATE ON kbs_delivery_requests WHEN NEW.notification_id='kbs-completion-failure' BEGIN SELECT RAISE(ABORT,'fixture'); END");
  await drain(); assert.equal(posts,2); assert.equal(row(completedLater).status,"sent");
  db.exec("DROP TRIGGER fixture_kbs_completion_abort"); await drain(); assert.equal(posts,2);

  const rejectedCompletion=clone(source,"kbs-rejected-completion"); ok(database.applyAndroidAction(request(rejectedCompletion)));
  db.exec("CREATE TRIGGER fixture_kbs_rejected_completion_abort BEFORE UPDATE ON kbs_delivery_requests WHEN NEW.notification_id='kbs-rejected-completion' BEGIN SELECT RAISE(ABORT,'fixture'); END");
  const initialPosts=posts;
  await database.processKbsDeliveryRequests([{provider:"egm",send:async()=>{ posts++; return {ok:false,state:"failed",submission:"rejected",provider:"egm",retryable:true,message:"Fixture rejection"}; }}],()=>true);
  assert.equal(posts,initialPosts+1); assert.equal(row(rejectedCompletion).status,"failed");
  assert.equal(database.retryKbsNotification(rejectedCompletion).ok,false,"Retry preparation cannot reactivate an unfinished request");
  await drain(); assert.equal(posts,initialPosts+1,"Job replay after confirmed rejection must not POST again");
  db.exec("DROP TRIGGER fixture_kbs_rejected_completion_abort"); await drain(); assert.equal(posts,initialPosts+1);

  for (const state of ["failed","submission_unknown","sent"]) {
    const id = clone(source,`kbs-unsafe-${state}`,state);
    assert.equal(database.applyAndroidAction(action(`kbs_retry_unsafe_${state}`,"kbs_retry_prepare",payload(id))).ok,false);
    if (state==="failed") { assert.equal((await new KbsDeliveryService(db,[mock]).deliver(id,"egm")).code,"rejection_unverified"); }
  }
  const rejected = clone(source,"kbs-confirmed-rejection"); ok(database.applyAndroidAction(request(rejected)));
  const rejectMock = {provider:"egm",send:async()=>{posts++;return {ok:false,state:"failed",submission:"rejected",provider:"egm",retryable:true,message:"Mock explicit rejection"};}};
  await database.processKbsDeliveryRequests([rejectMock],()=>true); assert.equal(row(rejected).confirmed_rejection,1);
  ok(database.applyAndroidAction(action("kbs_retry_confirmed_001","kbs_retry_prepare",payload(rejected)))); assert.equal(row(rejected).status,"pending");
  assert.equal(posts,4,"Prepare retry must not send");
  ok(database.applyAndroidAction(request(rejected))); await drain(); assert.equal(posts,5); assert.equal(row(rejected).status,"sent");

  const reconcile = clone(source,"kbs-external-confirm","submission_unknown");
  assert.equal(database.applyAndroidAction(action("kbs_external_no_proof","kbs_mark_sent_externally",payload(reconcile))).ok,false);
  const external = action("kbs_external_two_proofs","kbs_mark_sent_externally",{...payload(reconcile),portal_record_verified:true,external_confirmation:"government_portal_verified"});
  ok(database.applyAndroidAction(external)); assert.equal(row(reconcile).provider_reference,"external");
  ok(database.applyAndroidAction(external)); assert.equal(posts,5);

  const gated = clone(source,"kbs-gated-send");
  for (const [column,value,restore] of [["role","staff","admin"],["is_active",0,1],["revoked_at","revoked",""]]) {
    db.prepare(`UPDATE android_devices SET ${column}=? WHERE device_id=?`).run(value,deviceId);
    assert.equal(database.applyAndroidAction(request(gated)).ok,false);
    db.prepare(`UPDATE android_devices SET ${column}=? WHERE device_id=?`).run(restore,deviceId);
  }
  for (const capability of ["service.android","accommodation.rooms","accommodation.stays"]) {
    db.prepare("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id=?").run(capability);
    assert.equal(database.applyAndroidAction(request(gated)).ok,false);
    assert.equal(database.getAndroidKbsSnapshot(),null);
    db.prepare("UPDATE business_capabilities SET is_enabled=1 WHERE capability_id=?").run(capability);
  }
  db.exec("UPDATE kbs_service_settings SET enabled=0"); assert.equal(database.getAndroidKbsSnapshot(),null);
  assert.equal(database.applyAndroidAction(request(gated)).ok,false); db.exec("UPDATE kbs_service_settings SET enabled=1");
  ok(database.applyAndroidAction(request(gated))); assert.equal(await database.processKbsDeliveryRequests([mock],()=>false),0);
  db.exec("UPDATE android_devices SET role='staff'"); await drain(); assert.equal(posts,5); assert.equal(row(gated).status,"pending");
  db.exec("UPDATE android_devices SET role='admin'");
  for (const change of ["configuration","provider","identity","capability"]) {
    const id=clone(source,`kbs-recheck-${change}`); ok(database.applyAndroidAction(request(id)));
    if(change==="configuration") db.exec("UPDATE kbs_service_settings SET password_encrypted=''");
    if(change==="provider") db.exec("UPDATE kbs_service_settings SET provider='jandarma'");
    if(change==="identity") db.prepare("UPDATE hospitality_notifications SET identity_snapshot='{}' WHERE id=?").run(id);
    if(change==="capability") db.exec("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id='accommodation.stays'");
    await drain(); assert.equal(posts,5); assert.equal(row(id).status,"pending");
    db.exec("UPDATE kbs_service_settings SET password_encrypted='PRIVATE_PASSWORD',provider='egm'; UPDATE business_capabilities SET is_enabled=1 WHERE capability_id='accommodation.stays'");
  }

  const snapshot = createAndroidOperationsSnapshot(database,database.getDashboardData());
  assert.ok(snapshot.kbs); assert.ok(snapshot.kbs.submission_unknown_count>0);
  const transport = JSON.stringify(snapshot);
  for (const secret of ["10000000146","10000000214","PRIVATE_DOCUMENT","PRIVATE_PASSWORD","PRIVATE_USERNAME","PRIVATE_FACILITY"]) assert.equal(transport.includes(secret),false,secret);
  const dirty = {...snapshot,kbs:{...snapshot.kbs,password:"PRIVATE_PASSWORD",notifications:snapshot.kbs.notifications.map(n=>({...n,identity_number:"10000000214",identity_snapshot:{secret:"PRIVATE_DOCUMENT"}}))}};
  const own=projectLocalAndroidSnapshotForDevice(dirty,deviceId); assert.ok(own.kbs);
  const lan=createLocalAndroidSummaryResponse(own,{displayName:"Fixture",phone:"",whatsapp:""},deviceId,1);
  assert.ok(lan.kbs,"Final LAN response must include the authorized KBS projection");
  assert.equal(JSON.stringify(lan.kbs).includes("PRIVATE"),false);
  assert.equal(JSON.stringify(own.kbs).includes("PRIVATE"),false); assert.equal(JSON.stringify(own.kbs).includes("10000000214"),false);
  assert.equal(own.kbs.notifications.find(n=>n.id===gated).request_state,"denied");
  assert.equal(own.kbs.notifications.find(n=>n.id==="kbs-recheck-configuration").request_state,"waiting");
  const staff={...dirty,androidPermissions:{[deviceId]:{role:"staff",is_active:true,permissions:["kbs.view","kbs.send","room.view"]}}};
  assert.equal(projectLocalAndroidSnapshotForDevice(staff,deviceId).kbs,null);
  assert.equal(createLocalAndroidSummaryResponse(staff,{displayName:"Fixture",phone:"",whatsapp:""},deviceId,1).kbs,null);
  assert.equal(projectLocalAndroidSnapshotForDevice(dirty,"unknown-device").kbs,null);
  assert.equal(projectLocalAndroidSnapshotForDevice({...dirty,androidPermissions:{[deviceId]:{role:"admin",is_active:true,permissions:[]}}},deviceId).kbs,null);
  assert.equal(projectAndroidOperationsSnapshot(dirty,snapshot.business_capabilities.filter(c=>c!=="accommodation.stays"),today).kbs,null);
  // Redacted mobile editing must preserve existing Desktop-only document numbers.
  const c = database.getDashboardData().customers.find(c=>c.id===customer);
  ok(database.applyAndroidAction(action("kbs_customer_safe_edit","customer_update",{customer_id:customer,expected_updated_at:c.updatedAt,
    full_name:c.fullName,phone:c.phone,email:c.email,notes:"Safe edit",tags:c.tags,identity_type:c.identityType,identity_number:"",document_serial_number:"",
    nationality:c.nationality,birth_date:c.birthDate})));
  assert.equal(db.prepare("SELECT identity_number,document_serial_number FROM customers WHERE id=?").get(customer).identity_number,"10000000214");

  const workerId=clone(source,"kbs-local-worker"); ok(database.applyAndroidAction(request(workerId)));
  let changed; const processed=new Promise(resolve=>{changed=resolve;});
  const worker=new KbsDeliveryRequestProcessor({processRequests:available=>database.processKbsDeliveryRequests([mock],available),available:()=>true,onChanged:()=>changed()});
  worker.start(); worker.wake();
  let timeout; try { await Promise.race([processed,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error("Local KBS worker did not complete")),5000);})]); }
  finally { clearTimeout(timeout); await worker.stopAndDrain(); }
  assert.equal(posts,6); assert.equal(row(workerId).status,"sent");
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok"); assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  assert.equal(db.prepare("SELECT intent_hash FROM android_action_receipts WHERE id=?").get(first.id).intent_hash,androidKbsActionIntentHash(first));
  console.log("android-kbs-smoke-ok: durable mock queue, 6 expected POSTs, no replay after unknown or rejection, role/capability/configuration gates and secret redaction");
} finally { db?.close(); cleanup(); }
