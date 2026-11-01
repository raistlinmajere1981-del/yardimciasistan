import assert from "node:assert/strict";
import { test, after } from "node:test";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import ts from "typescript";

const root = mkdtempSync(join(tmpdir(), "sale-job-"));
for (const file of ["packages/shared/types/business-capabilities.ts", "packages/shared/types/document-output.ts", ...["document-output-sale-job", "document-output-sale-source", "document-output-store", "document-output-render-snapshot", "document-output-snapshot-store", "document-output-ready", "document-form-images", "document-output-management"].map(name => `apps/desktop-app/electron/${name}.ts`)]) {
  const target = join(root, file.replace(/\.ts$/, ".js"));
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
}
mkdirSync(join(root, "node_modules/@yardimci-asistan/shared"), { recursive: true });
writeFileSync(join(root, "node_modules/@yardimci-asistan/shared/index.js"), 'module.exports = {...require("../../../packages/shared/types/document-output.js"), ...require("../../../packages/shared/types/business-capabilities.js")};');
const require = createRequire(import.meta.url), base = join(root, "apps/desktop-app/electron");
const { prepareSaleDocumentJob: prepare } = require(join(base, "document-output-sale-job.js"));
const { createDocumentTemplate, saveDocumentOutputRule, createDocumentOutputJob } = require(join(base, "document-output-store.js"));
const sourceOwner = require(join(base, "document-output-sale-source.js"));
const snapshotOwner = require(join(base, "document-output-snapshot-store.js"));
const { listReadyDocuments } = require(join(base, "document-output-ready.js"));
const { DocumentFormImages } = require(join(base, "document-form-images.js"));
const { DocumentOutputManagement } = require(join(base, "document-output-management.js"));
// Exercise the actual preset and explicit repair geometry without mounting React.
const canvasSource = ts.createSourceFile("DocumentTemplateCanvas.tsx", readFileSync("apps/desktop-app/src/components/settings/DocumentTemplateCanvas.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const layoutOwners = canvasSource.statements.filter(node => ts.isFunctionDeclaration(node) && ["defaultDocumentLayout", "saleReceiptLineBlock"].includes(node.name?.text));
assert.equal(layoutOwners.length, 2);
writeFileSync(join(root, "receipt-layout.js"), ts.transpileModule(layoutOwners.map(node => node.getText(canvasSource)).join("\n"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
const { defaultDocumentLayout, saleReceiptLineBlock } = require(join(root, "receipt-layout.js"));
after(() => rmSync(root, { recursive: true, force: true }));
const field = binding => ({ binding, x: 0, y: 0, width: 100, height: 10 });
const layout = () => ({ unit: "mm10", pageWidth: 800, pageHeight: 2000, fields: [field("business.name"), field("totals.total")], lineBlock: { y: 100, rowHeight: 10, maxRows: 2, fields: [field("line.description"), field("line.quantity"), field("line.price"), field("line.total")] }, scan: null });
const scope = { businessId: "b", installationId: "install", saleId: "s" };
function fixture(t, scan = false) {
  const dir = join(root, crypto.randomUUID()); mkdirSync(dir);
  const db = new DatabaseSync(join(dir, "db.sqlite")); t.after(() => db.close());
  db.exec(readFileSync("apps/desktop-app/db/schema.sql", "utf8"));
  db.exec(`INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES('b','İşletme','İşletme','market','now','now');
    INSERT INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at) VALUES('b','document.printing',1,'now','now'),('b','commerce.sales',1,'now','now');
    INSERT INTO commerce_sales(id,business_id,status,subtotal,discount_total,total,currency,opened_at,closed_at,created_at,updated_at) VALUES('s','b','paid',25,2,23,'TRY','now','2026-10-28T12:30:00.000Z','now','now');
    INSERT INTO catalog_products(id,business_id,name,sale_price,created_at,updated_at) VALUES('p','b','Eski',10,'now','now');
    INSERT INTO commerce_sale_items(id,sale_id,product_id,product_name,barcode,unit_price,quantity,line_total,created_at) VALUES('i1','s','p','Eski','123',10,2,20,'a'),('i2','s','p','Diğer','456',5,1,5,'b');
    INSERT INTO document_printer_bindings VALUES('b','install','sale_receipt','printer');`);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a7sAAAAASUVORK5CYII=", "base64");
  const images = new DocumentFormImages(dir, bytes => ({ width: 1, height: 1, png: bytes }));
  const template = layout();
  if (scan) {
    const path = join(dir, "source.png"); writeFileSync(path, png);
    const original = images.importOriginal(path, "b", "sale_receipt");
    const processed = images.saveProcessed(original.imageRef, png.toString("base64"), "b", "sale_receipt");
    template.scan = { originalImageRef: original.imageRef, processedImageRef: processed.imageRef, foreground: false };
  }
  createDocumentTemplate(db, "b", "default:sale_receipt", 1, "sale_receipt", template);
  saveDocumentOutputRule(db, { businessId: "b", documentKind: "sale_receipt", trigger: "manual", channel: "print", mode: "ASK_CONFIRMATION", adapter: "native_print" });
  return { db, images, template, dir };
}
const count = db => db.prepare("SELECT count(*) AS n FROM document_output_jobs").get().n;
test("frozen real sale, raster images, ready list and stable replay", t => {
  const { db, images, template } = fixture(t, true);
  const id = prepare(db, images, scope);
  assert.equal(listReadyDocuments(db, "b", "install", "sale_receipt")[0].jobId, id);
  assert.equal(db.prepare("SELECT count(*) AS n FROM document_output_snapshot_images").get().n, 2);
  const job = db.prepare("SELECT * FROM document_output_jobs").get();
  assert.ok(job.operation_id.length <= 128); assert.equal(job.state, "awaiting-confirmation");
  const payload = JSON.parse(db.prepare("SELECT payload_json FROM document_output_render_snapshots").get().payload_json);
  assert.deepEqual(payload.rows.map(row => row[0].text), ["Eski", "Diğer"]);
  db.exec("UPDATE catalog_products SET name='Yeni',sale_price=99 WHERE id='p'");
  createDocumentTemplate(db, "b", "default:sale_receipt", 2, "sale_receipt", template);
  assert.equal(prepare(db, images, scope), id); assert.equal(count(db), 1);
  db.exec("UPDATE commerce_sale_items SET barcode='changed' WHERE id='i1'");
  assert.throws(() => prepare(db, images, scope), /DOCUMENT_SALE_JOB_CONFLICT/); assert.equal(count(db), 1);
});
test("bad scope, configuration, capability, source and capacity create no jobs", t => {
  const cases = [
    ["DELETE FROM document_output_rules", scope],
    ["UPDATE document_output_rules SET mode='AUTOMATIC'", scope],
    ["UPDATE document_output_rules SET mode='OFF'", scope],
    ["DELETE FROM document_printer_bindings", scope],
    ["UPDATE business_capabilities SET is_enabled=0 WHERE capability_id='commerce.sales'", scope],
    ["UPDATE commerce_sales SET total=24", scope],
    ["", { ...scope, businessId: "wrong" }],
    ["", { ...scope, saleId: "wrong" }],
    ["", { ...scope, installationId: "wrong" }],
    ["INSERT INTO commerce_sale_items VALUES('i3','s','p','x','',0,1,0,'z')", scope],
  ];
  for (const [sql, input] of cases) {
    const { db, images } = fixture(t); if (sql) db.exec(sql);
    assert.throws(() => prepare(db, images, input)); assert.equal(count(db), 0);
  }
});
test("atomic capture hides every stage and rolls back failures before retry", t => {
  for (const [scan, stage] of [[false, "captureDocumentRenderSnapshot"], [true, "captureDocumentRenderSnapshot"], [true, "captureDocumentSnapshotImages"]]) {
    const { db, images, dir } = fixture(t, scan);
    const observer = new DatabaseSync(join(dir, "db.sqlite")); t.after(() => observer.close());
    const original = snapshotOwner[stage];
    snapshotOwner[stage] = (...args) => {
      original(...args);
      for (const table of ["document_output_jobs", "document_output_render_snapshots", "document_output_snapshot_images"]) assert.equal(observer.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
      assert.deepEqual(listReadyDocuments(observer, "b", "install", "sale_receipt"), []);
      throw Error("injected capture failure");
    };
    try { assert.throws(() => prepare(db, images, scope), /injected capture failure/); }
    finally { snapshotOwner[stage] = original; }
    assert.equal(count(db), 0);
    const id = prepare(db, images, scope);
    assert.equal(prepare(db, images, scope), id);
    assert.equal(count(observer), 1);
    assert.deepEqual(listReadyDocuments(observer, "b", "install", "sale_receipt").map(row => row.jobId), [id]);
  }
});
test("legacy incomplete sale job remains fail closed", t => {
  const { db, images } = fixture(t, true);
  const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const source = sourceOwner.readSaleDocumentSource(db, "b", "s");
  const operationId = `sale:${digest(["b", "install", "s"]).slice(0, 32)}:${digest([source, "printer"])}`;
  createDocumentOutputJob(db, { businessId: "b", installationId: "install", sourceId: "s", operationId, commandKind: "manual", documentKind: "sale_receipt", trigger: "manual", channel: "print", templateId: "default:sale_receipt", templateRevision: 1, copies: 1, printerBindingId: "sale_receipt" });
  assert.throws(() => prepare(db, images, scope), /DOCUMENT_SALE_JOB_CONFLICT/);
  assert.equal(count(db), 1); assert.deepEqual(listReadyDocuments(db, "b", "install", "sale_receipt"), []);
});
test("source changes before lock or before commit roll back all capture", t => {
  {
    const { db, images } = fixture(t, true);
    const read = images.readBytes.bind(images); let changed = false;
    images.readBytes = (...args) => {
      const bytes = read(...args);
      if (!changed) { changed = true; db.exec("UPDATE commerce_sale_items SET barcode='changed' WHERE id='i1'"); }
      return bytes;
    };
    assert.throws(() => prepare(db, images, scope), /DOCUMENT_SALE_JOB_CONFLICT/);
    assert.equal(count(db), 0);
  }
  {
    const { db, images, dir } = fixture(t);
    const observer = new DatabaseSync(join(dir, "db.sqlite")); t.after(() => observer.close());
    const capture = snapshotOwner.captureDocumentSnapshotImages;
    snapshotOwner.captureDocumentSnapshotImages = (...args) => {
      const result = capture(...args);
      db.exec("UPDATE commerce_sale_items SET barcode='changed' WHERE id='i1'");
      assert.equal(count(observer), 0);
      assert.deepEqual(listReadyDocuments(observer, "b", "install", "sale_receipt"), []);
      return result;
    };
    try { assert.throws(() => prepare(db, images, scope), /DOCUMENT_SALE_JOB_CONFLICT/); }
    finally { snapshotOwner.captureDocumentSnapshotImages = capture; }
    for (const table of ["document_output_jobs", "document_output_render_snapshots", "document_output_snapshot_images"]) assert.equal(observer.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
    assert.equal(db.prepare("SELECT barcode FROM commerce_sale_items WHERE id='i1'").get().barcode, "123");
    const id = prepare(db, images, scope);
    assert.equal(prepare(observer, images, scope), id);
  }
});
test("live paid 22 TRY / quantity 2 shape: explicit revision 2 repair to 3, number, ready and replay", t => {
  const { db, images } = fixture(t);
  db.exec("DELETE FROM commerce_sale_items WHERE id='i2'; UPDATE commerce_sale_items SET unit_price=11,line_total=22 WHERE id='i1'; UPDATE commerce_sales SET subtotal=22,total=22,discount_total=0");
  const saved = { ...defaultDocumentLayout("sale_receipt"), lineBlock: null };
  createDocumentTemplate(db, "b", "default:sale_receipt", 2, "sale_receipt", saved);
  assert.throws(() => prepare(db, images, scope), /DOCUMENT_SALE_JOB_LINES_MISSING/);
  assert.equal(count(db), 0); assert.deepEqual(listReadyDocuments(db, "b", "install", "sale_receipt"), []);
  const owner = new DocumentOutputManagement(db, { role: "desktop_owner", assertAuthorized() {} });
  const repaired = { ...saved, lineBlock: saleReceiptLineBlock(saved) };
  assert.equal(owner.saveTemplate({ documentKind: "sale_receipt", expectedRevision: 2, layout: repaired }).revision, 3);
  assert.deepEqual(JSON.parse(db.prepare("SELECT layout_json FROM document_print_templates WHERE revision=2").get().layout_json), saved);
  const id = prepare(db, images, scope);
  assert.equal(prepare(db, images, scope), id); assert.equal(count(db), 1);
  assert.equal(db.prepare("SELECT template_revision FROM document_output_jobs").get().template_revision, 3);
  assert.deepEqual(listReadyDocuments(db, "b", "install", "sale_receipt").map(row => row.jobId), [id]);
  const payload = JSON.parse(db.prepare("SELECT payload_json FROM document_output_render_snapshots").get().payload_json);
  assert.match(payload.fields.find(field => field.binding === "document.number").text, /^SAT-[A-F0-9]{16}$/);
  assert.equal(payload.fields.find(field => field.binding === "totals.total").text, "22,00");
  assert.deepEqual(payload.rows[0].map(field => field.text), ["Eski", "2", "22,00"]);
  assert.equal(payload.notice, "MALİ BELGE DEĞİLDİR");
});
test("default receipt preset prepares once; missing, empty, insufficient and bad bindings leave no output", t => {
  const good = fixture(t);
  const preset = defaultDocumentLayout("sale_receipt");
  createDocumentTemplate(good.db, "b", "default:sale_receipt", 2, "sale_receipt", preset);
  const id = prepare(good.db, good.images, scope);
  assert.equal(prepare(good.db, good.images, scope), id); assert.equal(count(good.db), 1);
  for (const mutate of [
    value => { value.lineBlock = null; },
    value => { value.lineBlock.fields = []; },
    value => { value.lineBlock.maxRows = 1; },
    value => { value.lineBlock.fields = value.lineBlock.fields.filter(field => field.binding !== "line.quantity"); },
    value => { value.fields.push(field("product.barcode")); }
  ]) {
    const { db, images } = fixture(t), bad = defaultDocumentLayout("sale_receipt"); mutate(bad);
    createDocumentTemplate(db, "b", "default:sale_receipt", 2, "sale_receipt", bad);
    assert.throws(() => prepare(db, images, scope), bad.fields.some(field => field.binding === "product.barcode") ? /DOCUMENT_SALE_JOB_FIELD_UNAVAILABLE/ : /DOCUMENT_SALE_JOB_LINES_MISSING/);
    assert.equal(count(db), 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM document_output_render_snapshots").get().n, 0);
    assert.deepEqual(listReadyDocuments(db, "b", "install", "sale_receipt"), []);
  }
});
