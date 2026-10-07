import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import http from "node:http";
import { verifyRestoreReconciliation } from "./test-helpers/restore-reconciliation.mjs";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { pushMenuToWeb } = require("../apps/desktop-app/dist-electron/sync-request-menu-service.js");
const { SyncCoordinator } = require("../apps/desktop-app/dist-electron/sync-coordinator.js");
const { createAndroidOperationsSnapshot } = require("../apps/desktop-app/dist-electron/android-operations-snapshot.js");
const core = require("../packages/sync-core/dist/index.js");
const {createPublicRoomAvailabilityPublication}=require('../apps/desktop-app/dist-electron/public-room-availability-publication.js');
const {publishDesktopProjection}=require('../apps/desktop-app/dist-electron/desktop-publication-service.js');
const root = mkdtempSync("/tmp/opencode/publication-protocol-");
const hosting = join(root, "web-module");
cpSync("firm-template/web-module", hosting, { recursive: true });
for (const file of ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm"]) rmSync(join(hosting, "data", file), { force: true });
const secret = "publication-protocol-secret";
const configFile = join(hosting, "config/business.json");
writeFileSync(configFile, JSON.stringify({ ...JSON.parse(readFileSync(configFile)), sync_secret: secret }));
const listener = http.createServer();
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const baseUrl = `http://127.0.0.1:${port}`;
const config = { baseUrl, syncSecret: secret };
const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", hosting], { stdio: "ignore" });
const database = new DesktopDatabase({ appPath: join(process.cwd(), "apps/desktop-app"), userDataPath: join(root, "desktop") });
const coordinator = new SyncCoordinator({ database, getSyncConfig: () => config,
  createAndroidSnapshot: () => createAndroidOperationsSnapshot(database, database.getDashboardData()), onDashboardChanged() {}, onStatusChanged() {} });
const nativeFetch = globalThis.fetch;
let raw;
const post = (body) => nativeFetch(`${baseUrl}/api/sync.php`, { method: "POST", headers: { "Content-Type": "application/json", "X-YA-Sync-Secret": secret }, body: JSON.stringify(body) });
const activate = (clientId, expectedEpoch) => core.activatePublicationSource({ ...config, clientId, expectedEpoch, activationKey: `${clientId}:${expectedEpoch}` });
const menu = (name) => ({ enabled: true, categories: [{ id: "category-test", name, description: "", is_active: true, sort_order: 0,
  created_at: "2026-10-06T00:00:00Z", updated_at: "2026-10-06T00:00:00Z" }], items: [], updated_at: "2026-10-06T00:00:00Z" });
const publish = (clientId, sourceEpoch, sourceRevision, value, key = `${clientId}:${sourceEpoch}:${sourceRevision}`) =>
  core.pushMenu({ ...config, clientId, sourceEpoch, sourceRevision, idempotencyKey: key, menu: value });
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await nativeFetch(`${baseUrl}/api/menu.php`)).ok) break; } catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  assert.equal((await activate("source-A", 0)).ok, true);
  assert.equal((await activate("source-A", 0)).source_epoch, 1, "activation lost-response replay");
  const first = await publish("source-A", 1, 10, menu("A"));
  assert.equal(first.ok, true, first.message);
  const marker = spawnSync("php", ["-r", `require $argv[1]; ya_storage_update_state(['last_menu_publish_at'=>'unchanged-marker']);`,
    join(hosting, "lib/storage.php")], { encoding: "utf8" });
  assert.equal(marker.status, 0, marker.stderr);
  assert.equal((await publish("source-A", 1, 9, menu("old"))).ok, false);
  const replay = await publish("source-A", 1, 10, menu("A"));
  assert.equal(replay.ok, true); assert.equal(replay.deduplicated, true);
  assert.equal(replay.server_revision, first.server_revision);
  assert.equal(replay.published_at, first.published_at);
  const markerAfter = spawnSync("php", ["-r", `require $argv[1]; echo ya_storage_open()->query("SELECT value FROM sync_meta WHERE key='state:last_menu_publish_at'")->fetchColumn();`,
    join(hosting, "lib/storage.php")], { encoding: "utf8" });
  assert.equal(markerAfter.stdout, "unchanged-marker", "dedup is also a no-op for last-published metadata");
  assert.equal((await publish("source-A", 1, 10, menu("B"))).ok, false, "same key changed payload");
  assert.equal((await publish("source-A", 1, 10, menu("B"), "different-key")).ok, false, "same revision changed payload");
  assert.equal((await publish("random-new-client", 2, 999, menu("hijack"))).ok, false, "POST cannot activate source");
  assert.equal((await post({ action: "publish_menu", client_id: "source-A", menu: menu("direct") })).status, 409);
  database.initialize();
  assert.equal(database.saveInitialSetup({ businessName: "Protocol", profileId: "pension_restaurant", phone: "", whatsapp: "", email: "", address: "",
    webModuleUrl: baseUrl, syncSecret: secret, autoSyncEnabled: false, aiEnabled: false, aiProvider: "openai_compatible", aiService: "openai",
    aiProjectName: "", aiModel: "", aiBaseUrl: "https://api.openai.com/v1", aiTimeoutSeconds: 30, aiApiKey: "", clearAiApiKey: false,
    aiModelOptions: [], servicePreferences: { whatsapp: false, android: true } }).ok, true);
  const clientId = database.getSyncRuntimeStatus().clientId;
  assert.equal((await activate(clientId, 1)).source_epoch, 2);
  database.savePublicationSourceEpoch(baseUrl, 2);
  database.ensurePublicationTarget(baseUrl);
  assert.equal((await publish(clientId, 2, 1, menu("new generation"))).ok, true);
  for (const revision of [11, 999]) assert.equal((await publish("source-A", 1, revision, menu("retired"))).ok, false);
  assert.equal((await activate("source-A", 2)).ok, false, "retired identity cannot activate again");
  assert.equal((await publish("source-A", 1, 10, menu("A"))).ok, false, "historic receipt is fenced too");
  // Every formerly direct producer uses the same ordered exact-receipt contract,
  // including disabled/empty projections. Availability retains its cache behavior.
  const cases = [
    ["room_catalog", core.pushRoomCatalog, { catalog: { version: 1, enabled: false, updatedAt: "A", rooms: [] } }, { catalog: { version: 1, enabled: true, updatedAt: "B", rooms: [] } }],
    ["table_catalog", core.pushTableCatalog, { catalog: { version: 1, enabled: false, updatedAt: "A", tables: [] } }, { catalog: { version: 1, enabled: true, updatedAt: "B", tables: [] } }],
    ["business_context", core.pushBusinessContext, { context: { version: 1, businessName: "A", profileId: "market", languages: [], features: [], featureIds: [] } }, { context: { version: 1, businessName: "B", profileId: "market", languages: [], features: [], featureIds: [] } }],
    ["ai_catalog", core.pushAiCatalog, { catalog: { version: 1, updatedAt: "A", items: [] } }, { catalog: { version: 1, updatedAt: "B", items: [] } }],
    ["public_room_availability", core.pushAvailability, { availability: { schema_version: 1, enabled: false, generated_at: "A", rooms: [], blocks: [] } }, { availability: { schema_version: 1, enabled: true, generated_at: "B", rooms: [], blocks: [] } }],
    ["google_reviews_settings", core.pushGoogleReviewsSettings, { settings: { enabled: false, place_id: "", api_key: "" } }, { settings: { enabled: false, place_id: "B", api_key: "" } }]
  ];
  for (const [name, send, a, b] of cases) {
    const identity = { ...config, clientId, sourceEpoch: 2, sourceRevision: 10, idempotencyKey: `${name}:10` };
    const applied = await send({ ...identity, ...a });
    assert.equal(applied.ok, true, `${name}: ${applied.message}`);
    const duplicate = await send({ ...identity, ...a });
    assert.equal(duplicate.ok, true, name); assert.equal(duplicate.deduplicated, true, name);
    assert.equal(duplicate.server_revision, applied.server_revision, name);
    assert.equal((await send({ ...identity, sourceRevision: 9, idempotencyKey: `${name}:9`, ...b })).ok, false, name);
    assert.equal((await send({ ...identity, idempotencyKey: `${name}:10-other-key`, ...b })).ok, false, name);
    assert.equal((await send({ ...identity, clientId: "source-A", sourceEpoch: 1, sourceRevision: 999, ...b })).ok, false, name);
    assert.equal((await send({ ...identity, sourceEpoch: undefined, ...a })).ok, false, name);
  }
  raw = new DatabaseSync(database.databasePath);
  // Authoritative availability is independent of both dashboard bounded lists.
  const now=new Date().toISOString();
  raw.prepare("INSERT INTO rooms(id,name,number,capacity,status,created_at,updated_at) VALUES ('authority-room-1','Authority 1','101',2,'available',?,?),('authority-room-2','Authority 2','102',2,'available',?,?)").run(now,now,now,now);
  const insertBooking=raw.prepare("INSERT INTO reservations(id,reservation_type,status,title,start_date,end_date,room_ids_json,created_at,updated_at) VALUES (?,'room',?,'private title',?,?,?, ?,?)");
  for(let i=0;i<85;i++)insertBooking.run(`authority-old-${i}`,'approved','2029-01-01','2029-01-02',JSON.stringify(['authority-room-1']),now,now);
  insertBooking.run('authority-conflict','approved','2030-07-20','2030-07-22',JSON.stringify(['authority-room-1']),now,now);
  insertBooking.run('authority-cancelled','cancelled','2030-07-20','2030-07-24',JSON.stringify(['authority-room-2']),now,now);
  raw.prepare("INSERT INTO customers(id,full_name,phone,created_at,updated_at) VALUES ('authority-customer','Private Guest','+905550001234',?,?)").run(now,now);
  const insertStay=raw.prepare("INSERT INTO customer_room_stays(id,customer_id,room_id,status,check_in_date,check_out_date,created_at,updated_at) VALUES (?,?,?,?,?, ?,?,?)");
  for(let i=0;i<501;i++){
    raw.prepare("INSERT INTO customers(id,full_name,phone,created_at,updated_at) VALUES (?,'Private Guest',?, ?,?)").run(`authority-customer-${i}`,`+90556${String(i).padStart(7,'0')}`,now,now);
    insertStay.run(`authority-stay-old-${i}`,`authority-customer-${i}`,'authority-room-2','planned','2031-01-01','2031-01-02',now,now);
  }
  insertStay.run('authority-stay-checked-out','authority-customer','authority-room-2','checked_out','2030-07-20','2030-07-24',now,now);
  insertStay.run('authority-stay','authority-customer','authority-room-1','planned','2030-07-22','2030-07-24',now,now);
  raw.exec("UPDATE rooms SET status='available' WHERE id='authority-room-2'"); // canonical room readiness after the checked-out stay
  const bounded=database.getDashboardData();
  assert.equal(bounded.reservations.some(r=>r.id==='authority-conflict'),false);
  assert.equal(bounded.customerRoomStays.some(s=>s.id==='authority-stay'),false);
  const authoritative=database.getPublicRoomAvailabilityInput();
  assert.equal(authoritative.reservations.length,86);assert.equal(authoritative.customerRoomStays.length,502);
  const availability=createPublicRoomAvailabilityPublication(authoritative,database.getEnabledBusinessCapabilities());
  assert.ok(availability.blocks.some(b=>b.room_id==='authority-room-1'&&b.start_date==='2030-07-20'&&b.end_date==='2030-07-24'));
  assert.equal(JSON.stringify(availability).includes('Private Guest'),false);
  for(let i=0;i<11;i++)database.queueSyncJob('public_room_availability_publish'); // above earlier hosting fixture rev10
  let availabilityWire;
  const lostAvailability=await publishDesktopProjection(database,config,'public_room_availability_publish',availability,async(identity,frozen)=>{
    availabilityWire={...config,...identity,availability:frozen};
    const result=await core.pushAvailability(availabilityWire);assert.equal(result.ok,true,result.message);
    return {ok:false,message:'lost response'};
  },{refresh:true});
  assert.equal(lostAvailability.ok,false);
  const persisted=database.prepareSyncPublication('public_room_availability_publish',availability,true);
  const retriedAvailability=await publishDesktopProjection(database,config,'public_room_availability_publish',{...availability,generated_at:new Date().toISOString()},
    (identity,frozen)=>{assert.deepEqual(frozen,availabilityWire.availability);assert.equal(identity.sourceRevision,availabilityWire.sourceRevision);
      assert.equal(identity.idempotencyKey,availabilityWire.idempotencyKey);return core.pushAvailability({...config,...identity,availability:frozen});},{refresh:true});
  assert.equal(retriedAvailability.ok,true,retriedAvailability.message);assert.equal(retriedAvailability.deduplicated,true);
  assert.equal(retriedAvailability.source_revision,persisted.sourceRevision);
  assert.equal(database.prepareSyncPublication('public_room_availability_publish',{...availability,generated_at:new Date().toISOString()}),null,'timestamp-only body coalesces outside heartbeat');
  const query=async(start,end)=>{const r=await nativeFetch(`${baseUrl}/api/availability.php`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start_date:start,end_date:end,guest_count:2})});return r.json();};
  const blocked=await query('2030-07-20','2030-07-21');assert.equal(blocked.ok,true);
  assert.equal(blocked.available_rooms.some(r=>r.number==='101'),false,'conflict beyond first 80 blocks Web');
  assert.equal(blocked.available_rooms.some(r=>r.number==='102'),true,'cancelled reservation/checked-out stay does not block another room');
  const stayBlocked=await query('2030-07-23','2030-07-24');assert.equal(stayBlocked.available_rooms.some(r=>r.number==='101'),false);
  const free=await query('2030-07-24','2030-07-25');assert.equal(free.available_rooms.some(r=>r.number==='101'),true);
  const state=()=>{const result=spawnSync('php',['-r',`require $argv[1]; echo json_encode([ya_storage_get_publication('public_room_availability',[]),ya_storage_server_revision(),ya_storage_open()->query("SELECT COUNT(*) FROM publication_receipts WHERE publication_name='public_room_availability'")->fetchColumn()]);`,join(hosting,'lib/storage.php')],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout;};
  const beforeLimit=state();
  for(const oversized of [
    {...availability,rooms:Array.from({length:501},(_,i)=>({...availability.rooms[0],id:`oversize-${i}`}))},
    {...availability,blocks:Array.from({length:5001},()=>availability.blocks[0])}
  ]) {
    const rejected=await core.pushAvailability({...availabilityWire,sourceRevision:999,idempotencyKey:'availability-limit',availability:oversized});
    assert.equal(rejected.ok,false);assert.equal(rejected.status,422);assert.equal(state(),beforeLimit,'limit rejection changes no payload, freshness, revision or receipt');
  }
  const disabledAvailability=createPublicRoomAvailabilityPublication(authoritative,[]);
  const withdrawn=await publishDesktopProjection(database,config,'public_room_availability_publish',disabledAvailability,
    (identity,frozen)=>core.pushAvailability({...config,...identity,availability:frozen}),{refresh:true});
  assert.equal(withdrawn.ok,true);assert.ok(withdrawn.source_revision>retriedAvailability.source_revision);
  const disabledState=state();
  assert.equal((await core.pushAvailability(availabilityWire)).deduplicated,true,'historic receipt replay does not re-apply');
  assert.equal((await core.pushAvailability({...availabilityWire,idempotencyKey:'late-availability'})).ok,false,'late unapplied revision is fenced');
  assert.equal(state(),disabledState,'old replay changes neither disabled state nor freshness');
  assert.equal((await query('2030-07-20','2030-07-21')).code,'availability_not_supported');
  const saved = database.saveMenuCategory({ name: "S", description: "", is_active: true, sort_order: 0 });
  assert.equal(saved.ok, true);
  let sentBody;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const response = await nativeFetch(url, init);
    if (body.action === "publish_menu") {
      sentBody = body;
      raw.prepare("UPDATE menu_categories SET name = 'T', sync_status = 'pending' WHERE id = ?").run(saved.savedId);
    }
    return response;
  };
  const published = await pushMenuToWeb(database, coordinator);
  assert.equal(published.ok, true, published.message);
  assert.notEqual(raw.prepare("SELECT sync_status FROM menu_categories WHERE id = ?").get(saved.savedId).sync_status, "synced", "even same timestamp in-flight edit is not acknowledged");
  assert.ok(database.getPendingSyncJobs().find((job) => job.jobKey === "menu").sourceRevision > sentBody.source_revision);
  globalThis.fetch = nativeFetch;
  assert.equal((await pushMenuToWeb(database, coordinator)).ok, true);
  assert.equal(raw.prepare("SELECT sync_status FROM menu_categories WHERE id = ?").get(saved.savedId).sync_status, "synced");
  database.queueSyncJob("menu_publish");
  let lost;
  globalThis.fetch = async (url, init) => { await nativeFetch(url, init); lost = JSON.parse(init.body); throw new Error("lost response"); };
  assert.equal((await pushMenuToWeb(database, coordinator)).ok, false);
  const failedRevision = raw.prepare("SELECT source_revision FROM sync_outbox WHERE job_key = 'menu'").get().source_revision;
  database.initialize();
  let retry;
  globalThis.fetch = async (url, init) => { retry = JSON.parse(init.body); return nativeFetch(url, init); };
  const retried = await pushMenuToWeb(database, coordinator);
  assert.equal(retried.ok, true, retried.message); assert.equal(retried.deduplicated, true);
  assert.equal(retry.publication_body, lost.publication_body); assert.equal(retry.idempotency_key, lost.idempotency_key);
  assert.equal(retry.source_revision, failedRevision);
  raw.prepare("UPDATE menu_categories SET name = 'U', sync_status = 'pending' WHERE id = ?").run(saved.savedId);
  globalThis.fetch = async (url, init) => {
    const response = await nativeFetch(url, init); const body = await response.json();
    if (body.ok) body.source_revision += 1;
    return Response.json(body);
  };
  assert.equal((await pushMenuToWeb(database, coordinator)).ok, false);
  assert.ok(database.getPendingSyncJobs("9999").find((job) => job.jobKey === "menu"));
  assert.notEqual(raw.prepare("SELECT sync_status FROM menu_categories WHERE id = ?").get(saved.savedId).sync_status, "synced");
  globalThis.fetch = nativeFetch;
  assert.equal((await coordinator.publishAndroidSnapshotNow()).ok, true);
  assert.ok(raw.prepare("SELECT source_revision FROM sync_outbox_revisions WHERE job_key = 'android_snapshot'").get());
  const before = database.prepareSyncPublication("room_catalog_publish", { enabled: false, rooms: [], updatedAt: "S" });
  database.completeSyncJob(before.jobKey, before.sourceRevision);
  database.initialize();
  const after = database.prepareSyncPublication("room_catalog_publish", { enabled: true, rooms: [{ id: "new" }], updatedAt: "T" });
  assert.ok(after.sourceRevision > before.sourceRevision);
  const asyncPrepared = database.prepareSyncPublication("marketing_website_publish", { projection: {}, sent: [] });
  database.queueSyncJob("marketing_website_publish");
  assert.equal(database.prepareSyncPublication("marketing_website_publish", { projection: { stale: true }, sent: [] }, false, asyncPrepared.sourceRevision), null,
    "async prepared old body must not be attached to a newer job");
  const ai = await core.pushAiSettings({ ...config, clientId, sourceEpoch: 2, sourceRevision: 10, idempotencyKey: "ai-10",
    aiSettings: { enabled: true, provider: "openai_compatible", service: "custom", baseUrl: "https://ai.example/v1", model: "test", apiKey: "private-test-key", timeoutSeconds: 30 } });
  assert.equal(ai.ok, true, ai.message);
  const check = spawnSync("php", ["-r", 'require $argv[1]; $db=ya_storage_open(); echo json_encode([$db->query("SELECT payload_json FROM publications WHERE name=\'ai_settings\'")->fetchColumn(), ya_storage_private_config("ai_settings")["api_key"]]);', join(hosting, "lib/storage.php")], { encoding: "utf8" });
  assert.deepEqual(JSON.parse(check.stdout), ["[]", "private-test-key"]);
  const rollback = spawnSync("php", ["-r", `require $argv[1];
    $db=ya_storage_open(); $revision=ya_storage_server_revision();
    try { ya_storage_publish('ai_settings', [], $argv[2], 11, 'ai-rollback', date(DATE_ATOM), 2, str_repeat('a',64), static function(PDO $tx) use ($db): void {
      if ($tx !== $db) throw new LogicException('wrong_database');
      $tx->exec("UPDATE private_publication_config SET config_json = '{}' WHERE name = 'ai_settings'");
      throw new RuntimeException('injected_failure');
    }); } catch (RuntimeException $error) { if ($error->getMessage() !== 'injected_failure') throw $error; }
    echo json_encode([ya_storage_private_config('ai_settings')['api_key'], ya_storage_server_revision()===$revision,
      $db->query("SELECT source_revision FROM publications WHERE name='ai_settings'")->fetchColumn(),
      $db->query("SELECT COUNT(*) FROM publication_receipts WHERE idempotency_key='ai-rollback'")->fetchColumn()]);`,
    join(hosting, "lib/storage.php"), clientId], { encoding: "utf8" });
  assert.equal(rollback.status, 0, rollback.stderr);
  assert.deepEqual(JSON.parse(rollback.stdout), ["private-test-key", true, 10, 0], "private apply/metadata/receipt all roll back together");
  const alteredWire = { ...sentBody, menu: { ...JSON.parse(sentBody.publication_body), enabled: "not-a-boolean" } };
  assert.equal((await post(alteredWire)).status, 409, "body/candidate types cannot diverge despite PHP loose equality");
  const targetBefore = database.prepareSyncPublication("business_context_publish", { businessName: "unchanged" });
  database.completeSyncJob(targetBefore.jobKey, targetBefore.sourceRevision);
  database.ensurePublicationTarget("https://other-target.example");
  const targetAfter = database.prepareSyncPublication("business_context_publish", { businessName: "unchanged" });
  assert.ok(targetAfter.sourceRevision > targetBefore.sourceRevision, "unchanged completed projection is invalidated for a new target");
  database.completeSyncJob(targetAfter.jobKey, targetAfter.sourceRevision);
  database.initialize();
  database.ensurePublicationTarget(baseUrl);
  const targetReturn = database.prepareSyncPublication("business_context_publish", { businessName: "unchanged" });
  assert.ok(targetReturn.sourceRevision > targetAfter.sourceRevision, "returning to a cached target also invalidates after reopen");
  const replacements = await Promise.all([activate("replacement-B", 2), activate("replacement-C", 2)]);
  assert.equal(replacements.filter((r) => r.ok).length, 1, "CAS replacement has only one winner");
  assert.equal((await core.resetHostingRuntime(config)).ok, true);
  assert.equal((await activate("source-A", 0)).ok, false, "runtime reset never unfences retired sources");
  await verifyRestoreReconciliation({ config, hosting });
  console.log("publication protocol: ordering, conflicts, fencing, retry, ack mismatch, manual lifecycle, menu race, private config, authoritative availability and fail-safe limits PASS");
} finally {
  globalThis.fetch = nativeFetch;
  raw?.close();
  database.close();
  server.kill();
  rmSync(root, { recursive: true, force: true });
}
