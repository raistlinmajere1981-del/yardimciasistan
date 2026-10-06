import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist/index.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-asistan-dealer-access-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataDir
});

const baseCustomer = (overrides = {}) => ({
  fullName: "Ticari Müşteri",
  phone: "05550001001",
  email: "ticari@example.test",
  notes: "",
  tags: [],
  identityType: "",
  identityNumber: "",
  nationality: "",
  birthDate: "",
  birthdayMessageEnabled: true,
  gender: "",
  documentSerialNumber: "",
  documentExpiryDate: "",
  birthPlace: "",
  motherName: "",
  fatherName: "",
  issuingAuthority: "",
  address: "",
  ...overrides
});

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
    syncSecret: "dealer-access-smoke-secret",
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
  assert.equal(setup.ok, true, setup.ok ? "" : setup.message);


  const raw = new DatabaseSync(database.databasePath);
  try {
    const create = (status) => database.saveCustomer(baseCustomer({ phone: "", email: "",
      commercialProfile: status ? { companyName: "Dealer Company", dealerStatus: status, priceGroup: "dealer_a" } : undefined }));
    const ordinary = create(); const candidate = create("candidate"); const inactive = create("inactive"); const active = create("active");
    for (const result of [ordinary, candidate, inactive, active]) assert.equal(result.ok, true, result.message);
    for (const result of [ordinary, candidate, inactive]) assert.throws(() => database.changeDealerWebAccess(result.savedId, "enable"), /aktif bayi/);
    const id = active.savedId;
    assert.equal(database.getSetupData().dealerPortalEnabled, true);
    assert.equal(database.getDealerWebAccess(id), null);
    assert.throws(() => database.changeDealerWebAccess(id, "unknown"), /geçersiz/);
    assert.throws(() => database.changeDealerWebAccess(id, "invite"), /etkinleştirin/);
    const enabled = database.changeDealerWebAccess(id, "enable");
    assert.equal(enabled.access.enabled, true);
    const issued = database.changeDealerWebAccess(id, "invite");
    const token = new URL(issued.inviteUrl).hash.slice(8);
    assert.equal(token.length, 43); assert.equal(new URL(issued.inviteUrl).search, "");
    const stored = raw.prepare("SELECT * FROM commerce_dealer_web_access WHERE customer_id = ?").get(id);
    assert.equal(stored.invite_hash, createHash("sha256").update(token).digest("hex"));
    assert.equal(JSON.stringify(stored).includes(token), false);
    assert.ok(Date.parse(stored.invite_expires_at) - Date.parse(stored.invite_issued_at) <= 72 * 3600_000 + 1000);
    assert.ok(Date.parse(stored.invite_expires_at) > Date.now());
    assert.equal("invite_hash" in issued.access, false);
    const projection = database.createDealerAccessProjection();
    assert.equal(projection.enabled, true); assert.equal(projection.dealers.length, 1);
    assert.deepEqual(Object.keys(projection.dealers[0]).sort(), ["access_id", "customer_ref", "display_name", "access_revision", "enabled", "invite_hash", "invite_expires_at"].sort());
    assert.notEqual(projection.dealers[0].customer_ref, id);
    assert.equal(JSON.stringify(projection).includes(id), false);
    const rotated = database.changeDealerWebAccess(id, "invite");
    assert.notEqual(rotated.inviteUrl, issued.inviteUrl); assert.ok(rotated.access.accessRevision > issued.access.accessRevision);
    const revoked = database.changeDealerWebAccess(id, "revoke_sessions");
    assert.equal(revoked.access.enabled, true); assert.ok(revoked.access.accessRevision > rotated.access.accessRevision);
    assert.equal(database.createDealerAccessProjection().dealers[0].invite_hash, "");
    database.changeDealerWebAccess(id, "disable");
    assert.equal(database.createDealerAccessProjection().dealers[0].enabled, false);
    assert.throws(() => database.changeDealerWebAccess(id, "invite"), /etkinleştirin/);
    database.changeDealerWebAccess(id, "enable"); database.changeDealerWebAccess(id, "invite");
    raw.prepare("UPDATE customer_commercial_profiles SET dealer_status = 'inactive' WHERE customer_id = ?").run(id);
    assert.equal(database.getDealerWebAccess(id).enabled, false);
    raw.prepare("UPDATE customer_commercial_profiles SET dealer_status = 'active' WHERE customer_id = ?").run(id);
    assert.equal(database.getDealerWebAccess(id).enabled, false, "reactivation cannot resurrect access");
    database.changeDealerWebAccess(id, "enable"); database.changeDealerWebAccess(id, "invite");
    raw.exec("UPDATE settings SET dealer_portal_enabled = 0");
    assert.equal(database.createDealerAccessProjection().enabled, false);
    assert.equal(database.getDealerWebAccess(id).enabled, false);
    assert.throws(() => database.changeDealerWebAccess(id, "enable"), /Servisler/);
    raw.exec("UPDATE settings SET dealer_portal_enabled = 1");
    database.changeDealerWebAccess(id, "enable");
    raw.exec("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id = 'commerce.wholesale'");
    assert.equal(database.createDealerAccessProjection().enabled, false);
    assert.throws(() => database.changeDealerWebAccess(id, "enable"), /etkin değil/);
    raw.exec("UPDATE business_capabilities SET is_enabled = 1 WHERE capability_id = 'commerce.wholesale'");
    assert.equal(database.getDealerWebAccess(id).enabled, false);
    database.changeDealerWebAccess(id, "enable");
    const beforeRestore = database.getDealerWebAccess(id).accessRevision;
    database.beginRestoreReconciliation("fixture-restore-dealer", "desktop-restore-dealer");
    assert.equal(database.getDealerWebAccess(id).enabled, true, "restore preserves canonical access intent; hosting sessions are epoch-fenced on normal apply");
    assert.equal(database.getDealerWebAccess(id).accessRevision, beforeRestore, "restore does not invent a wall-clock access revision");
    raw.prepare("DELETE FROM customer_commercial_profiles WHERE customer_id = ?").run(id);
    assert.equal(database.getDealerWebAccess(id).enabled, false);
    const job = database.getPendingSyncJobs().find((job) => job.jobType === "dealer_access_publish");
    assert.ok(job);
    database.completeSyncJob(job.jobKey, job.sourceRevision);
    raw.prepare("UPDATE customers SET full_name = 'Updated dealer' WHERE id = ?").run(id);
    const next = database.getPendingSyncJobs().find((job) => job.jobType === "dealer_access_publish");
    assert.ok(next.sourceRevision > job.sourceRevision, "outbox revision survives completion");
  } finally { raw.close(); }
  console.log("commerce-dealer-access-smoke-ok");
} finally {
  database.close(); rmSync(dataDir, { recursive: true, force: true });
}
