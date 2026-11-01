import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { prepareC19Fixture } from "./prepare-c19-fixture.mjs";

const schema = readFileSync(new URL("../apps/desktop-app/db/schema.sql", import.meta.url), "utf8");

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "c19-fixture-smoke-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "pilot.sqlite");
  const db = new DatabaseSync(path);
  db.exec(schema);
  db.prepare("INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES ('c19','C19 Test Market','C19 Test Market','market','fixture','fixture')").run();
  for (const cap of ["commerce.catalog", "commerce.inventory", "commerce.sales"]) {
    db.prepare("INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('c19',?,'fixture','fixture')").run(cap);
  }
  db.close();
  const edit = fn => { const connection = new DatabaseSync(path); try { return fn(connection); } finally { connection.close(); } };
  // Whole persisted state, including receipts/outbox/Finance, must remain equal on retry or refusal.
  const state = () => edit(connection => connection.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    .map(({ name }) => [name, connection.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
  const prepare = (overrides = {}) => prepareC19Fixture({ databasePath: path, businessId: "c19", offlineDisposablePilot: true, ...overrides });
  return { path, edit, state, prepare };
}

test("empty inventory gets canonical primary location and 20 units; exact retry and consumed stock are preserved", t => {
  const f = fixture(t);
  // Reproduce the pre-existing untracked C19 item, including its original version.
  f.edit(db => db.prepare(`INSERT INTO catalog_products(id,business_id,name,barcode,sale_price,currency,track_inventory,created_at,updated_at)
    VALUES ('existing-c19','c19','C19 Test Item','8690000000004',12.5,'TRY',0,'original','original')`).run());
  const first = f.prepare();
  assert.equal(first.productId, "existing-c19"); assert.equal(first.seeded, true); assert.equal(first.quantity, 20);
  f.edit(db => {
    const location = db.prepare("SELECT * FROM inventory_locations WHERE id=?").get(first.locationId);
    assert.equal(location.is_primary, 1); assert.equal(location.is_active, 1); assert.equal(location.business_id, "c19");
    const original = db.prepare("SELECT * FROM catalog_products WHERE id='existing-c19'").get();
    assert.equal(original.track_inventory, 0); assert.equal(original.updated_at, "original"); assert.equal(original.sale_price, 12.5);
    const movement = db.prepare("SELECT * FROM inventory_movements").get();
    assert.equal(movement.movement_type, "count"); assert.equal(movement.quantity_delta, 20);
    assert.equal(movement.reference_type, "c19_fixture"); assert.equal(movement.reference_id, "c19-opening-v1");
  });
  const before = f.state();
  assert.deepEqual(f.prepare(), { ...first, seeded: false }); assert.deepEqual(f.state(), before);
  // Even after the opening stock is fully consumed, preparation must not replenish it.
  f.edit(db => db.prepare("UPDATE inventory_balances SET quantity=0,updated_at='consumed' WHERE product_id=?").run(first.stockProductId));
  const consumed = f.state();
  assert.equal(f.prepare().quantity, 0); assert.deepEqual(f.state(), consumed);
});

test("explicit opt-in, business/capability gates and product conflict fail without partial writes", t => {
  const f = fixture(t), initial = f.state();
  assert.throws(() => f.prepare({ offlineDisposablePilot: false }), /Require/); assert.deepEqual(f.state(), initial);
  assert.throws(() => f.prepare({ businessId: "wrong" }), /matching/); assert.deepEqual(f.state(), initial);
  f.edit(db => db.exec("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id='commerce.inventory'"));
  const disabled = f.state(); assert.throws(() => f.prepare(), /capability/); assert.deepEqual(f.state(), disabled);
  f.edit(db => {
    db.exec("UPDATE business_capabilities SET is_enabled=1");
    db.prepare("INSERT INTO catalog_products(id,business_id,name,sku,created_at,updated_at) VALUES ('conflict','c19','Other product','C19-STOCK-ITEM','fixture','fixture')").run();
  });
  const conflict = f.state();
  assert.throws(() => f.prepare(), /identity/);
  assert.deepEqual(f.state(), conflict, "new location and first product must roll back on later conflict");
});

test("open database and SQLite sidecars refuse preparation before opening/writing the target", t => {
  const f = fixture(t), before = f.state();
  const db = new DatabaseSync(f.path);
  try { assert.throws(() => f.prepare(), /open in a process/); }
  finally { db.close(); }
  assert.deepEqual(f.state(), before);
  const marker = f.path + "-wal";
  writeFileSync(marker, "do not touch");
  assert.throws(() => f.prepare(), /sidecar/);
  assert.equal(readFileSync(marker, "utf8"), "do not touch");
  rmSync(marker); // Only this test's synthetic marker, never sandbox sidecars.
  assert.deepEqual(f.state(), before);
});
