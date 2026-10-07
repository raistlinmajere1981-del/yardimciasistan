import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const manager = await readFile("apps/desktop-app/src/components/menu/MenuManager.tsx", "utf8");
const css = await readFile("apps/desktop-app/src/styles/pages/menu.css", "utf8");

const reorder = await readFile("apps/desktop-app/src/components/ui/use-record-reorder.ts", "utf8");
const compiled = ts.transpileModule(reorder, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function("require", "exports", compiled)(() => ({}), exports);
assert.deepEqual(exports.moveRecordId(["a", "b", "c"], "a", "c", "after"), ["b", "c", "a"]);
assert.deepEqual(exports.moveRecordId(["a", "b", "c"], "c", "a", "before"), ["c", "a", "b"]);
assert.equal(exports.moveRecordId(["a", "b"], "missing", "a", "after"), null);
assert.match(manager, /useRecordReorder/);
assert.match(reorder, /setDragImage\(/);
assert.match(manager, /draggable=\{!reorderBusy && Boolean\(selectedCategoryId\)\}/);
assert.match(manager, /Sıralamak için kategori seçin/);
assert.match(manager, /handleDragOver\(event, "category", category\.id\)/);
assert.match(manager, /handleDragOver\(event, "item", item\.id\)/);

assert.match(css, /\.menu-sortable-record\.is-drop-before\s*\{[^}]*margin-block-start:/s);
assert.match(css, /\.menu-sortable-record\.is-drop-after\s*\{[^}]*margin-block-end:/s);
assert.match(css, /\.menu-sortable-record:is\(\.is-drop-before, \.is-drop-after\)\s*\{[^}]*overflow: visible;/s);
assert.match(css, /\.menu-sortable-record\.is-dragging\s*\{[^}]*opacity:/s);
assert.match(css, /\.menu-drag-handle-hitbox\.is-disabled/);

console.log("menu-reorder-contract-smoke-ok");
