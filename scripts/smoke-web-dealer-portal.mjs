import assert from "node:assert/strict";
import { activateFixtureSource } from "./test-helpers/publication-protocol.mjs";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";

const require = createRequire(import.meta.url);
const { PhpHostingSyncTransport } = require("../packages/sync-core/dist/index.js");
const { SyncCoordinator } = require("../apps/desktop-app/dist-electron/sync-coordinator.js");
const { createAndroidOperationsSnapshot } = require("../apps/desktop-app/dist-electron/android-operations-snapshot.js");
const { BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist/index.js");
const root = mkdtempSync(join(tmpdir(), "ya-web-dealer-"));
const hosting = join(root, "web-module");
cpSync(join(process.cwd(), "firm-template/web-module"), hosting, { recursive: true });
for (const file of ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm"]) rmSync(join(hosting, "data", file), { force: true });
const secret = "dealer-portal-test-secret";
const config = join(hosting, "config/business.json");
writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), sync_secret: secret }));
const port = await new Promise((resolve, reject) => {
  const server = http.createServer(); server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", hosting], { stdio: ["ignore", "pipe", "pipe"] });
let serverOutput = ""; let browser;
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });
const transport = new PhpHostingSyncTransport({ baseUrl, syncSecret: secret, clientId: "desktop-dealer-test", sourceEpoch: 1 });
function storage(code) {
  const result = spawnSync("php", ["-r", `require $argv[1]; $db = ya_storage_open(); ${code}`, join(hosting, "lib/storage.php")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : null;
}
const clearGuard = () => storage("if ($db->query(\"SELECT 1 FROM sqlite_master WHERE name = 'public_request_guard_events'\")->fetchColumn()) $db->exec('DELETE FROM public_request_guard_events');");
const accessId = randomUUID(); const customerRef = randomUUID();
let sourceRevision = 0; let accessRevision = Date.now();
const sentProjections = new Map();
let token = randomBytes(32).toString("base64url"); const tokens = [token];
let row = { access_id: accessId, customer_ref: customerRef, display_name: "Bayi <Şirket>", access_revision: accessRevision,
  enabled: true, invite_hash: createHash("sha256").update(token).digest("hex"), invite_expires_at: Math.floor(Date.now() / 1000) + 3600 };
async function publish({ rotate = false, enabled = true, expire = false, rows, extra = {} } = {}) {
  if (sourceRevision === 0) await activateFixtureSource(baseUrl, secret, "desktop-dealer-test");
  if (rotate) { token = randomBytes(32).toString("base64url"); tokens.push(token); accessRevision += 1; }
  row = { ...row, access_revision: accessRevision, enabled, invite_hash: enabled ? createHash("sha256").update(token).digest("hex") : "",
    invite_expires_at: expire ? Math.floor(Date.now() / 1000) - 1 : Math.floor(Date.now() / 1000) + 3600, ...extra };
  sourceRevision += 1;
  const value = { version: 1, enabled, dealers: structuredClone(rows ?? [row]) };
  sentProjections.set(sourceRevision, value);
  const result = await transport.publishDealerAccess({ sourceRevision, idempotencyKey: `dealer:${sourceRevision}`,
    value });
  assert.equal(result.ok, true, result.message);
  return result;
}
async function post(file, body = {}, { cookie = "", clear = true, headers = {}, method = "POST" } = {}) {
  if (clear) clearGuard();
  const response = await fetch(`${baseUrl}/api/dealer/${file}.php`, { method,
    headers: { "Content-Type": "application/json", "X-YA-Dealer": "1", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie"), headers: response.headers };
}
async function session(cookie = "") {
  const response = await fetch(`${baseUrl}/api/dealer/session.php`, { headers: cookie ? { Cookie: cookie } : {} });
  return { status: response.status, body: await response.json() };
}
const genericFailure = (result) => { assert.equal(result.status, 400); assert.deepEqual(result.body, { ok: false, message: "Bağlantı geçersiz veya süresi dolmuş." }); };
try {
  for (let attempt = 0; ; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/api/dealer/session.php`)).status === 401) break; } catch { /* startup */ }
    if (attempt > 100) throw new Error("PHP server did not start");
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  const capabilities = await transport.getCapabilities(); assert.equal(capabilities.ok, true); assert.ok(capabilities.features.includes("dealer_access_v1"));
  assert.deepEqual(await session(), { status: 401, body: { authenticated: false } });
  assert.equal((await post("claim", {}, { method: "GET" })).status, 405);
  assert.equal((await post("logout", {}, { method: "GET" })).status, 405);
  assert.equal((await post("claim", {}, { headers: { "X-YA-Dealer": "" } })).status, 403);
  assert.equal((await post("claim", {}, { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
  assert.equal((await post("logout", {}, { headers: { "Sec-Fetch-Site": "same-site" } })).status, 403);
  assert.equal((await post("claim", "x".repeat(1025))).status, 400);
  const syncGet = await fetch(`${baseUrl}/api/sync.php?action=publish_dealer_access`, { headers: { "X-YA-Sync-Secret": secret } }); assert.equal(syncGet.status, 405);
  const unauthorized = await fetch(`${baseUrl}/api/sync.php`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish_dealer_access" }) }); assert.equal(unauthorized.status, 401);
  await publish({ extra: { phone: "PRIVATE_PHONE_SENTINEL", email: "PRIVATE_EMAIL_SENTINEL", tax_number: "PRIVATE_TAX_SENTINEL", notes: "PRIVATE_NOTES_SENTINEL" } });
  const privatePayload = storage("echo json_encode($db->query(\"SELECT payload_json FROM publications WHERE name = 'dealer_access_private'\")->fetchColumn());");
  for (const sentinel of ["PRIVATE_PHONE_SENTINEL", "PRIVATE_EMAIL_SENTINEL", "PRIVATE_TAX_SENTINEL", "PRIVATE_NOTES_SENTINEL"]) assert.equal(privatePayload.includes(sentinel), false);
  genericFailure(await post("claim", { invite_token: "wrong" }));
  const valid = await post("claim", { invite_token: token }); assert.equal(valid.status, 200); assert.deepEqual(valid.body, { ok: true });
  assert.match(valid.cookie, /HttpOnly/i); assert.match(valid.cookie, /SameSite=Strict/i); assert.match(valid.cookie, /path=\/api\/dealer\//i); assert.match(valid.cookie, /Max-Age=28800/);
  const cookie = valid.cookie.split(";")[0]; const sessionToken = cookie.split("=")[1];
  assert.equal(sessionToken.length, 43);
  assert.deepEqual(await session(cookie), { status: 200, body: { authenticated: true, dealer: { access_id: accessId, display_name: row.display_name } } });
  genericFailure(await post("claim", { invite_token: token }));
  await publish(); // A newer source publication with unchanged access revision cannot unconsume an invite.
  genericFailure(await post("claim", { invite_token: token }));
  const receiptReplay = await transport.publishDealerAccess({ sourceRevision: 1, idempotencyKey: "dealer:1", value: sentProjections.get(1) }); assert.equal(receiptReplay.deduplicated, true);
  assert.equal((await session(cookie)).status, 200);
  const persisted = storage("echo json_encode(['access' => $db->query('SELECT * FROM dealer_access')->fetchAll(), 'sessions' => $db->query('SELECT * FROM dealer_sessions')->fetchAll()]);");
  assert.equal(persisted.sessions[0].session_hash, createHash("sha256").update(sessionToken).digest("hex"));
  assert.equal(JSON.stringify(persisted).includes(sessionToken), false); assert.equal(JSON.stringify(persisted).includes(token), false);
  const cookieSecurity = spawnSync("php", ["-r", "require $argv[1]; $_SERVER['SCRIPT_NAME'] = '/nested/api/dealer/claim.php'; echo json_encode(ya_dealer_cookie_options());", join(hosting, "lib/dealer-access.php")], { encoding: "utf8" });
  assert.equal(cookieSecurity.status, 0); const options = JSON.parse(cookieSecurity.stdout);
  assert.equal(options.secure, true); assert.equal(options.httponly, true); assert.equal(options.samesite, "Strict"); assert.equal(options.path, "/nested/api/dealer/");
  storage("$db->exec('UPDATE dealer_sessions SET expires_at = 1');");
  assert.equal((await session(cookie)).status, 401, "absolute session expiry is server authoritative");
  const old = token; await publish({ rotate: true });
  assert.equal((await session(cookie)).status, 401); genericFailure(await post("claim", { invite_token: old }));
  const second = await post("claim", { invite_token: token }); assert.equal(second.status, 200);
  const cookieTwo = second.cookie.split(";")[0];
  const logout = await post("logout", {}, { cookie: cookieTwo }); assert.equal(logout.status, 200); assert.match(logout.cookie, /Max-Age=0/); assert.equal((await session(cookieTwo)).status, 401);
  await publish({ rotate: true, expire: true }); genericFailure(await post("claim", { invite_token: token }));
  await publish({ rotate: true, enabled: false }); genericFailure(await post("claim", { invite_token: token }));
  await publish({ rotate: true });
  clearGuard();
  const race = await Promise.all([post("claim", { invite_token: token }, { clear: false }), post("claim", { invite_token: token }, { clear: false })]);
  assert.deepEqual(race.map((item) => item.status).sort(), [200, 400]);
  const raceCookie = race.find((item) => item.status === 200).cookie.split(";")[0];
  accessRevision += 1; await publish({ extra: { invite_hash: "" } }); // revoke every session and invite without disabling authorization
  assert.equal((await session(raceCookie)).status, 401); genericFailure(await post("claim", { invite_token: token }));
  const stale = await transport.publishDealerAccess({ sourceRevision: sourceRevision + 1, idempotencyKey: "stale-dealer-access", value: { version: 1, enabled: true, dealers: [{ ...row, access_revision: accessRevision - 1 }] } }); assert.equal(stale.ok, false);
  assert.equal(storage("echo json_encode($db->query(\"SELECT COUNT(*) FROM publication_receipts WHERE idempotency_key = 'stale-dealer-access'\")->fetchColumn());"), 0);
  await publish({ rotate: true });
  const missing = await post("claim", { invite_token: token }); const missingCookie = missing.cookie.split(";")[0];
  await publish({ rows: [] }); assert.equal((await session(missingCookie)).status, 401); genericFailure(await post("claim", { invite_token: token }));
  await publish({ rotate: true });
  clearGuard();
  for (let count = 0; count < 8; count += 1) genericFailure(await post("claim", { invite_token: "invalid" }, { clear: false }));
  const limited = await post("claim", { invite_token: token }, { clear: false }); assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "120");
  assert.equal(storage("echo json_encode($db->query(\"SELECT COUNT(*) FROM public_request_guard_events WHERE subject_hash = '127.0.0.1'\")->fetchColumn());"), 0);
  clearGuard();
  browser = await launchChromiumForSmoke(chromium);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "tr-TR" });
  const page = await context.newPage(); page.setDefaultTimeout(10000); const errors = []; const urls = [];
  page.on("pageerror", (error) => errors.push(error.message)); page.on("request", (request) => urls.push(request.url()));
  await page.goto(`${baseUrl}/bayi/#invite=${token}`);
  await expect(page.getByRole("button", { name: "Daveti kullan" })).toBeVisible(); assert.equal(new URL(page.url()).hash, "");
  await page.getByRole("button", { name: "Daveti kullan" }).click();
  await expect(page.getByRole("heading", { name: "Bayi paneli" })).toBeVisible();
  await expect(page.locator("#dealer-name")).toHaveText("Bayi <Şirket>");
  assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie })), { local: 0, session: 0, cookie: "" });
  assert.ok(urls.every((url) => !tokens.some((value) => url.includes(value))));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.reload(); await expect(page.getByRole("heading", { name: "Bayi paneli" })).toBeVisible();
  await page.getByRole("button", { name: "Oturumu kapat" }).click(); await expect(page.getByRole("heading", { name: "Bayi erişimi gerekli" })).toBeVisible();
  await publish({ rotate: true });
  await page.goto(`${baseUrl}/bayi/#invite=${token}`); await page.getByRole("button", { name: "Daveti kullan" }).click(); await expect(page.getByRole("heading", { name: "Bayi paneli" })).toBeVisible();
  await publish({ enabled: false, rotate: true }); await page.reload(); await expect(page.getByRole("heading", { name: "Bayi erişimi gerekli" })).toBeVisible();
  assert.deepEqual(errors, []);
  const catalog = await (await fetch(`${baseUrl}/api/catalog.php`)).text(); assert.equal(catalog.includes(accessId), false); assert.equal(catalog.includes(customerRef), false);
  assert.equal(storage("echo json_encode($db->query(\"SELECT COUNT(*) FROM sqlite_master WHERE name = 'customers'\")->fetchColumn());"), 0);
  // Real Desktop facade -> durable outbox -> coordinator -> private hosting projection.
  const desktop = createTemporaryDesktopDatabase("ya-dealer-sync-");
  const database = desktop.database;
  try {
    database.initialize();
    const setup = database.saveInitialSetup({
    businessName: "Toptan Smoke",
    profileId: "market",
    profileOptions: [C.WHOLESALE],
    dealerPortalEnabled: true,
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: secret,
    autoSyncEnabled: false,
    aiEnabled: false,
    aiProvider: "openai_compatible",
    aiService: "openai",
    aiProjectName: "",
    aiModel: "",
    aiModelOptions: [],
    aiBaseUrl: "https://api.openai.com/v1",
    aiTimeoutSeconds: 30,
    aiApiKey: "",
    clearAiApiKey: false,
    servicePreferences: { whatsapp: false, android: false },
    initialCounts: { rooms: 0, tables: 0 },
    tableCategories: []
  });

    assert.equal(setup.ok, true, setup.message);
    // Explicit generation replacement between the transport-only fixture and
    // the canonical Desktop phase; an arbitrary first POST cannot take over.
    const clientId = database.getSyncRuntimeStatus().clientId;
    const activationResponse = await fetch(`${baseUrl}/api/sync.php`, { method: "POST", headers: {
      "Content-Type": "application/json", "X-YA-Sync-Secret": secret
    }, body: JSON.stringify({ action: "activate_publication_source", client_id: clientId, expected_epoch: 1, activation_key: `${clientId}:replace:1` }) });
    const activation = await activationResponse.json();
    assert.equal(activation.source_epoch, 2);
    database.savePublicationSourceEpoch(baseUrl, 2);
    const customer = database.saveCustomer({ fullName: "Canonical dealer", phone: "+905550004321", email: "", notes: "PRIVATE_CUSTOMER_NOTES_SENTINEL", tags: [],
      commercialProfile: { companyName: "Canonical company", dealerStatus: "active", priceGroup: "dealer_a" } });
    assert.equal(customer.ok, true, customer.message);
    const id = customer.savedId;
    database.changeDealerWebAccess(id, "enable");
    const invite = database.changeDealerWebAccess(id, "invite");
    const actualToken = new URL(invite.inviteUrl).hash.slice(8); tokens.push(actualToken);
    const coordinator = new SyncCoordinator({ database, getSyncConfig: () => ({ baseUrl, syncSecret: secret }),
      createAndroidSnapshot: () => createAndroidOperationsSnapshot(database, database.getDashboardData()),
      onDashboardChanged() {}, onStatusChanged() {} });
    const published = await coordinator.runNow(); assert.equal(published.ok, true, published.message);
    assert.equal(database.getPendingSyncJobs().some((job) => job.jobType === "dealer_access_publish"), false);
    const claimed = await post("claim", { invite_token: actualToken }); assert.equal(claimed.status, 200);
    const actualCookie = claimed.cookie.split(";")[0];
    const identity = await session(actualCookie);
    assert.equal(identity.status, 200); assert.equal(identity.body.dealer.access_id, invite.access.accessId);
    const storedProjection = storage("echo json_encode($db->query(\"SELECT payload_json FROM publications WHERE name = 'dealer_access_private'\")->fetchColumn());");
    for (const privateValue of [id, "+905550004321", "PRIVATE_CUSTOMER_NOTES_SENTINEL", actualToken]) assert.equal(storedProjection.includes(privateValue), false);
    database.changeDealerWebAccess(id, "revoke_sessions");
    assert.equal((await session(actualCookie)).status, 200, "offline local revocation cannot claim remote completion");
    const revoked = await coordinator.runNow(); assert.equal(revoked.ok, true, revoked.message);
    assert.equal((await session(actualCookie)).status, 401); genericFailure(await post("claim", { invite_token: actualToken }));
    const replacement = database.changeDealerWebAccess(id, "invite"); const replacementToken = new URL(replacement.inviteUrl).hash.slice(8); tokens.push(replacementToken);
    assert.equal((await coordinator.runNow()).ok, true);
    const activeSession = await post("claim", { invite_token: replacementToken }); assert.equal(activeSession.status, 200);
    database.changeDealerWebAccess(id, "disable"); assert.equal((await coordinator.runNow()).ok, true);
    assert.equal((await session(activeSession.cookie.split(";")[0])).status, 401);
    genericFailure(await post("claim", { invite_token: replacementToken }));
  } finally { desktop.cleanup(); }

  assert.deepEqual(storage("ya_storage_reset_runtime(); echo json_encode([$db->query('SELECT COUNT(*) FROM dealer_access')->fetchColumn(), $db->query('SELECT COUNT(*) FROM dealer_sessions')->fetchColumn()]);"), [0, 0]);
  assert.ok(tokens.every((value) => !serverOutput.includes(value))); assert.equal(serverOutput.includes(sessionToken), false);
  assert.match(serverOutput, /dealer.session.claim.succeeded/); assert.match(serverOutput, /dealer.session.claim.failed/); assert.match(serverOutput, /dealer.session.logout/);
  console.log("web-dealer-portal-smoke-ok");
} finally { await browser?.close(); server.kill(); await new Promise((resolve) => server.once("exit", resolve)); rmSync(root, { recursive: true, force: true }); }
