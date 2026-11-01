import assert from "node:assert/strict";
import { test, after } from "node:test";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

const root = mkdtempSync(join(tmpdir(), "document-render-"));
for (const file of ["packages/shared/types/business-capabilities.ts", "packages/shared/types/document-output.ts", "apps/desktop-app/electron/document-output-render-snapshot.ts"]) {
  const target = join(root, file.replace(/\.ts$/, ".js"));
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
}
mkdirSync(join(root, "node_modules/@yardimci-asistan/shared"), { recursive: true });
writeFileSync(join(root, "node_modules/@yardimci-asistan/shared/index.js"), 'module.exports = require("../../../packages/shared/types/document-output.js");');
const { createDocumentRenderSnapshot: render } = createRequire(import.meta.url)(join(root, "apps/desktop-app/electron/document-output-render-snapshot.js"));
after(() => rmSync(root, { recursive: true, force: true }));
const f = binding => ({ binding, x: 0, y: 0, width: 100, height: 10 });
const layout = () => ({ unit: "mm10", pageWidth: 800, pageHeight: 2000, fields: [f("business.name"), f("customer.name")], lineBlock: { y: 100, rowHeight: 10, maxRows: 10, fields: [f("line.description"), f("line.quantity"), f("business.name")] }, scan: null });

test("whitelisted values, missing and null values and repeated line positions", () => {
  const out = render("sale_receipt", layout(), { "business.name": "Dükkan", "customer.name": null }, [{ "line.description": "Ürün", "line.quantity": "0" }, {}]);
  assert.equal(out.fields[0].text, "Dükkan"); assert.equal(out.fields[1].text, "");
  assert.deepEqual(out.rows.map(row => row.map(cell => cell.text)), [["Ürün", "0", "Dükkan"], ["", "", "Dükkan"]]);
  assert.equal(out.rows[1][0].y, 110);
});
test("plain text is preserved literally, never interpreted or pre-escaped", () => {
  const text = '<script>& "\'\n</script>';
  assert.equal(render("sale_receipt", layout(), { "business.name": text }, []).fields[0].text, text);
});
test("reject unknown, misplaced, non-text and accessor values", () => {
  for (const values of [{ html: "x" }, { "line.price": "1" }, { "business.name": 0 }, { "business.name": undefined }, Object.defineProperty({}, "business.name", { get() { throw Error("accessed"); }, enumerable: true })]) assert.throws(() => render("sale_receipt", layout(), values, []), /DOCUMENT_RENDER_VALUES_INVALID/);
  assert.throws(() => render("sale_receipt", layout(), {}, [{ "business.name": "x" }]), /DOCUMENT_RENDER_VALUES_INVALID/);
  const bad = layout(); bad.fields[0].binding = "raw.html";
  assert.throws(() => render("sale_receipt", bad, {}, []), /DOCUMENT_TEMPLATE_INVALID/);
});
test("byte, row, template and total snapshot limits fail closed", () => {
  assert.throws(() => render("sale_receipt", layout(), { "business.name": "ü".repeat(2049) }, []), /DOCUMENT_RENDER_VALUES_INVALID/);
  assert.throws(() => render("sale_receipt", layout(), {}, Array.from({ length: 11 }, () => ({}))), /DOCUMENT_RENDER_ROWS_INVALID/);
  const noBlock = layout(); noBlock.lineBlock = null;
  assert.throws(() => render("sale_receipt", noBlock, {}, [{}]), /DOCUMENT_RENDER_ROWS_INVALID/);
  const big = layout(); big.lineBlock.fields = Array.from({ length: 100 }, () => f("line.description"));
  assert.throws(() => render("sale_receipt", big, {}, Array.from({ length: 10 }, () => ({ "line.description": "x".repeat(4096) }))), /DOCUMENT_RENDER_SNAPSHOT_TOO_LARGE/);
});
test("non-fiscal notice is mandatory even for invoice copy; invalid kinds rejected", () => {
  for (const kind of ["sale_receipt", "invoice_copy"]) {
    const result = render(kind, layout(), {}, []);
    assert.equal(result.legalMeaning, "non_fiscal_copy"); assert.equal(result.notice, "MALİ BELGE DEĞİLDİR");
  }
  assert.throws(() => render("tax_invoice", layout(), {}, []), /DOCUMENT_RENDER_KIND_INVALID/);
});
test("snapshot is deterministic and detached from later source changes", () => {
  const template = layout(), values = { "business.name": "İlk" }, lines = [{ "line.description": "A" }];
  template.scan = { originalImageRef: "image_1", processedImageRef: null, foreground: false };
  const snapshot = render("sale_receipt", template, values, lines), serialized = JSON.stringify(snapshot);
  assert.equal(JSON.stringify(render("sale_receipt", template, values, lines)), serialized);
  template.fields[0].x = 20; template.scan.originalImageRef = "image_2"; values["business.name"] = "Son"; lines[0]["line.description"] = "B";
  assert.equal(JSON.stringify(snapshot), serialized);
});
