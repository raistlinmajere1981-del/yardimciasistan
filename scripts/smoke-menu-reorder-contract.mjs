import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manager = await readFile("apps/desktop-app/src/components/menu/MenuManager.tsx", "utf8");
const css = await readFile("apps/desktop-app/src/styles/pages/menu.css", "utf8");

assert.match(manager, /draggingRef\.current = nextDragging/);
assert.match(manager, /const activeDrag = draggingRef\.current \?\? dragging/);
assert.match(manager, /setDragImage\(/);
assert.match(manager, /kind === "item" && !selectedCategoryId/);
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
