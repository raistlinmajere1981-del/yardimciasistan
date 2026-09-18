import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist/index.js");
const { setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const { database, cleanup } = createTemporaryDesktopDatabase("yardimci-stock-import-db-");

try {
  database.initialize();

  const setupResult = database.saveInitialSetup({
    businessName: "Stock Image Test İşletmesi",
    profileId: "pension_restaurant",
    phone: "+905550000200",
    whatsapp: "+905550000200",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "stock-image-test-secret-123",
    autoSyncEnabled: false,
    aiEnabled: false,
    aiProvider: "openai_compatible",
    aiService: "openai",
    aiProjectName: "",
    aiModel: "",
    aiModelOptions: [],
    aiBaseUrl: "https://api.openai.com/v1",
    aiTimeoutSeconds: 30,
    aiApiKey: "",
    clearAiApiKey: false,
    servicePreferences: { whatsapp: false, android: true },
    initialCounts: { rooms: 0, tables: 0 },
    tableCategories: []
  });
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);

  const categoryResult = database.saveMenuCategory({
    name: "Stok Smoke Kategorisi",
    description: "Stok smoke testi",
    is_active: true,
    sort_order: 10
  });
  assert.equal(categoryResult.ok, true);
  const stockCategoryId = categoryResult.savedId;

  function createStockItem(name, unit, consumption) {
    const result = database.saveMenuItem({
      category_id: stockCategoryId,
      name,
      description: "Stok smoke ürünü",
      price: 100,
      currency: "TRY",
      image_url: "",
      is_available: true,
      is_featured: false,
      allergens: [],
      tags: ["smoke"],
      stock_quantity: null,
      stock_min_quantity: null,
      stock_unit: unit,
      stock_consumption_quantity: consumption,
      hide_when_out_of_stock: false,
      stock_note: null,
      sort_order: 10
    });
    assert.equal(result.ok, true);
    return result.savedId;
  }

  const firstId = createStockItem("Stok Adet Ürünü", "piece", 1);
  const secondId = createStockItem("Stok Adet Ürünü 2", "piece", 1);
  const gramId = createStockItem("Stok Gram Ürünü", "gram", 200);
  const menuById = new Map(database.getDashboardData().menu.items.map((item) => [item.id, item]));
  const first = menuById.get(firstId);
  const second = menuById.get(secondId);
  const gramItem = menuById.get(gramId);
  assert.ok(first && second && gramItem);
  assert.equal(database.saveMenuItem(trackedInput(first, 0, true)).ok, true);
  assert.equal(database.saveMenuItem(trackedInput(second, 5, false)).ok, true);
  assert.equal(database.saveMenuItem(trackedInput(gramItem, 1000, false)).ok, true);
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
      },
      {
        raw_text: `${gramItem.name} 3 KG`,
        matched_menu_item_id: gramItem.id,
        matched_menu_item_name: gramItem.name,
        suggested_quantity: 3,
        source_quantity_text: "3 KG",
        confidence: "high",
        needs_review_reason: null
      },
      {
        raw_text: `${gramItem.name} 2.500 GR`,
        matched_menu_item_id: gramItem.id,
        matched_menu_item_name: gramItem.name,
        suggested_quantity: 2500,
        source_quantity_text: "2.500 GR",
        confidence: "high",
        needs_review_reason: null
      }
    ]
  });
  assert.ok(sanitized);
  assert.equal(sanitized.lines[0].suggested_quantity, 24);
  assert.equal(sanitized.lines[1].suggested_quantity, null);
  assert.match(sanitized.lines[1].needs_review_reason, /Koli, paket, ağırlık veya hacim/i);
  assert.equal(sanitized.lines[2].suggested_quantity, 3000);
  assert.equal(sanitized.lines[3].suggested_quantity, 2500);

  const gramStockBeforeImport = stock(database, gramItem.id);
  const applied = database.applyStockImageImport({
    importId,
    imageHash: hash,
    lines: [
      { menu_item_id: first.id, quantity: 24, raw_text: `${firstName} 24 AD`, confidence: "high" },
      { menu_item_id: second.id, quantity: 24, raw_text: `${secondName} 1 KOLI · kullanıcı 24 girdi`, confidence: "medium" },
      { menu_item_id: gramItem.id, quantity: 3000, raw_text: `${gramItem.name} 3 KG`, confidence: "high" }
    ]
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.appliedLineCount, 3);
  assert.equal(applied.totalQuantity, 3048);
  assert.equal(stock(database, first.id), 24);
  assert.equal(stock(database, second.id), 29);
  assert.equal(stock(database, gramItem.id), gramStockBeforeImport + 3000);
  assert.equal(database.getQrMenuPublication().items.some((item) => item.id === first.id), true, "0 → positive stock must republish a hidden item");
  const imageMovements = database.getMenuStockMovements().filter((movement) => movement.sourceId === importId);
  assert.equal(imageMovements.length, 3);
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
  registerAndApproveDevice(database, adminDeviceId);
  assert.equal(database.setAndroidDeviceRole(adminDeviceId, "admin").ok, true);
  const androidHash = "c".repeat(64);
  const androidImportId = "stock_import_android_smoke_001";
  const androidAction = action("android_stock_import_action_001", adminDeviceId, androidImportId, androidHash, [
    { menu_item_id: first.id, quantity: 2, raw_text: `${firstName} 2 AD`, confidence: "high" }
  ]);
  setBusinessCapability(database.databasePath, { capability: C.AI, enabled: false });
  assert.equal(database.getSetupData().aiEnabled, false);
  const aiDisabledResult = database.applyAndroidAction(androidAction);
  assert.equal(aiDisabledResult.ok, false);
  assert.match(aiDisabledResult.message, /etkin yeteneklerinde kullanılamıyor/i);
  setBusinessCapability(database.databasePath, { capability: C.AI, enabled: true });
  const androidResult = database.applyAndroidAction(androidAction);
  assert.equal(androidResult.ok, true, androidResult.message);
  assert.equal(stock(database, first.id), beforeAtomic + 2);
  const androidMovement = database.getMenuStockMovements().find((movement) => movement.sourceId === androidImportId);
  assert.ok(androidMovement);
  assert.equal(androidMovement.actorSource, "android");
  assert.equal(androidMovement.actorDeviceId, adminDeviceId);
  assert.equal(database.applyAndroidAction({ ...androidAction, id: "android_stock_import_action_002" }).ok, false, "A different action id cannot reapply the same import_id");

  const staffDeviceId = "android-stock-import-staff";
  registerAndApproveDevice(database, staffDeviceId);
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
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM stock_image_import_lines WHERE import_id = ? AND status = 'approved'").get(importId).count, 3);
  } finally {
    sqlite.close();
  }
  console.log("stock-image-import-db-smoke-ok: drafts, ambiguity, duplicate guard, atomic apply, provenance, approval and permissions verified");
} finally {
  cleanup();
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
    stock_unit: item.stock_unit ?? "piece",
    stock_consumption_quantity: item.stock_consumption_quantity ?? 1,
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

function registerAndApproveDevice(databaseInstance, deviceId) {
  databaseInstance.upsertAndroidDeviceSightings([sighting(deviceId)]);
  const pending = databaseInstance.getAndroidDevices().find((device) => device.deviceId === deviceId);
  assert.equal(pending?.isActive, false, "New Android devices must wait for desktop approval.");
  const approval = databaseInstance.setAndroidDeviceActive(deviceId, true);
  assert.equal(approval.ok, true, approval.message);
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
