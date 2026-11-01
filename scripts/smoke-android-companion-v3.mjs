import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { activateFixtureSource, publicationEnvelope } from "./test-helpers/publication-protocol.mjs";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist");
const { ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS, emptyAndroidCommerceSnapshot, emptyAndroidMarketingSnapshot,
  LOCAL_COMPANION_ENDPOINTS, LOCAL_COMPANION_DEVICE_ID_HEADER, LOCAL_COMPANION_TOKEN_HEADER } = require("../packages/sync-core/dist");
const desktop = name => require(`../apps/desktop-app/dist-electron/${name}.js`);
const { createAndroidOperationsSnapshot } = desktop("android-operations-snapshot");
const { projectLocalAndroidSnapshotForDevice } = desktop("local-android-device-projection");
const { projectAndroidOperationsSnapshot } = desktop("android-capability-projection");
const { LocalCompanionServer } = desktop("local-companion-server");
const { setBusinessCapability } = desktop("business-capability-store");
const { saveRuntimeCatalogProduct } = desktop("commerce-runtime");
const { createCommerceOrder, getCommerceOrder, updateCommerceOrderStatus } = desktop("commerce-order-store");
const { createShipmentForOrder } = desktop("commerce-shipment-store");
const { saveMarketingContent, saveMarketingPublication, requestMarketingPublication, failMarketingPublications } = desktop("marketing/store");
const { saveMessagingSegment, createMessagingCampaign, saveCustomerMessagingPreference, prepareMessagingCampaign } = desktop("messaging-campaigns/store");
const { saveMarketingSchedule, claimMarketingScheduleExecution, finishMarketingScheduleExecution } = desktop("marketing/schedule-store");
const { database, cleanup } = createTemporaryDesktopDatabase("yardimci-companion-v3-");
const temp = mkdtempSync(join(tmpdir(), "yardimci-companion-v3-web-"));
const webRoot = join(temp, "web-module");
const deviceId = "companion-v3-staff";
const adminId = "companion-v3-admin";
const secret = "companion-v3-fixture-secret";
const privateValue = "PRIVATE_COMPANION_CANARY";
const systemPrivate = "SYSTEM_PRIVATE_COMPANION_CANARY";
let raw, server, local, token, adminToken, webUrl;
let sourceRevision = 0;
let lastPublication;
const now = () => new Date().toISOString();
const sourceSnapshot = () => createAndroidOperationsSnapshot(database, database.getDashboardData());
const viewGroups = { ...ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS, commerce_orders_view: true, shipment_view: true, online_sales_view: true, dealer_view: true, marketing_status_view: true };
const manageGroups = { ...viewGroups, commerce_orders_manage: true };
const action = (id, type, order, extra = {}) => ({ id, action_type: type, device_id: deviceId, device_name: "Companion test", app_version: "test",
  created_at: now(), last_seen_at: now(), status: "pending", error_message: "", processed_at: "",
  payload: { order_id: order.id, expected_updated_at: order.updatedAt, expected_status: order.status, ...extra } });
const empty = { commerce: emptyAndroidCommerceSnapshot(), marketing: emptyAndroidMarketingSnapshot() };

try {
  database.initialize();
  const setup = database.saveInitialSetup(createSmokeSetupInput({ profileId: "market", businessName: "Companion test", phone: "", whatsapp: "", syncSecret: secret,
    initialCounts: { rooms: 0, tables: 0 }, tableCategories: [], servicePreferences: { whatsapp: false, android: true } }));
  assert.equal(setup.ok, true, setup.message);
  for (const capability of [C.ORDERS, C.WHOLESALE, C.ONLINE_SALES, C.MARKETING_STUDIO, C.MESSAGING_CAMPAIGNS]) {
    setBusinessCapability(database.databasePath, { capability, enabled: true });
  }
  raw = new DatabaseSync(database.databasePath);
  raw.exec("PRAGMA foreign_keys=ON;");
  for (const id of [deviceId, adminId]) {
    database.upsertAndroidDeviceSightings([{ device_id: id, device_name: id, app_version: "test", first_seen_at: now(), last_seen_at: now() }]);
    assert.equal(database.setAndroidDeviceActive(id, true).ok, true);
  }
  assert.equal(database.setAndroidDeviceRole(adminId, "admin").ok, true);
  assert.equal(database.setAndroidDevicePermissionGroups(deviceId, viewGroups).ok, true);
  const customer = database.saveCustomer({ fullName: privateValue, phone: "+905551234567", email: "private@example.test", address: privateValue,
    notes: privateValue, tags: [], commercialProfile: { companyName: privateValue, dealerStatus: "active", priceGroup: "dealer_a", taxNumber: "1234567890" } });
  assert.equal(customer.ok, true, customer.message);
  const product = saveRuntimeCatalogProduct(database.databasePath, { name: "Test product", salePrice: 10, purchasePrice: 5,
    currency: "TRY", unit: "piece", taxRate: 20, trackInventory: false, isActive: true });
  const createOrder = (source = "desktop") => createCommerceOrder(database.databasePath, { customerId: customer.savedId, source,
    buyerSnapshot: { name: privateValue, phone: "+905551234567", email: "private@example.test" }, note: privateValue,
    deliverySnapshot: { method: "shipping", address: { recipientName: privateValue, addressLine1: privateValue,
      district: "Test", city: "Test", countryCode: "TR" } }, items: [{ productId: product.id, quantity: 2 }] }).order;
  const first = createOrder();
  const second = createOrder("web-online-sales");
  const shipment = createShipmentForOrder(database.databasePath, first.id);
  const content = saveMarketingContent(raw, { title: privateValue, purpose: "promotion", masterText: privateValue, status: "ready", variants: [], mediaAssetIds: [] });
  let publication = saveMarketingPublication(raw, { contentId: content.content.id, channel: "website", placement: "homepage_feature", title: privateValue, text: privateValue, mediaAssetIds: [] });
  publication = requestMarketingPublication(raw, publication.id, publication.revision, true);
  failMarketingPublications(raw, [publication]);
  const segment = saveMessagingSegment(raw, { name: privateValue, description: privateValue, filterDefinition: { version: 1, rules: [] } });
  saveCustomerMessagingPreference(raw, { customerId: customer.savedId, channel: "sms", purpose: "marketing", status: "opted_in", source: "fixture" });
  const campaign = createMessagingCampaign(raw, { name: privateValue, purpose: "marketing", channel: "sms", providerId: "iletimerkezi",
    segmentId: segment.id, templateName: "", templateLanguage: "", bindings: [], text: privateValue });
  prepareMessagingCampaign(raw, campaign.id, null);
  const plannedAt = "2030-10-12T12:00:00.000Z";
  const schedule = saveMarketingSchedule(raw, { name: privateValue, targetType: "audience_campaign", targetId: campaign.id, channel: "sms",
    scheduleType: "once", timezone: "UTC", startsLocal: "2030-10-12T12:00", missedRunPolicy: "run_once_when_resumed" }, now());
  const execution = claimMarketingScheduleExecution(raw, plannedAt, 60_000);
  assert.equal(execution.schedule.id, schedule.schedule.id);
  finishMarketingScheduleExecution(raw, execution.execution.id, "failed", plannedAt, privateValue);
  raw.prepare("UPDATE messaging_outbox SET status='failed',last_error=? WHERE campaign_id=?").run(privateValue, campaign.id);

  let snapshot = sourceSnapshot();
  assert.equal(snapshot.commerce.orders.length, 2);
  assert.equal(snapshot.commerce.shipments[0].id, shipment.id);
  assert.equal(snapshot.commerce.customer_profiles[0].price_group, "dealer_a");
  assert.equal(snapshot.marketing.publications[0].status, "failed");
  assert.equal(snapshot.marketing.campaigns[0].failed_count, 1);
  assert.equal(snapshot.marketing.schedules[0].last_execution_status, "failed");
  assert.equal(snapshot.summary.recent_failed_marketing_operations, 3);
  assert.equal(JSON.stringify(snapshot.marketing).includes(privateValue), false);
  const firstMobile = snapshot.commerce.orders.find(order => order.id === first.id);
  assert.equal(firstMobile.details.buyer.phone, "+905551234567");
  assert.equal(firstMobile.details.delivery_address.address_line1, privateValue);
  assert.equal(firstMobile.details.note, privateValue);
  assert.equal(firstMobile.details.items[0].quantity, 2);
  assert.equal(firstMobile.details.items[0].unit_price, 10);
  assert.equal(firstMobile.details.items[0].line_total, 20);
  assert.equal(firstMobile.details.subtotal, 20);
  assert.equal(firstMobile.details.items_complete, true);
  assert.equal(snapshot.commerce.customers[0].id, customer.savedId);
  assert.equal(snapshot.commerce.customer_profiles[0].company_name, privateValue);
  assert.equal(snapshot.commerce.customers[0].phone, "+905551234567");
  const viewProjection = projectLocalAndroidSnapshotForDevice(snapshot, deviceId);
  assert.deepEqual(viewProjection.commerce.orders.find(order => order.id === first.id).details.available_actions, []);
  assert.deepEqual(projectLocalAndroidSnapshotForDevice(snapshot, adminId).commerce.orders.find(order => order.id === first.id).details.available_actions,
    ["commerce_order_confirm", "commerce_order_cancel"]);
  assert.equal(snapshot.summary.pending_commerce_orders, 2);
  assert.equal(snapshot.summary.pending_shipments, 1);
  assert.equal(snapshot.table_orders.length, 0, "Commerce is never a table order.");
  const oldSnapshot = structuredClone(snapshot); delete oldSnapshot.commerce; delete oldSnapshot.marketing;
  assert.deepEqual(projectLocalAndroidSnapshotForDevice(oldSnapshot, deviceId).commerce, empty.commerce);
  assert.deepEqual(projectLocalAndroidSnapshotForDevice(snapshot, "unknown-device").commerce, empty.commerce);

  const originalCapabilities = database.getEnabledBusinessCapabilities();
  for (const capability of [C.ANDROID, C.ORDERS, C.WHOLESALE, C.ONLINE_SALES, C.MARKETING_STUDIO, C.MESSAGING_CAMPAIGNS]) {
    const projected = projectAndroidOperationsSnapshot(snapshot, originalCapabilities.filter(c => c !== capability), "2026-10-12");
    const mobile = projectLocalAndroidSnapshotForDevice(projected, adminId);
    if (capability === C.ANDROID || capability === C.ORDERS) assert.deepEqual(mobile.commerce, empty.commerce);
    if (capability === C.WHOLESALE) assert.deepEqual(mobile.commerce.customer_profiles, []);
    if (capability === C.ONLINE_SALES) assert.equal(mobile.commerce.orders.some(o => o.id === second.id), false);
    if (capability === C.MARKETING_STUDIO || capability === C.ANDROID) assert.deepEqual(mobile.marketing, empty.marketing);
  }

  const noEffects = () => Object.fromEntries(["commerce_sales", "inventory_movements", "finance_entries", "customer_credit_entries", "commerce_order_fulfillments"]
    .map(table => [table, Number(raw.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count)]));
  const effects = noEffects();
  assert.equal(database.applyAndroidAction(action("companion_view_denied_001", "commerce_order_confirm", first)).ok, false);
  assert.equal(database.setAndroidDevicePermissionGroups(deviceId, manageGroups).ok, true);
  const offlineRetry = action("companion_retry_confirm_001", "commerce_order_confirm", first);
  // A receipt failure must roll back the canonical mutation and event, then retry once.
  raw.exec("CREATE TRIGGER test_receipt_failure BEFORE INSERT ON android_action_receipts BEGIN SELECT RAISE(ABORT,'test_receipt_failure'); END;");
  assert.equal(database.applyAndroidAction(offlineRetry).ok, false);
  assert.equal(getCommerceOrder(database.databasePath, first.id).order.status, "placed");
  raw.exec("DROP TRIGGER test_receipt_failure;");
  const confirmed = database.applyAndroidAction(offlineRetry);
  assert.equal(confirmed.ok, true, confirmed.message);
  const appliedAt = raw.prepare("SELECT applied_at FROM android_action_receipts WHERE id=?").get(offlineRetry.id).applied_at;
  raw.prepare("DELETE FROM events WHERE json_extract(payload_json,'$.android_action_id')=?").run(offlineRetry.id);
  assert.equal(database.applyAndroidAction(offlineRetry).alreadyApplied, true, "Receipt replay does not depend on retained event history.");
  assert.equal(raw.prepare("SELECT applied_at FROM android_action_receipts WHERE id=?").get(offlineRetry.id).applied_at, appliedAt);
  assert.equal(database.applyAndroidAction({ ...offlineRetry, payload: { ...offlineRetry.payload, order_id: second.id } }).ok, false);
  assert.equal(database.applyAndroidAction(action("companion_stale_cancel_001", "commerce_order_cancel", first)).ok, false);
  const current = getCommerceOrder(database.databasePath, first.id).order;
  assert.notEqual(current.updatedAt, first.updatedAt);
  assert.equal(database.applyAndroidAction(action("companion_same_time_stale_001", "commerce_order_cancel", current, { expected_status: "placed" })).ok, false,
    "Status precondition protects same-millisecond Desktop changes as well.");
  assert.equal(database.applyAndroidAction(action("companion_missing_version_001", "commerce_order_cancel", current, { expected_updated_at: "" })).ok, false);
  const cancelled = database.applyAndroidAction(action("companion_cancel_001", "commerce_order_cancel", current));
  assert.equal(cancelled.ok, true, cancelled.message);
  assert.equal(database.applyAndroidAction(action("companion_terminal_confirm_001", "commerce_order_confirm", getCommerceOrder(database.databasePath, first.id).order)).ok, false);
  assert.equal(database.applyAndroidAction(action("companion_no_fulfill_001", "commerce_order_fulfill", second)).ok, false);
  assert.deepEqual(noEffects(), effects);
  // Canonical Desktop still follows the same transitions after extraction.
  assert.equal(updateCommerceOrderStatus(database.databasePath, { orderId: second.id, status: "confirmed" }).order.status, "confirmed");

  const onlineJob = raw.prepare("SELECT job_key,source_revision FROM sync_outbox WHERE job_type='online_catalog_publish'").get();
  assert.ok(onlineJob);
  database.prepareSyncPublication("android_snapshot", sourceSnapshot());
  const snapshotRevisionBeforeAck = Number(raw.prepare("SELECT source_revision FROM sync_outbox WHERE job_key='android_snapshot'").get().source_revision);
  database.completeSyncJob(onlineJob.job_key, Number(onlineJob.source_revision) - 1);
  assert.equal(Number(raw.prepare("SELECT source_revision FROM sync_outbox WHERE job_key='android_snapshot'").get().source_revision), snapshotRevisionBeforeAck);
  database.completeSyncJob(onlineJob.job_key, Number(onlineJob.source_revision));
  assert.ok(Number(raw.prepare("SELECT source_revision FROM sync_outbox WHERE job_key='android_snapshot'").get().source_revision) > snapshotRevisionBeforeAck);
  assert.equal(sourceSnapshot().commerce.online_catalog.pending, false);

  const beforeRevision = Number(raw.prepare("SELECT source_revision FROM sync_outbox WHERE job_key='android_snapshot'").get().source_revision);
  const third = createOrder();
  assert.ok(Number(raw.prepare("SELECT source_revision FROM sync_outbox WHERE job_key='android_snapshot'").get().source_revision) > beforeRevision);
  // Confirm the list cap does not cap Today totals.
  const businessId = String(raw.prepare("SELECT id FROM business LIMIT 1").get().id);
  const stamp = now();
  raw.exec("BEGIN IMMEDIATE");
  for (let i = 0; i < 110; i++) raw.prepare("INSERT INTO commerce_orders (id,business_id,placed_at,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run(`bounded-order-${i}`, businessId, "2020-01-01T00:00:00Z", stamp, stamp);
  raw.exec("COMMIT");
  snapshot = sourceSnapshot();
  assert.equal(snapshot.commerce.orders.length, 100);
  assert.equal(snapshot.summary.pending_commerce_orders, 111);
  assert.ok(Buffer.byteLength(JSON.stringify({ commerce: snapshot.commerce, marketing: snapshot.marketing })) < 256 * 1024);
  const manualDealer = createOrder("desktop-wholesale");
  createShipmentForOrder(database.databasePath, manualDealer.id);
  snapshot = sourceSnapshot();
  assert.equal(snapshot.commerce.orders.find(order => order.id === manualDealer.id).dealer_order, true);
  assert.equal(snapshot.commerce.order_counts.find(row => row.source === "other" && row.status === "placed").dealer_count, 1);
  const oversized = createOrder();
  raw.exec("BEGIN IMMEDIATE");
  for (let i = 0; i < 500; i++) raw.prepare(`INSERT INTO commerce_order_items
    (id,order_id,product_id,product_name,unit,quantity,unit_price,line_total,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(`oversized-item-${i}`, oversized.id, product.id, "Bounded item", "piece", 1, 10, 10, stamp);
  raw.exec("COMMIT");
  snapshot = sourceSnapshot();
  const oversizedDetails = snapshot.commerce.orders.find(order => order.id === oversized.id).details;
  assert.equal(oversizedDetails.items_total_count, 501);
  assert.equal(oversizedDetails.items_complete, false);
  assert.deepEqual(oversizedDetails.available_actions, []);
  assert.equal(snapshot.commerce.orders.find(order => order.id === manualDealer.id).details.items_complete, true);

  // Legacy loopback HTTP fixture tests projections/receipts; product uses pinned HTTPS.
  process.env.NODE_ENV = "test";
  local = new LocalCompanionServer({ testOnlyHttp: true, desktopId: () => "desktop-companion", businessInfo: () => ({ displayName: "Test", phone: "", whatsapp: "" }),
    createSummary: id => projectLocalAndroidSnapshotForDevice(sourceSnapshot(), id), applyAction: a => database.applyAndroidAction(a),
    authorize: ({ deviceId: id, token: supplied }) => [deviceId, adminId].includes(id) && supplied === "local-test-token" });
  const address = await local.start("127.0.0.1", 0);
  const localUrl = `http://127.0.0.1:${address.port}`;
  const localPost = (endpoint, body, id = deviceId, supplied = "local-test-token") => post(`${localUrl}${endpoint}`, body, {
    [LOCAL_COMPANION_DEVICE_ID_HEADER]: id, [LOCAL_COMPANION_TOKEN_HEADER]: supplied });
  assert.equal((await localPost(LOCAL_COMPANION_ENDPOINTS.summary, {}, deviceId, "wrong-token")).status, 401);
  const lan = await localPost(LOCAL_COMPANION_ENDPOINTS.summary, {});
  assert.deepEqual(lan.body.commerce, projectLocalAndroidSnapshotForDevice(sourceSnapshot(), deviceId).commerce);
  assert.equal((await localPost(LOCAL_COMPANION_ENDPOINTS.action, action("companion_lan_confirm_001", "commerce_order_confirm", third))).body.status, "applied");
  assert.equal((await localPost(LOCAL_COMPANION_ENDPOINTS.action, action("companion_lan_confirm_001", "commerce_order_confirm", third))).body.already_applied, true);

  // Real PHP/HTTP with per-device token credentials, ordered publication and queue retries.
  cpSync("firm-template/web-module", webRoot, { recursive: true });
  for (const file of ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm"]) rmSync(join(webRoot, "data", file), { force: true });
  const configPath = join(webRoot, "config", "business.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")); config.sync_secret = secret;
  writeFileSync(configPath, JSON.stringify(config));
  const port = await freePort(); webUrl = `http://127.0.0.1:${port}`;
  server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", webRoot], { stdio: "ignore" });
  await waitForWeb();
  await activateFixtureSource(webUrl, secret, "desktop-companion");
  const poisoned = sourceSnapshot();
  for (const rows of [poisoned.commerce.orders, poisoned.commerce.customer_profiles, poisoned.commerce.shipments,
    poisoned.marketing.publications, poisoned.marketing.schedules, poisoned.marketing.campaigns]) {
    for (const row of rows) Object.assign(row, { address: systemPrivate, customer_phone: systemPrivate,
      api_key: systemPrivate, tax_number: systemPrivate, secret: systemPrivate,
      text: systemPrivate, last_error: systemPrivate, recipients: [systemPrivate], media: [systemPrivate] });
  }
  await publish(poisoned);
  const fallback = await post(`${webUrl}/api/android.php`, { action: "android_summary", device_id: adminId }, {
    "X-YA-Device-Id": adminId, "X-YA-Sync-Secret": secret });
  assert.deepEqual(fallback.body.commerce, empty.commerce);
  assert.deepEqual(fallback.body.marketing, empty.marketing);
  const claim = async id => { const result = await post(`${webUrl}/api/android-device-token.php`, { device_id: id }, { "X-YA-Device-Id": id, "X-YA-Sync-Secret": secret });
    assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body.device_token; };
  token = await claim(deviceId); adminToken = await claim(adminId);
  const summary = async (id = deviceId, credential = token, extra = {}) => post(`${webUrl}/api/android.php`, { action: "android_summary", device_id: id, ...extra }, {
    "X-YA-Device-Id": id, "X-YA-Device-Token": credential });
  const hosted = await summary(); assert.equal(hosted.status, 200);
  const expected = projectLocalAndroidSnapshotForDevice(sourceSnapshot(), deviceId);
  assert.deepEqual(hosted.body.commerce, expected.commerce);
  assert.deepEqual(hosted.body.marketing, expected.marketing);
  assert.equal(JSON.stringify({ commerce: hosted.body.commerce, marketing: hosted.body.marketing }).includes(systemPrivate), false);
  assert.equal(hosted.body.commerce.orders.find(order => order.id === third.id).details.buyer.phone, "+905551234567");
  assert.equal(JSON.stringify(hosted.body.marketing).includes(privateValue), false);
  for (const capability of [C.ORDERS, C.WHOLESALE, C.ONLINE_SALES, C.MARKETING_STUDIO, C.MESSAGING_CAMPAIGNS]) {
    const mismatched = structuredClone(poisoned);
    mismatched.business_capabilities = mismatched.business_capabilities.filter(c => c !== capability);
    await publish(mismatched);
    const remote = await summary();
    const safe = projectLocalAndroidSnapshotForDevice(mismatched, deviceId);
    assert.deepEqual(remote.body.commerce, safe.commerce, `Hosting capability redaction: ${capability}`);
    assert.deepEqual(remote.body.marketing, safe.marketing, `Hosting marketing redaction: ${capability}`);
    if (capability === C.WHOLESALE) {
      assert.equal(remote.body.commerce.orders.some(order => order.id === manualDealer.id), false);
      assert.equal(remote.body.commerce.shipments.some(shipment => shipment.order_id === manualDealer.id), false);
      setBusinessCapability(database.databasePath, { capability, enabled: false });
      assert.equal(database.applyAndroidAction(action("companion_manual_dealer_off_001", "commerce_order_confirm", manualDealer)).ok, false);
      setBusinessCapability(database.databasePath, { capability, enabled: true });
    }
  }
  await publish(sourceSnapshot());
  const generalSecret = await post(`${webUrl}/api/sync.php`, { action: "android_summary", device_id: adminId }, { "X-YA-Sync-Secret": secret });
  assert.deepEqual(generalSecret.body.commerce, empty.commerce, "A shared-secret request is not a device identity for v3 data.");
  assert.deepEqual(generalSecret.body.marketing, empty.marketing);
  assert.equal((await summary(adminId, token)).status, 401);
  assert.equal((await post(`${webUrl}/api/android.php`, { action: "android_summary", device_id: adminId }, {
    "X-YA-Device-Id": deviceId, "X-YA-Device-Token": token })).status, 403);
  const queueAction = action("companion_host_confirm_001", "commerce_order_confirm", second);
  queueAction.payload.expected_updated_at = getCommerceOrder(database.databasePath, second.id).order.updatedAt;
  queueAction.payload.expected_status = "confirmed";
  const enqueue = a => post(`${webUrl}/api/android.php`, { action: "enqueue_android_action", action_id: a.id, action_type: a.action_type, payload: a.payload, device_id: a.device_id }, {
    "X-YA-Device-Id": a.device_id, "X-YA-Device-Token": token });
  const queued = await enqueue(queueAction); assert.equal(queued.status, 201, JSON.stringify(queued.body));
  assert.equal((await enqueue(queueAction)).body.deduplicated, true);
  assert.equal((await enqueue({ ...queueAction, payload: { ...queueAction.payload, order_id: third.id } })).status, 409);
  assert.equal((await enqueue({ ...queueAction, id: "companion_host_noversion_001", payload: { order_id: second.id } })).status, 422);
  const pulled = await post(`${webUrl}/api/sync.php`, { action: "pull_android_actions", client_id: "desktop-companion" }, { "X-YA-Sync-Secret": secret });
  const inbound = pulled.body.actions.find(a => a.id === queueAction.id);
  assert.ok(inbound);
  assert.equal(database.applyAndroidAction(inbound).ok, true);
  assert.equal(database.applyAndroidAction(inbound).alreadyApplied, true);
  const pendingResult = await summary(deviceId, token, { action_result_ids: [queueAction.id, "absent-receipt", "invalid id"] });
  assert.equal(pendingResult.body.action_results[0].status, "pending");
  assert.deepEqual(pendingResult.body.action_results[0].payload, queueAction.payload);
  assert.deepEqual(pendingResult.body.missing_action_result_ids, ["absent-receipt"]);
  assert.deepEqual((await summary(adminId, adminToken, { action_result_ids: [queueAction.id] })).body.action_results, [],
    "Personal receipts cannot be read by a different device, including admin.");
  const marked = await post(`${webUrl}/api/sync.php`, { action: "mark_android_action_result", action_id: queueAction.id, status: "applied" }, { "X-YA-Sync-Secret": secret });
  assert.equal(marked.status, 200);
  const revision = (await summary()).body.server_revision;
  const unchangedResult = await summary(deviceId, token, { known_server_revision: revision, action_result_ids: [queueAction.id] });
  assert.equal(unchangedResult.body.not_modified, true);
  assert.equal(unchangedResult.body.action_results[0].status, "applied");
  assert.deepEqual(unchangedResult.body.action_results[0].payload, queueAction.payload);
  const boundedResults = await summary(deviceId, token, { action_result_ids: Array.from({ length: 50 }, (_, i) => `absent-${i}`) });
  assert.equal(boundedResults.body.missing_action_result_ids.length, 40);

  // Revocation while an action is offline/pending is decided again by the Desktop owner.
  assert.equal(database.setAndroidDevicePermissionGroups(deviceId, viewGroups).ok, true);
  assert.equal(database.applyAndroidAction(inbound).ok, false, "Even receipt replay rechecks revoked decision permissions.");
  assert.equal((await localPost(LOCAL_COMPANION_ENDPOINTS.action, { ...action("companion_lan_identity_001", "commerce_order_cancel", third), device_id: adminId })).body.status, "failed");
  assert.equal(database.applyAndroidAction(action("companion_revoked_grant_001", "commerce_order_cancel", getCommerceOrder(database.databasePath, third.id).order)).ok, false);
  await publish(sourceSnapshot());
  assert.equal((await summary(deviceId, token, { action_result_ids: [queueAction.id] })).body.action_results[0].status, "applied",
    "A device retaining order view can receive its own result after decision rights are revoked.");
  const denied = await enqueue(action("companion_host_denied_001", "commerce_order_cancel", getCommerceOrder(database.databasePath, third.id).order));
  assert.equal(denied.status, 403);
  assert.equal((await summary(adminId, adminToken)).body.commerce.orders.length, 100);
  assert.equal(database.setAndroidDevicePermissionGroups(deviceId, { ...viewGroups, commerce_orders_view: false, shipment_view: false, online_sales_view: false, dealer_view: false, marketing_status_view: false }).ok, true);
  const withdrawn = sourceSnapshot();
  const oldPublication = lastPublication;
  await publish(withdrawn);
  assert.deepEqual((await summary()).body.commerce, empty.commerce);
  assert.deepEqual((await summary(deviceId, token, { action_result_ids: [queueAction.id] })).body.action_results, []);
  assert.deepEqual((await summary()).body.marketing, empty.marketing);
  assert.deepEqual((await localPost(LOCAL_COMPANION_ENDPOINTS.summary, {})).body.commerce, empty.commerce);
  const late = await post(`${webUrl}/api/sync.php`, oldPublication, { "X-YA-Sync-Secret": secret });
  assert.equal(late.status, 200, "An exact historic receipt remains an idempotent no-op replay.");
  assert.equal(late.body.deduplicated, true);
  const lateUnapplied = await post(`${webUrl}/api/sync.php`, publicationEnvelope({ action: "publish_android_snapshot",
    source_revision: sourceRevision - 1, idempotency_key: "companion-unapplied-old-revision", snapshot }, "desktop-companion"), { "X-YA-Sync-Secret": secret });
  assert.equal(lateUnapplied.status, 409, "An unapplied old revision cannot reopen withdrawn permissions.");
  assert.deepEqual((await summary()).body.commerce, empty.commerce);
  assert.equal(database.revokeAndroidDevice(deviceId).ok, true);
  await publish(sourceSnapshot());
  const inactive = await summary(deviceId, token, { known_server_revision: (await summary()).body.server_revision });
  assert.equal(inactive.body.approval_required, true);
  assert.deepEqual(inactive.body.commerce, empty.commerce);
  assert.equal(inactive.body.not_modified, undefined);
  const inactiveLan = await localPost(LOCAL_COMPANION_ENDPOINTS.summary, { known_server_revision: local.revision });
  assert.equal(inactiveLan.body.approval_required, true);
  assert.deepEqual(inactiveLan.body.commerce, empty.commerce);
  assert.deepEqual(noEffects(), effects);
  setBusinessCapability(database.databasePath, { capability: C.ANDROID, enabled: false });
  await publish(sourceSnapshot());
  assert.equal((await summary(adminId, adminToken)).status, 403);
  console.log("android-companion-v3-smoke-ok: canonical projection/action, caps, device redaction, retry, rollback, stale, idempotency, LAN/PHP and ordered withdrawal verified");
} finally {
  if (local) await local.stop();
  if (server) { server.kill(); await once(server, "exit"); }
  raw?.close(); cleanup(); rmSync(temp, { recursive: true, force: true });
}

async function publish(snapshot) {
  const envelope = publicationEnvelope({ action: "publish_android_snapshot", source_revision: ++sourceRevision, snapshot }, "desktop-companion");
  const result = await post(`${webUrl}/api/sync.php`, envelope, { "X-YA-Sync-Secret": secret });
  lastPublication = envelope;
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result;
}
async function post(url, body, headers = {}) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function freePort() { const listener = createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening"); const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve)); return port; }
async function waitForWeb() { for (let i = 0; i < 100; i++) { try { const response = await fetch(`${webUrl}/api/menu.php`); if (response.ok) return; } catch { /* Wait for local PHP only. */ }
  await new Promise(resolve => setTimeout(resolve, 25)); } throw new Error("PHP fixture startup failed"); }
