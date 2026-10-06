import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { fixtureHttp, fixtureSecretService, fixtureShippingService, testCredentials, soap, dataTable, orderResponse } from "./test-helpers/aras-provider-fixtures.mjs";

const require = createRequire(import.meta.url);
const { ARAS_SHIPPING_PROVIDER, BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { ArasShippingProviderAdapter, mapArasShipmentStatus } = require("../apps/desktop-app/dist-electron/shipping/aras-shipping-provider.js");
const { ArasSoapClient, parseSoapResult } = require("../apps/desktop-app/dist-electron/shipping/aras-soap.js");
const { saveRuntimeCatalogProduct, createRuntimeOrder } = require("../apps/desktop-app/dist-electron/commerce-runtime.js");

const delivery = { method: "shipping", address: { recipientName: "Receiver <&> Secret", addressLine1: "Private & Road", district: "Central", city: "Istanbul", countryCode: "TR" } };
const adapterInput = { shipment: { id: "fixture-shipment-id" }, delivery, receiverPhone: "05550000000", orderReference: "fixture-order-id" };
const http = fixtureHttp();
let sends = 0;
const adapter = new ArasShippingProviderAdapter(testCredentials, () => { sends++; return true; }, { fetchImpl: http.fetchImpl, timeoutMs: 30 });
await adapter.testConnection();
const created = await adapter.createShipment(adapterInput);
assert.equal(created.externalReference, adapterInput.shipment.id);
await adapter.createShipment(adapterInput);
assert.equal(http.calls.filter((call) => call.operation === "SetOrder").length, 1);
assert.equal(sends, 1);
const setBody = http.calls.find((call) => call.operation === "SetOrder").body;
assert.ok(setBody.includes("Receiver &lt;&amp;&gt; Secret"));
assert.ok(setBody.includes("Private &amp; Road"));
assert.ok(setBody.includes("<ReceiverPhone1>05550000000</ReceiverPhone1>"));
assert.ok(!setBody.includes("Receiver <&> Secret"));
assert.ok(http.calls.every((call) => call.url === "https://customerservicestest.araskargo.com.tr/arascargoservice/arascargoservice.asmx"));
http.state.status = "TESLİM EDİLDİ";
const tracked = await adapter.getShipmentStatus(adapterInput.shipment.id);
assert.equal(tracked.status, "delivered");
assert.equal(tracked.trackingNumber, "1234567890123");
assert.ok(tracked.trackingUrl.startsWith("https://kargotakip.araskargo.com.tr/"));
for (const state of ["hazırlanıyor", "TESLİM EDİLEMEDİ", "999", "", "İADE", "toString"]) assert.equal(mapArasShipmentStatus(state), null);
for (const state of ["teslim edildi", "DELIVERED", "TESLİM EDİLDİ"]) assert.equal(mapArasShipmentStatus(state), "delivered");
for (const state of ["TRANSFERDE", "DAĞITIMDA", "in transit"]) assert.equal(mapArasShipmentStatus(state), "dispatched");
const faults = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultstring>fixture-password-only receiver-secret</faultstring></soap:Fault></soap:Body></soap:Envelope>`;
for (const status of [200, 500]) {
  const client = new ArasSoapClient("test", async () => new Response(faults, { status }));
  await assert.rejects(client.call("GetCityList", ""), (error) => error.code === "soap_fault" && !error.message.includes("fixture-password"));
}
for (const xml of ["<bad", soap("WrongOperation", ""), soap("GetCityList", "").replace("Envelope>", "Broken>"),
  '<!DOCTYPE x [<!ENTITY ext SYSTEM "file:///etc/passwd">]>' + soap("GetCityList", "&ext;"),
  soap("GetCityList", "<x>".repeat(45) + "</x>".repeat(45))]) {
  assert.throws(() => parseSoapResult(xml, "GetCityList"), (error) => error.code === "malformed_xml");
}
await assert.rejects(new ArasSoapClient("test", async () => new Response("Unavailable fixture-password-only", { status: 503 })).call("GetCityList", ""), (error) => error.code === "http_error" && error.httpStatus === 503);
await assert.rejects(new ArasSoapClient("test", async () => { throw new Error("fixture-password-only"); }).call("GetCityList", ""), (error) => error.code === "network_error" && !error.message.includes("fixture-password"));
await assert.rejects(new ArasSoapClient("test", async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("raw secret")))), 5).call("GetCityList", ""), (error) => error.code === "timeout");
await assert.rejects(new ArasSoapClient("test", async () => new Response("x".repeat(512 * 1024 + 1))).call("GetCityList", ""), (error) => error.code === "response_too_large");
await assert.rejects(new ArasSoapClient("test", async () => new Response("x", { headers: { "content-length": "999999" } })).call("GetCityList", ""), (error) => error.code === "response_too_large");
await assert.rejects(new ArasShippingProviderAdapter(testCredentials, () => true, { fetchImpl: async () => new Response(orderResponse("other-id")) }).findShipment("same-id"), (error) => error.code === "reference_mismatch");
await assert.rejects(adapter.createShipment({ ...adapterInput, delivery: { method: "pickup" } }), (error) => error.code === "invalid_delivery");
await assert.rejects(new ArasShippingProviderAdapter(testCredentials, () => false, { fetchImpl: fixtureHttp().fetchImpl }).createShipment(adapterInput), (error) => error.code === "registration_pending");
await assert.rejects(new ArasShippingProviderAdapter(testCredentials, () => false, { fetchImpl: async () => new Response(dataTable("GetCityList")) }).testConnection(), (error) => error.code === "auth_unverified");

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-aras-provider-"));
const database = new DesktopDatabase({ appPath: join(process.cwd(), "apps/desktop-app"), userDataPath: dataDir });
let raw;
try {
  database.initialize();
  const setup = { businessName: "Aras Fixture", profileId: "market", profileOptions: [C.WHOLESALE], phone: "", whatsapp: "", email: "", address: "",
    webModuleUrl: "https://example.test", syncSecret: "aras-test-only-secret", autoSyncEnabled: false,
    aiEnabled: false, aiProvider: "openai_compatible", aiService: "openai", aiProjectName: "", aiModel: "", aiBaseUrl: "https://api.openai.com/v1", aiTimeoutSeconds: 30, aiApiKey: "", clearAiApiKey: false,
    servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: [] };
  assert.equal(database.saveInitialSetup(setup).ok, true);
  const product = saveRuntimeCatalogProduct(database.databasePath, { name: "Fixture Product", salePrice: 10, isActive: true, trackInventory: false });
  const orderInput = { deliverySnapshot: delivery, buyerSnapshot: { name: "Contact Secret", phone: "05550000000" }, items: [{ productId: product.id, quantity: 1 }] };
  const newShipment = () => database.createShipmentForOrder(createRuntimeOrder(database.databasePath, orderInput).order.id);
  const network = fixtureHttp();
  const secrets = fixtureSecretService();
  const logs = [];
  const service = fixtureShippingService(() => database, network, secrets, logs);
  raw = new DatabaseSync(database.databasePath);
  assert.equal(service.getConfiguration().configured, false);
  const unconfigured = newShipment();
  await assert.rejects(service.registerShipment(unconfigured.id), (error) => error.code === "unconfigured");
  assert.equal(network.calls.length, 0);
  assert.equal(database.getShipmentRegistration(unconfigured.id), null);
  assert.equal((await service.testConnection()).ok, false);
  assert.equal(database.getShipment(unconfigured.id).status, "draft");
  assert.throws(() => database.createShipmentForOrder(createRuntimeOrder(database.databasePath, { ...orderInput, deliverySnapshot: { method: "pickup" } }).order.id), /Yalnız kargo/);

  const config = { ...testCredentials, enabled: true };
  const write = secrets.createShippingSecretWrite(config);
  assert.equal(write.mode, "replace");
  assert.equal(secrets.decryptShippingSecret(write.encryptedValue), config.password);
  secrets.setBackend("basic_text");
  assert.throws(() => secrets.createShippingSecretWrite(config), /güvenli/);
  assert.equal(secrets.decryptShippingSecret(write.encryptedValue), "");
  secrets.setBackend("gnome_libsecret");
  secrets.setAvailable(false);
  assert.throws(() => secrets.createShippingSecretWrite(config), /güvenli/);
  secrets.setAvailable(true);
  const saved = database.saveInitialSetup({ ...setup, arasShipping: { ...config, password: "" } }, undefined, undefined, write);
  assert.equal(saved.ok, true);
  assert.equal(saved.setupData.arasShipping.configured, true);
  assert.ok(!JSON.stringify(saved.setupData).includes(config.password));
  assert.ok(!JSON.stringify(saved.setupData).includes("password_encrypted"));
  assert.equal(service.getConfiguration().configured, true);
  assert.equal((await service.testConnection()).ok, true);
  const beforePlaintext = raw.prepare("SELECT * FROM commerce_shipping_provider_config").get();
  assert.throws(() => database.saveInitialSetup({ ...setup, arasShipping: config }), /ana süreçte şifrelenmeli/, "plaintext cannot bypass the main secret writer");
  assert.deepEqual(raw.prepare("SELECT * FROM commerce_shipping_provider_config").get(), beforePlaintext);
  const initialConfig = raw.prepare("SELECT * FROM commerce_shipping_provider_config").get();
  await service.testConnection({ ...config, password: "draft-only-test-password" });
  assert.deepEqual(raw.prepare("SELECT * FROM commerce_shipping_provider_config").get(), initialConfig, "test has no persistence side effect");

  // The remote submission fence commits before I/O; receipt + local shipment commit together.
  for (const owner of ["registration", "shipment"]) {
    const shipment = newShipment();
    const before = database.getShipment(shipment.id);
    if (owner === "registration") raw.exec(`CREATE TRIGGER test_receipt_fail BEFORE UPDATE ON commerce_shipment_registrations
      WHEN NEW.state = 'registered' BEGIN SELECT RAISE(ABORT, 'injected_receipt'); END`);
    else raw.exec(`CREATE TRIGGER test_receipt_fail BEFORE UPDATE ON commerce_shipments
      BEGIN SELECT RAISE(ABORT, 'injected_shipment'); END`);
    await assert.rejects(service.registerShipment(shipment.id));
    assert.deepEqual(database.getShipment(shipment.id), before, `${owner} failure preserves local shipment`);
    assert.equal(database.getShipmentRegistration(shipment.id).state, "submitted", "receipt failure preserves no-resubmit fence and rolls back registered");
    const sent = network.calls.filter(call => call.operation === "SetOrder" && call.id === shipment.id).length;
    assert.equal(sent, 1);
    raw.exec("DROP TRIGGER test_receipt_fail");
    const recovered = await fixtureShippingService(() => database, network, secrets, logs).registerShipment(shipment.id);
    assert.equal(recovered.status, "draft");
    assert.equal(recovered.externalReference, shipment.id);
    assert.equal(database.getShipmentRegistration(shipment.id).state, "registered");
    assert.equal(network.calls.filter(call => call.operation === "SetOrder" && call.id === shipment.id).length, sent, "retry reconciles without a duplicate provider registration");
  }

  const pending = newShipment();
  const beforeOrder = database.getCommerceOrder(pending.orderId);
  network.state.lostSet = true;
  await assert.rejects(service.registerShipment(pending.id), (error) => error.code === "network_error");
  assert.equal(database.getShipment(pending.id).providerId, "");
  assert.equal(database.getShipmentRegistration(pending.id).state, "submitted");
  assert.deepEqual(database.getCommerceOrder(pending.orderId), beforeOrder);
  assert.throws(() => database.updateShipmentStatus({ shipmentId: pending.id, status: "ready" }), /belirsiz/);
  const callsBeforeRetry = network.calls.filter((call) => call.operation === "SetOrder").length;
  network.state.lostSet = false;
  const recovered = await fixtureShippingService(() => database, network, secrets, logs).registerShipment(pending.id);
  assert.equal(recovered.providerId, ARAS_SHIPPING_PROVIDER.id);
  assert.equal(recovered.externalReference, pending.id);
  assert.equal(recovered.status, "draft", "registration does not dispatch");
  assert.equal(network.calls.filter((call) => call.operation === "SetOrder").length, callsBeforeRetry, "restart reconciliation never resends");
  await service.registerShipment(pending.id);
  assert.equal(network.calls.filter((call) => call.operation === "SetOrder").length, callsBeforeRetry);
  assert.throws(() => database.updateShipmentStatus({ shipmentId: pending.id, status: "cancelled" }), /yerel olarak/);

  network.state.status = "hazırlanıyor receiver-secret";
  let refreshed = await service.refreshShipmentStatus(pending.id);
  assert.equal(refreshed.status, "draft");
  assert.equal(refreshed.trackingNumber, "1234567890123");
  network.state.trackingNumber = "NEW-BARCODE";
  refreshed = await service.refreshShipmentStatus(pending.id);
  assert.equal(refreshed.trackingNumber, "NEW-BARCODE");
  assert.equal(refreshed.trackingUrl, "", "a new barcode cannot retain an old tracking link");
  network.state.trackingNumber = "1234567890123";
  network.state.status = "TRANSFERDE";
  refreshed = await service.refreshShipmentStatus(pending.id);
  assert.equal(refreshed.status, "dispatched");
  assert.ok(refreshed.readyAt && refreshed.dispatchedAt);
  const timestamps = { readyAt: refreshed.readyAt, dispatchedAt: refreshed.dispatchedAt };
  network.state.status = "TESLİM EDİLDİ";
  refreshed = await service.refreshShipmentStatus(pending.id);
  assert.equal(refreshed.status, "delivered");
  assert.ok(refreshed.deliveredAt);
  assert.equal(refreshed.readyAt, timestamps.readyAt);
  assert.equal(refreshed.dispatchedAt, timestamps.dispatchedAt);
  network.state.status = "TRANSFERDE";
  assert.equal((await service.refreshShipmentStatus(pending.id)).status, "delivered");
  network.state.failQuery = true;
  const beforeFailedRefresh = database.getShipment(pending.id);
  await assert.rejects(service.refreshShipmentStatus(pending.id));
  assert.deepEqual(database.getShipment(pending.id), beforeFailedRefresh);
  network.state.failQuery = false;

  const absent = newShipment();
  network.state.pendingSet = true;
  await assert.rejects(service.registerShipment(absent.id), (error) => error.code === "registration_pending");
  const absentSends = network.calls.filter((call) => call.operation === "SetOrder").length;
  await assert.rejects(service.registerShipment(absent.id), (error) => error.code === "registration_pending");
  assert.equal(network.calls.filter((call) => call.operation === "SetOrder").length, absentSends);
  network.state.pendingSet = false;

  const parallel = newShipment();
  let release;
  network.state.delaySet = new Promise((resolve) => { release = resolve; });
  const running = service.registerShipment(parallel.id);
  await assert.rejects(service.registerShipment(parallel.id), (error) => error.code === "operation_busy");
  release(); await running; network.state.delaySet = null;
  assert.equal(network.calls.filter((call) => call.operation === "SetOrder" && call.id === parallel.id).length, 1);

  // Separate service instances share the durable boundary, independent of in-memory locks.
  const crossRuntime = newShipment();
  let releaseCrossRuntime;
  network.state.delaySet = new Promise((resolve) => { releaseCrossRuntime = resolve; });
  const firstRuntime = service.registerShipment(crossRuntime.id);
  for (let turn = 0; database.getShipmentRegistration(crossRuntime.id)?.state !== "submitted" && turn < 20; turn++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(database.getShipmentRegistration(crossRuntime.id).state, "submitted");
  await assert.rejects(fixtureShippingService(() => database, network, secrets).registerShipment(crossRuntime.id), (error) => error.code === "registration_pending");
  releaseCrossRuntime(); await firstRuntime; network.state.delaySet = null;
  assert.equal(network.calls.filter((call) => call.operation === "SetOrder" && call.id === crossRuntime.id).length, 1);

  // A cancellation committed before the atomic send boundary cannot send a parcel.
  const cancelled = newShipment();
  const fingerprint = database.getShipmentRegistration(crossRuntime.id).accountFingerprint;
  database.prepareShipmentRegistration({ shipmentId: cancelled.id, providerId: ARAS_SHIPPING_PROVIDER.id, integrationCode: cancelled.id, accountFingerprint: fingerprint });
  database.updateShipmentStatus({ shipmentId: cancelled.id, status: "cancelled" });
  assert.equal(database.markShipmentRegistrationSubmitted(cancelled.id), false);
  await assert.rejects(service.registerShipment(cancelled.id), (error) => error.code === "invalid_lifecycle");
  assert.equal(network.calls.filter((call) => call.operation === "SetOrder" && call.id === cancelled.id).length, 0);
  assert.equal(Number(raw.prepare("SELECT count(*) AS n FROM commerce_sales").get().n), 0);
  assert.equal(Number(raw.prepare("SELECT count(*) AS n FROM inventory_movements").get().n), 0);
  assert.equal(Number(raw.prepare("SELECT count(*) AS n FROM commerce_order_fulfillments").get().n), 0);
  assert.deepEqual(database.getCommerceOrder(pending.orderId), beforeOrder);

  const changedEnvironment = database.saveInitialSetup({ ...setup, arasShipping: { ...config, password: "", environment: "production" } });
  assert.equal(changedEnvironment.ok, true);
  await assert.rejects(service.refreshShipmentStatus(pending.id), (error) => error.code === "account_changed");
  assert.ok(logs.some((record) => record.event === "shipping.provider.connection.test"));
  for (const event of ["shipping.provider.create.started", "shipping.provider.create.succeeded", "shipping.provider.create.failed", "shipping.provider.status.refresh.started", "shipping.provider.status.refresh.succeeded", "shipping.provider.status.refresh.failed"]) assert.ok(logs.some((record) => record.event === event), event);
  const logText = JSON.stringify(logs);
  for (const sensitive of [config.password, config.username, "Receiver", "Private", "05550000000", "receiver-secret", "draft-only-test-password", "<soap:", "ResultMessage"]) assert.ok(!logText.includes(sensitive), `Logs leaked ${sensitive}`);
  const clear = database.saveInitialSetup({ ...setup, arasShipping: { ...config, password: "", clearPassword: true } }, undefined, undefined, { mode: "clear" });
  assert.equal(clear.setupData.arasShipping.hasSecret, false);
  assert.equal(clear.setupData.arasShipping.configured, false);

  // Exercise the real IPC module with the real service and session gate; no raw error body crosses IPC.
  const ipcExports = {};
  const handlers = new Map();
  let locked = false;
  runInNewContext(readFileSync(new URL("../apps/desktop-app/dist-electron/ipc/shipping-provider-ipc.js", import.meta.url), "utf8"), {
    exports: ipcExports, require: (name) => name === "electron" ? { ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) } }
      : require("../apps/desktop-app/dist-electron/shipping/shipping-provider-error.js")
  });
  ipcExports.registerShippingProviderIpcHandlers({ service, assertUnlocked: () => { if (locked) throw new Error("locked"); }, onChanged: () => {} });
  const rejected = await handlers.get("commerce:shipping:registerShipment")({}, pending.id);
  assert.equal(rejected.ok, false); assert.equal(rejected.code, "unconfigured");
  const read = handlers.get("commerce:shipping:configuration")({});
  assert.ok(!("password" in read)); assert.ok(!("password_encrypted" in read));
  locked = true;
  for (const fn of handlers.values()) await assert.rejects(async () => fn({}, pending.id), /locked/);
  console.log("commerce-aras-provider-smoke-ok");
} finally {
  raw?.close(); database.close(); rmSync(dataDir, { recursive: true, force: true });
}
