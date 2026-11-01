import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { load } from "./test-helpers/market-sale-benefits-fixture.mjs";

// Characterize the upgrade boundary without changing a real database or schema.
const { currentDesktopSchemaProblem, assertCurrentDesktopSchema } = load("desktop-database-compatibility");
const schema = readFileSync("apps/desktop-app/db/schema.sql", "utf8");
const previous = schema.replace(/CREATE TRIGGER trg_sale_source_immutable BEFORE UPDATE OF source ON commerce_sales\s+WHEN NEW\.source IS NOT OLD\.source\s+BEGIN SELECT RAISE\(ABORT, 'commerce_sale_source_immutable'\); END;/, "");
assert.notEqual(previous, schema);
const db = new DatabaseSync(":memory:");
try {
  db.exec(previous);
  assert.equal(currentDesktopSchemaProblem(db, previous), "");
  assert.equal(currentDesktopSchemaProblem(db, schema), "Eksik şema nesnesi: trigger:trg_sale_source_immutable");
  assert.throws(() => assertCurrentDesktopSchema(db, schema));
  assert.equal(currentDesktopSchemaProblem(db, previous), "");
  console.log("PASS existing database rejects proposed source-guard schema without upgrade");
} finally { db.close(); }
