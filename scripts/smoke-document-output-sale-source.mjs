import assert from "node:assert/strict";
import { test, after } from "node:test";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const root = mkdtempSync(join(tmpdir(), "sale-document-"));
for (const file of ["packages/shared/types/business-capabilities.ts", "packages/shared/types/document-output.ts", "apps/desktop-app/electron/document-output-render-snapshot.ts", "apps/desktop-app/electron/document-output-sale-source.ts"]) {
  const target = join(root, file.replace(/\.ts$/, ".js"));
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
}
mkdirSync(join(root, "node_modules/@yardimci-asistan/shared"), { recursive: true });
writeFileSync(join(root, "node_modules/@yardimci-asistan/shared/index.js"), 'module.exports = require("../../../packages/shared/types/document-output.js");');
const require = createRequire(import.meta.url);
const { readSaleDocumentSource: read } = require(join(root, "apps/desktop-app/electron/document-output-sale-source.js"));
const { createDocumentRenderSnapshot: render } = require(join(root, "apps/desktop-app/electron/document-output-render-snapshot.js"));
after(() => rmSync(root, { recursive: true, force: true }));
const field = binding => ({ binding, x: 0, y: 0, width: 100, height: 10 });
const layout = () => ({ unit: "mm10", pageWidth: 800, pageHeight: 2000, fields: [field("business.name"), field("totals.total")], lineBlock: { y: 100, rowHeight: 10, maxRows: 2, fields: [field("line.description"), field("line.total")] }, scan: null });
function fixture(t) {
  const db = new DatabaseSync(join(root, `${crypto.randomUUID()}.sqlite`)); t.after(() => db.close());
  db.exec(readFileSync("apps/desktop-app/db/schema.sql", "utf8"));
  db.exec(`INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES('b','İşletme','İşletme','market','now','now');
    INSERT INTO commerce_sales(id,business_id,status,subtotal,discount_total,total,currency,opened_at,closed_at,created_at,updated_at) VALUES('s','b','paid',25,2,23,'TRY','now','2026-10-28T12:30:00.000Z','now','now');
    INSERT INTO catalog_products(id,business_id,name,sale_price,created_at,updated_at) VALUES('p','b','Eski',10,'now','now');
    INSERT INTO commerce_sale_items(id,sale_id,product_id,product_name,barcode,unit_price,quantity,line_total,created_at) VALUES('i1','s','p','Eski','123',10,2,20,'a'),('i2','s','p','Diğer','456',5,1,5,'b');`);
  return db;
}
test("historical rows survive catalog edits and render without fabricated customer", t => {
  const db = fixture(t), first = read(db, "b", "s");
  assert.equal(first.values["business.name"], "İşletme"); assert.equal(first.values["customer.name"], null);
  assert.equal(first.values["document.date"], "28.10.2026 12:30:00 UTC");
  assert.match(first.values["document.number"], /^SAT-[A-F0-9]{16}$/);
  assert.equal(first.values["document.number"], read(db, "b", "s").values["document.number"]);
  assert.equal(first.values["totals.total"], "23,00"); assert.equal(first.discount, "2,00");
  assert.deepEqual(first.barcodes, ["123", "456"]);
  db.exec("UPDATE catalog_products SET name='Yeni',sale_price=99 WHERE id='p'");
  assert.deepEqual(read(db, "b", "s"), first);
  const snapshot = render("sale_receipt", layout(), first.values, first.lines);
  assert.deepEqual(snapshot.rows.map(row => row[0].text), ["Eski", "Diğer"]);
  assert.equal(snapshot.notice, "MALİ BELGE DEĞİLDİR");
  db.exec("INSERT INTO commerce_sales(id,business_id,customer_id,status,subtotal,discount_total,total,currency,payment_method,source,opened_at,closed_at,created_at,updated_at,deleted_at) SELECT 's2',business_id,customer_id,status,subtotal,discount_total,total,currency,payment_method,source,opened_at,closed_at,created_at,updated_at,deleted_at FROM commerce_sales WHERE id='s'; INSERT INTO commerce_sale_items SELECT id||'2','s2',product_id,product_name,barcode,unit_price,quantity,line_total,created_at FROM commerce_sale_items WHERE sale_id='s'");
  assert.notEqual(read(db, "b", "s2").values["document.number"], first.values["document.number"]);
});
test("scope, state, missing rows and invalid monetary data fail closed", t => {
  const db = fixture(t);
  assert.throws(() => read(db, "other", "s"));
  for (const [column, value] of [["status", "open"], ["status", "cancelled"], ["deleted_at", "now"], ["currency", "ZZZ"], ["closed_at", "bad"], ["total", 24], ["discount_total", -1]]) {
    const trial = fixture(t); trial.prepare(`UPDATE commerce_sales SET ${column}=?`).run(value);
    assert.throws(() => read(trial, "b", "s"));
  }
});
test("invalid lines, excess rows and missing or too-small line blocks fail closed", t => {
  const db = fixture(t);
  for (const sql of ["DELETE FROM commerce_sale_items", "UPDATE commerce_sale_items SET product_name='' WHERE id='i1'", "UPDATE commerce_sale_items SET product_name=printf('%.*c',5000,'x') WHERE id='i1'", "UPDATE commerce_sale_items SET line_total=19 WHERE id='i1'", "UPDATE commerce_sale_items SET quantity=0 WHERE id='i1'"]) {
    const trial = fixture(t); trial.exec(sql); assert.throws(() => read(trial, "b", "s"));
  }
  const source = read(db, "b", "s"), missing = layout(); missing.lineBlock = null;
  assert.throws(() => render("sale_receipt", missing, source.values, source.lines));
  const small = layout(); small.lineBlock.maxRows = 1;
  assert.throws(() => render("sale_receipt", small, source.values, source.lines));
  const insert = db.prepare("INSERT INTO commerce_sale_items VALUES(?, 's','p','x','',0,1,0,'z')");
  for (let i = 0; i < 199; i++) insert.run(`extra${i}`);
  assert.throws(() => read(db, "b", "s"));
});
