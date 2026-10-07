import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { seedSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";

const require = createRequire(import.meta.url);
const schemaPath = "apps/desktop-app/db/schema.sql";
const schemaSql = readFileSync(schemaPath, "utf8");
const { currentDesktopSchemaProblem, inspectDesktopDatabaseCompatibility, CURRENT_DESKTOP_SCHEMA_ERROR } = require("../apps/desktop-app/dist-electron/desktop-database-compatibility.js");
const { DesktopFinanceService } = require("../apps/desktop-app/dist-electron/finance.js");
const { getBusinessPublicProfile, saveBusinessPublicProfile } = require("../apps/desktop-app/dist-electron/business-public-profile.js");
let kbs;
const originalLoad = Module._load;
try {
  Module._load = function (id, ...args) {
    return id === "electron" ? { safeStorage: {
      isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "fixture",
      encryptString: value => Buffer.from(value), decryptString: value => value.toString()
    } } : originalLoad.call(this, id, ...args);
  };
  kbs = require("../apps/desktop-app/dist-electron/kbs-settings.js");
} finally { Module._load = originalLoad; }

const ok = result => { assert.equal(result.ok, true, result.message); return result; };
const now = new Date("2035-06-01T12:00:00.000Z");
const catalog = db => db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
const tableExists = (db, name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));

function assertRemovedObjects(db) {
  for (const name of ["sync_records", "notifications", "menu_items", "menu_stock_movements"]) assert.equal(tableExists(db, name), false, `${name} must not be recreated`);
  for (const [table, removed] of [
    ["pension_payments", ["stay_id"]], ["sync_outbox", ["claim_token", "claimed_at"]],
    ["birthday_message_deliveries", ["claim_token", "claimed_at"]]
  ]) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
    for (const column of removed) assert.equal(columns.includes(column), false, `${table}.${column} must not exist`);
  }
  // These similarly named workflows are live and explicitly outside this cleanup.
  for (const [table, columns] of [["messaging_outbox", ["claim_token", "claimed_at"]], ["marketing_schedule_executions", ["claimed_at"]]]) {
    const actual = db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
    for (const column of columns) assert.ok(actual.includes(column), `${table}.${column} must remain`);
  }
}

function withMemorySchema(sql, operation) {
  const db = new DatabaseSync(":memory:");
  try { db.exec("PRAGMA foreign_keys = ON"); db.exec(sql); operation(db); }
  finally { db.close(); }
}

withMemorySchema(schemaSql, db => {
  assertRemovedObjects(db);
  assert.equal(currentDesktopSchemaProblem(db, schemaSql), "");
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  // Actual enforcement, not just catalog names: a missing actor and invalid FK fail.
   const movement = db.prepare(`INSERT INTO inventory_movements
     (id, business_id, product_id, location_id, movement_type, quantity_delta, quantity_after, actor_source, created_at)
     VALUES (?, 'missing-business', 'missing-product', 'missing-location', 'adjust', 1, 1, ?, ?)`);
  assert.throws(() => movement.run("not-null", null, now.toISOString()), /NOT NULL/);
  assert.throws(() => movement.run("foreign-key", "desktop", now.toISOString()), /FOREIGN KEY/);
  db.prepare("INSERT INTO customers (id, full_name, phone, created_at, updated_at) VALUES ('guest', 'Guest', '', ?, ?)").run(now.toISOString(), now.toISOString());
  assert.equal(db.prepare("SELECT birthday_message_enabled FROM customers WHERE id = 'guest'").get().birthday_message_enabled, 1);
  const delivery = db.prepare(`INSERT INTO birthday_message_deliveries
    (id, customer_id, birthday_year, birthday_date, mode, message, created_at, updated_at)
    VALUES (?, 'guest', 2035, '2035-06-01', 'manual', 'Fixture', ?, ?)`);
  delivery.run("delivery-one", now.toISOString(), now.toISOString());
  assert.throws(() => delivery.run("delivery-two", now.toISOString(), now.toISOString()), /UNIQUE/);
});

// Drift with all table/column names still present must be rejected. No giant DDL snapshots.
for (const [from, to, expected] of [
  ["actor_source TEXT NOT NULL DEFAULT 'desktop'", "actor_source TEXT DEFAULT 'desktop'", "table:inventory_movements"],
  ["birthday_message_enabled INTEGER NOT NULL DEFAULT 1", "birthday_message_enabled INTEGER NOT NULL DEFAULT 0", "table:customers"],
  ["product_id TEXT NOT NULL REFERENCES catalog_products(id),\n  category_id", "product_id TEXT NOT NULL REFERENCES menu_categories(id),\n  category_id", "table:menu_product_entries"],
  ["UNIQUE (customer_id, birthday_year),", "", "table:birthday_message_deliveries"]
]) {
  const changed = schemaSql.replace(from, to);
  assert.notEqual(changed, schemaSql, `Drift fixture must change ${from}`);
  withMemorySchema(changed, db => {
    const problem = currentDesktopSchemaProblem(db, schemaSql);
    assert.ok(problem.includes(expected), `${expected}: ${problem}`);
  });
}
withMemorySchema(schemaSql, db => {
  const index = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'idx_inventory_locations_primary_unique'").get().sql;
  db.exec("DROP INDEX idx_inventory_locations_primary_unique");
  assert.match(currentDesktopSchemaProblem(db, schemaSql), /Eksik şema nesnesi: index:idx_inventory_locations_primary_unique/);
  db.exec(index.replace("CREATE UNIQUE INDEX", "CREATE INDEX"));
  assert.match(currentDesktopSchemaProblem(db, schemaSql), /Şema tanımı farklı: index:idx_inventory_locations_primary_unique/);
});
withMemorySchema(schemaSql, db => {
  db.exec("DROP TRIGGER trg_pension_payment_remaining_guard");
  assert.match(currentDesktopSchemaProblem(db, schemaSql), /Eksik şema nesnesi: trigger:trg_pension_payment_remaining_guard/);
  db.exec("CREATE TRIGGER trg_pension_payment_remaining_guard BEFORE INSERT ON pension_payments BEGIN SELECT 1; END");
  assert.match(currentDesktopSchemaProblem(db, schemaSql), /Şema tanımı farklı: trigger:trg_pension_payment_remaining_guard/);
});
withMemorySchema(schemaSql, db => {
  db.exec("ALTER TABLE sync_outbox ADD COLUMN claim_token TEXT NOT NULL DEFAULT ''");
  assert.match(currentDesktopSchemaProblem(db, schemaSql), /Şema tanımı farklı: table:sync_outbox/);
});
withMemorySchema(schemaSql, db => {
  db.exec("CREATE TABLE notifications (id TEXT PRIMARY KEY)");
  assert.match(currentDesktopSchemaProblem(db, schemaSql), /Beklenmeyen şema nesnesi: table:notifications/);
});

const { database, cleanup } = createTemporaryDesktopDatabase("schema-authority-");
let raw;
try {
  database.initialize();
  raw = new DatabaseSync(database.databasePath);
  raw.exec("PRAGMA foreign_keys = ON");
  const baseline = catalog(raw);
  const runtimeDDL = [];
  const originalExec = DatabaseSync.prototype.exec;
  try {
    DatabaseSync.prototype.exec = function (sql) {
      const file = this.prepare("PRAGMA database_list").all().find(row => row.name === "main")?.file;
      if (file && /\b(?:CREATE|ALTER|DROP)\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|TRIGGER|VIEW)\b/i.test(sql)) runtimeDDL.push(sql);
      return originalExec.call(this, sql);
    };
    ok(database.saveInitialSetup(createSmokeSetupInput({ businessName: "Schema authority", phone: "+905550095901", whatsapp: "+905550095901",
      syncSecret: "schema-authority-regression", servicePreferences: { whatsapp: true, android: true } })));
    seedSmokeBusinessLayout(database.databasePath, { roomCount: 1, nightlyPriceMinor: 1000 });
    const path = database.databasePath;
    const finance = new DesktopFinanceService(path);
    assert.ok(finance.getData().categories.length > 0, "Finance data seeds must remain");
    ok(finance.saveManualEntry({ direction: "income", amountMinor: 1000, paymentMethod: "cash", category: "other_income", description: "Fixture" }));
    const profile = { ...getBusinessPublicProfile(path), description: "Fixture", socialLinks: [{ platform: "instagram", url: "https://instagram.com/schema_fixture" }] };
    ok(saveBusinessPublicProfile(path, profile));
    assert.deepEqual(getBusinessPublicProfile(path), profile);
    const guest = ok(database.saveCustomer({ fullName: "Schema guest", phone: "+905550095902", email: "", notes: "", tags: [], birthDate: "1990-06-01" })).savedId;
    ok(database.prepareBirthdayWhatsApp(guest, now));
    raw.prepare("UPDATE settings SET birthday_mode = 'automatic', birthday_send_time = '00:00'").run();
    ok(database.claimAutomaticBirthdayDelivery(guest, now));
    assert.equal(database.claimAutomaticBirthdayDelivery(guest, now).code, "retry_wait");
    assert.equal(database.markBirthdayDeliverySent(guest, 2035, now).status, "sent");
    assert.equal(database.claimAutomaticBirthdayDelivery(guest, now).code, "already_sent");
    const firstJob = database.getPendingSyncJobs().find(job => job.jobType === "menu_publish");
    database.queueSyncJob("menu_publish");
    const newer = database.getPendingSyncJobs().find(job => job.jobType === "menu_publish");
    assert.ok(newer.sourceRevision > firstJob.sourceRevision);
    database.completeSyncJob(firstJob.jobKey, firstJob.sourceRevision);
    assert.ok(database.getPendingSyncJobs().some(job => job.jobKey === firstJob.jobKey));
    database.failSyncJob(newer.jobKey, newer.sourceRevision, "fixture failure", "2035-06-02T12:00:00.000Z");
    assert.equal(database.getPendingSyncJobs(now.toISOString()).some(job => job.jobKey === newer.jobKey), false);
    database.completeSyncJob(newer.jobKey, newer.sourceRevision);
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM sync_outbox WHERE job_key = ?").get(newer.jobKey).n, 0);
    const roomId = database.getDashboardData().rooms[0].id;
    const stay = ok(database.assignCustomerToRoom({ customerId: guest, roomId, checkInDate: "2035-06-01", checkOutDate: "2035-06-02", guestCount: 1, notes: "", status: "checked_in" }));
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM stay_guests WHERE stay_id = ? AND status = 'checked_in'").get(stay.savedId).n, 1);
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM hospitality_notifications").get().n, 0);
    assert.equal(kbs.getKbsSettings(path).enabled, false);
    ok(await kbs.testKbsConnection(path, { enabled: true, provider: "egm", facilityCode: "123456", username: "fixture",
      authorizedIdentityNumber: "10000000146", password: "fixture-not-a-real-secret", clearPassword: false }));
    ok(kbs.saveKbsSettings(path, { enabled: true, provider: "egm", facilityCode: "123456", username: "fixture",
      authorizedIdentityNumber: "10000000146", password: "fixture-not-a-real-secret", clearPassword: false }));
    assert.equal(kbs.getKbsSettings(path).passwordConfigured, true);
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM hospitality_notifications WHERE kind = 'arrival'").get().n, 1,
      "Opt-in arrival data backfill is live product behavior, not a schema migration");
    ok(database.checkoutStay(stay.savedId));
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM hospitality_notifications WHERE kind = 'departure'").get().n, 1);
    assert.equal(raw.prepare("SELECT status FROM stay_guests WHERE stay_id = ?").get(stay.savedId).status, "checked_out");
    const request = ok(database.createManualRequest({ requestType: "general", customerName: "Fixture request", customerPhone: "+905550095903",
      dateText: "", startDate: "", endDate: "", time: "", guestCount: 1, adultCount: 1, childCount: 0, message: "Fixture", priority: "normal" }));
    ok(database.deleteRequest(request.savedId));
    const disposable = ok(database.saveCustomer({ fullName: "Disposable", phone: "", email: "", notes: "", tags: [] })).savedId;
    ok(database.deleteCustomer(disposable));
    database.initialize();
    assert.equal(runtimeDDL.length, 0, "Startup and domain operations must not issue persistent DDL");
    assert.deepEqual(catalog(raw), baseline);
    assertRemovedObjects(raw);
  } finally { DatabaseSync.prototype.exec = originalExec; }

  // Missing domain structures fail rather than getting silently repaired.
  for (const [table, operation] of [
    ["finance_categories", () => new DesktopFinanceService(database.databasePath).getData()],
    ["business_public_social_links", () => getBusinessPublicProfile(database.databasePath)],
    ["kbs_service_settings", () => kbs.getKbsSettings(database.databasePath)]
  ]) {
    const definition = raw.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table).sql;
    raw.exec(`DROP TABLE ${table}`);
    assert.throws(operation, /no such table/);
    assert.equal(tableExists(raw, table), false);
    assert.throws(() => database.initialize(), error => error.message === CURRENT_DESKTOP_SCHEMA_ERROR);
    assert.equal(tableExists(raw, table), false);
    raw.exec(definition);
  }
  for (const table of ["hospitality_entry_receipts", "hospitality_notifications", "stay_guests", "stay_room_history"]) raw.exec(`DROP TABLE ${table}`);
  const beforeStartup = catalog(raw);
  assert.equal(inspectDesktopDatabaseCompatibility(database.databasePath, schemaPath).state, "incompatible");
  assert.throws(() => database.initialize(), error => error.message === CURRENT_DESKTOP_SCHEMA_ERROR);
  assert.deepEqual(catalog(raw), beforeStartup, "Historical guest bootstrap/backfill must not run on an incompatible file");
} finally { raw?.close(); cleanup(); }
console.log("schema-authority-smoke-ok: canonical-only structures, constraint/index/trigger drift, no runtime repair, live workflows and clean-start rejection");
