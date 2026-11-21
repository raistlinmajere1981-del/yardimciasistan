import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const { selectStockReportRows, composeStockReportHtml } =
  require("../apps/desktop-app/dist-electron/document-output-stock-report.js");
const rows = Array.from({length:1200}, (_, i) => ({
  productId: "product_" + i, name: i === 0 ? "<script>alert(1)</script>" : "Ürün " + i,
  sku: i === 0 ? "=danger" : "SKU-" + i, categoryId: i % 2 ? "a" : "b",
  categoryName: i === 0 ? "Kategori & Özel" : "Kategori", unit: "piece",
  quantity: i % 10, minimumQuantity: 5, idealQuantity: 20, suggestedQuantity: 20 - i % 10
}));
const all = selectStockReportRows(rows, {scope:"all"});
assert.equal(all.length,1200);
const subset = selectStockReportRows(rows, {scope:"selected",productIds:["product_4","product_1001"]});
assert.deepEqual(subset.map(row=>row.productId),["product_4","product_1001"]);
for (const invalid of [
  null,{}, {scope:"all",html:"<img>"},{scope:"all",productIds:[]},{scope:"selected",productIds:[]},
  {scope:"selected",productIds:["product_1","product_1"]},
  {scope:"selected",productIds:["product_99999"]},
  {scope:"selected",productIds:["<script>"]},
  {scope:"selected",productIds: Array.from({length:10001},(_,i)=>"x"+i)}
]) assert.throws(()=>selectStockReportRows(rows,invalid),/DOCUMENT_STOCK_/);
assert.throws(()=>selectStockReportRows([], {scope:"all"}),/DOCUMENT_STOCK_EMPTY/);
const html = composeStockReportHtml(all, "Firma <Örnek>", "21.11.2026");
assert.match(html, /size: A4 landscape/);
assert.match(html, /display:table-header-group/);
assert.match(html, /break-inside:avoid/);
assert.equal((html.match(/<tr>/g)??[]).length,1201);
assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.match(html, /Kategori &amp; Özel/);
assert.match(html, /Firma &lt;Örnek&gt;/);
assert.doesNotMatch(html, /<script>|<iframe>|<img /);
assert.match(html, /1200 ürün/);
console.log("stock-report-print-contract-ok: 1200 rows, sorted selection, rejected inputs, escaped HTML, multi-page A4");

const { DocumentOutputManagement } = require("../apps/desktop-app/dist-electron/document-output-management.js");
const { BUSINESS_CAPABILITIES: C } = require("@yardimci-asistan/shared");
const staging = mkdtempSync(join(tmpdir(), "stock-report-contract-"));
const db = new DatabaseSync(join(staging, "test.sqlite"));
try {
  db.exec(readFileSync("apps/desktop-app/db/schema.sql", "utf8"));
  db.prepare("INSERT INTO business (id,name,display_name,profile_id,created_at,updated_at) VALUES ('b','Fixture','Fixture','market','now','now')").run();
  db.prepare("INSERT INTO settings (id,business_id,created_at,updated_at) VALUES ('b','b','now','now')").run();
  const owner = new DocumentOutputManagement(db, { role:"desktop_owner", assertAuthorized(){} });
  const access = { documentKind:"stock_replenishment" };
  assert.throws(() => owner.read(access), /DOCUMENT_CAPABILITY_DISABLED/);
  for (const capability of [C.PRINTING, C.INVENTORY]) {
    db.prepare("INSERT INTO business_capabilities (business_id,capability_id,is_enabled,created_at,updated_at) VALUES ('b',?,1,'now','now')").run(capability);
  }
  assert.deepEqual(owner.read(access).rules, []);
  const rule = { ...access, trigger:"manual", channel:"print", mode:"ASK_CONFIRMATION", adapter:"native_print" };
  assert.throws(() => owner.saveRule({...rule, mode:"AUTOMATIC"}), /DOCUMENT_RULE_INVALID/);
  assert.throws(() => owner.saveRule({...rule, channel:"whatsapp",adapter:"whatsapp_webview"}), /DOCUMENT_RULE_INVALID/);
  assert.equal(owner.saveRule(rule).mode,"ASK_CONFIRMATION");
  assert.equal(owner.read(access).rules[0].mode,"ASK_CONFIRMATION");
  assert.equal(owner.savePrinterBinding({...access,printerRef:"Fixture Printer"}, "device-a", [{name:"Fixture Printer"}]).printerRef,"Fixture Printer");
  assert.equal(owner.readPrinterBinding(access,"device-a",[{name:"Fixture Printer"}]).printerRef,"Fixture Printer");
  const found = db.prepare("SELECT document_kind,mode FROM document_output_rules").get();
  assert.deepEqual({...found},{ document_kind:"stock_replenishment",mode:"ASK_CONFIRMATION" });
  console.log("stock-report-settings-contract-ok: persisted capability, manual policy, printer binding, forbidden automation");
} finally { db.close(); rmSync(staging,{recursive:true,force:true}); }
