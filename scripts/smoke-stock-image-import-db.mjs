import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const dataRoot = mkdtempSync(join(tmpdir(), "yardimci-stock-import-db-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataRoot
});

try {
  database.initialize();
  const [first, second] = database.getDashboardData().menu.items;
  assert.ok(first && second);
  assert.equal(database.saveMenuItem(trackedInput(first, 0, true)).ok, true);
  assert.equal(database.saveMenuItem(trackedInput(second, 5, false)).ok, true);
  const firstName = first.name;
  const secondName = second.name;
  const hash = "a".repeat(64);
  const importId = "stock_import_desktop_smoke_001";
  assert.deepEqual(database.createStockImageImport({
    importId,
    source: "desktop",
    imageHash: hash,
    originalFilename: "invoice.jpg"
  }), { ok: true, duplicateWarning: false });

  const sanitized = database.completeStockImageAnalysis(importId, {
    document: {
      supplier_name: "DB Smoke Tedarik",
      invoice_number: "DB-1",
      invoice_date: "2026-07-22",
      document_confidence: "high"
    },
    lines: [
      {
        raw_text: `${firstName} 24 AD`,
        matched_menu_item_id: first.id,
        matched_menu_item_name: firstName,
        suggested_quantity: 24,
        source_quantity_text: "24 AD",
        confidence: "high",
        needs_review_reason: null
      },
      {
        raw_text: `${secondName} 1 KOLI`,
        matched_menu_item_id: second.id,
        matched_menu_item_name: secondName,
        suggested_quantity: 999,
        source_quantity_text: "1 KOLI",
        confidence: "medium",
        needs_review_reason: null
      }
    ]
  });
  assert.ok(sanitized);
  assert.equal(sanitized.lines[0].suggested_quantity, 24);
  assert.equal(sanitized.lines[1].suggested_quantity, null);
  assert.match(sanitized.lines[1].needs_review_reason, /Koli, paket, kg veya litre/i);

  const applied = database.applyStockImageImport({
    importId,
    imageHash: hash,
    lines: [
      { menu_item_id: first.id, quantity: 24, raw_text: `${firstName} 24 AD`, confidence: "high" },
      { menu_item_id: second.id, quantity: 24, raw_text: `${secondName} 1 KOLI · kullanıcı 24 girdi`, confidence: "medium" }
    ]
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.appliedLineCount, 2);
  assert.equal(applied.totalQuantity, 48);
  assert.equal(stock(database, first.id), 24);
  assert.equal(stock(database, second.id), 29);
  assert.equal(database.getQrMenuPublication().items.some((item) => item.id === first.id), true, "0 → positive stock must republish a hidden item");
  const imageMovements = database.getMenuStockMovements().filter((movement) => movement.sourceId === importId);
  assert.equal(imageMovements.length, 2);
  assert.equal(imageMovements.every((movement) => movement.type === "image_import_add"), true);
  assert.equal(imageMovements.every((movement) => movement.sourceType === "stock_image_import"), true);
  assert.equal(imageMovements.every((movement) => movement.actorSource === "desktop"), true);
  assert.deepEqual(database.getAppliedStockImageHashes(), [hash]);
  assert.equal(database.getPendingSyncJobs().some((job) => job.jobType === "menu_publish"), true);
  assert.equal(database.getPendingSyncJobs().some((job) => job.jobType === "android_snapshot"), true);

  const repeatedImport = database.applyStockImageImport({
    importId,
    imageHash: hash,
    lines: [{ menu_item_id: first.id, quantity: 1, raw_text: "repeat", confidence: "high" }]
  });
  assert.equal(repeatedImport.ok, false);
  assert.match(repeatedImport.message, /daha önce uygulanmış/i);
  assert.equal(stock(database, first.id), 24);

  const duplicateId = "stock_import_desktop_smoke_duplicate";
  assert.deepEqual(database.createStockImageImport({ importId: duplicateId, source: "desktop", imageHash: hash }), {
    ok: true,
    duplicateWarning: true
  });
  database.completeStockImageAnalysis(duplicateId, emptyAnalysis());
  const blockedDuplicate = database.applyStockImageImport({
    importId: duplicateId,
    imageHash: hash,
    lines: [{ menu_item_id: first.id, quantity: 1, raw_text: "duplicate", confidence: "high" }]
  });
  assert.equal(blockedDuplicate.ok, false);
  assert.match(blockedDuplicate.message, /daha önce stok girişinde/i);
  const approvedDuplicate = database.applyStockImageImport({
    importId: duplicateId,
    imageHash: hash,
    duplicateWarningAcknowledged: true,
    lines: [{ menu_item_id: first.id, quantity: 1, raw_text: "duplicate approved", confidence: "high" }]
  });
  assert.equal(approvedDuplicate.ok, true);
  assert.equal(stock(database, first.id), 25);

  const atomicId = "stock_import_desktop_smoke_atomic";
  const atomicHash = "b".repeat(64);
  database.createStockImageImport({ importId: atomicId, source: "desktop", imageHash: atomicHash });
  database.completeStockImageAnalysis(atomicId, emptyAnalysis());
  const beforeAtomic = stock(database, first.id);
  const beforeMovementCount = database.getMenuStockMovements().length;
  const atomicFailure = database.applyStockImageImport({
    importId: atomicId,
    imageHash: atomicHash,
    lines: [
      { menu_item_id: first.id, quantity: 3, raw_text: "valid row", confidence: "high" },
      { menu_item_id: "not-tracked-item", quantity: 2, raw_text: "invalid row", confidence: "low" }
    ]
  });
  assert.equal(atomicFailure.ok, false);
  assert.equal(stock(database, first.id), beforeAtomic, "An invalid row must roll back every stock change");
  assert.equal(database.getMenuStockMovements().length, beforeMovementCount, "An invalid row must roll back every movement");

  const adminDeviceId = "android-stock-import-admin";
  database.upsertAndroidDeviceSightings([sighting(adminDeviceId)]);
  assert.equal(database.setAndroidDeviceRole(adminDeviceId, "admin").ok, true);
  const androidHash = "c".repeat(64);
  const androidImportId = "stock_import_android_smoke_001";
  const androidAction = action("android_stock_import_action_001", adminDeviceId, androidImportId, androidHash, [
    { menu_item_id: first.id, quantity: 2, raw_text: `${firstName} 2 AD`, confidence: "high" }
  ]);
  const androidResult = database.applyAndroidAction(androidAction);
  assert.equal(androidResult.ok, true, androidResult.message);
  assert.equal(stock(database, first.id), beforeAtomic + 2);
  const androidMovement = database.getMenuStockMovements().find((movement) => movement.sourceId === androidImportId);
  assert.ok(androidMovement);
  assert.equal(androidMovement.actorSource, "android");
  assert.equal(androidMovement.actorDeviceId, adminDeviceId);
  assert.equal(database.applyAndroidAction({ ...androidAction, id: "android_stock_import_action_002" }).ok, false, "A different action id cannot reapply the same import_id");

  const staffDeviceId = "android-stock-import-staff";
  database.upsertAndroidDeviceSightings([sighting(staffDeviceId)]);
  const staffBefore = stock(database, first.id);
  const forbidden = database.applyAndroidAction(action(
    "android_stock_import_staff_001",
    staffDeviceId,
    "stock_import_android_staff_001",
    "d".repeat(64),
    [{ menu_item_id: first.id, quantity: 9, raw_text: "forbidden", confidence: "high" }]
  ));
  assert.equal(forbidden.ok, false);
  assert.match(forbidden.message, /yetkisi yok/i);
  assert.equal(stock(database, first.id), staffBefore);

  const sqlite = new DatabaseSync(database.databasePath, { readOnly: true });
  try {
    const stored = sqlite.prepare("SELECT status, raw_analysis_json, applied_at FROM stock_image_imports WHERE import_id = ?").get(importId);
    assert.equal(stored.status, "applied");
    assert.ok(stored.raw_analysis_json);
    assert.ok(stored.applied_at);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM stock_image_import_lines WHERE import_id = ? AND status = 'approved'").get(importId).count, 2);
  } finally {
    sqlite.close();
  }
  console.log("stock-image-import-db-smoke-ok: drafts, ambiguity, duplicate guard, atomic apply, provenance and permissions verified");
} finally {
  database.close();
  rmSync(dataRoot, { recursive: true, force: true });
}

function trackedInput(item, quantity, hideWhenOut) {
  return {
    id: item.id,
    category_id: item.category_id,
    name: item.name,
    description: item.description,
    price: item.price,
    currency: item.currency,
    image_url: item.image_url,
    is_available: true,
    is_featured: item.is_featured,
    allergens: item.allergens,
    tags: item.tags,
    stock_quantity: quantity,
    stock_min_quantity: 1,
    hide_when_out_of_stock: hideWhenOut,
    stock_note: "Stock image smoke",
    sort_order: item.sort_order
  };
}

function stock(databaseInstance, itemId) {
  return databaseInstance.getDashboardData().menu.items.find((item) => item.id === itemId)?.stock_quantity;
}

function emptyAnalysis() {
  return {
    document: { supplier_name: null, invoice_number: null, invoice_date: null, document_confidence: "low" },
    lines: []
  };
}

function sighting(deviceId) {
  const now = new Date().toISOString();
  return {
    device_id: deviceId,
    device_name: "Stock Image Smoke",
    app_version: "0.1.0-smoke",
    first_seen_at: now,
    last_seen_at: now
  };
}

function action(id, deviceId, importId, imageHash, lines) {
  const now = new Date().toISOString();
  return {
    id,
    action_type: "menu_stock_image_import_apply",
    payload: { import_id: importId, image_hash: imageHash, lines },
    created_at: now,
    last_seen_at: now,
    device_id: deviceId,
    device_name: "Stock Image Smoke",
    app_version: "0.1.0-smoke",
    status: "pending",
    error_message: ""
  };
}
