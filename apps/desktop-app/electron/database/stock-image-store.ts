import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  StockImageAnalysis,
  StockImageApplyLine,
  StockImageImportSource,
  StockImageMenuCandidate
} from "@yardimci-asistan/shared";
import type {
  ApplyStockImageImportInput,
  CreateStockImageImportInput
} from "../database-types.js";
import { insertDatabaseEvent } from "./event-store.js";
import { mutateMenuStockInTransaction as mutateStoredMenuStock } from "./menu-stock-store.js";
import { queueSyncJob as queueStoredSyncJob } from "./sync-runtime-store.js";
import {
  isSha256Hex,
  normalizeMenuStockUnit,
  normalizeStockImageApplyLines,
  normalizeStockImageImportId,
  nullableTrimmedString,
  sanitizeStockImageAnalysis
} from "./stock-utils.js";

export interface ApplyStockImageImportTransactionInput {
  importId: string;
  imageHash: string;
  lines: StockImageApplyLine[];
  source: StockImageImportSource;
  actorDeviceId: string;
  duplicateWarningAcknowledged: boolean;
  canOverrideDuplicate: boolean;
  now: string;
}

export function getTrackedStockCandidates(db: DatabaseSync): StockImageMenuCandidate[] {
  const rows = db
    .prepare(`
        SELECT menu_items.id, menu_items.name, menu_items.stock_quantity, menu_items.stock_unit,
          menu_categories.name AS category
        FROM menu_items
        INNER JOIN menu_categories ON menu_categories.id = menu_items.category_id
        WHERE menu_items.deleted_at = ''
          AND menu_categories.deleted_at = ''
          AND menu_items.stock_quantity IS NOT NULL
        ORDER BY menu_categories.sort_order ASC, menu_items.sort_order ASC, menu_items.name ASC
      `)
    .all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    category: String(row.category ?? "Menü"),
    current_stock: Number(row.stock_quantity ?? 0),
    stock_unit: normalizeMenuStockUnit(row.stock_unit)
  }));
}

export function getAppliedStockImageHashes(db: DatabaseSync, limit = 100): string[] {
  const normalizedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const rows = db
    .prepare(`
        SELECT image_hash
        FROM stock_image_imports
        WHERE status = 'applied'
        ORDER BY applied_at DESC, created_at DESC
        LIMIT ?
      `)
    .all(normalizedLimit) as Array<{ image_hash?: string }>;
  return [...new Set(rows.map((row) => String(row.image_hash ?? "").toLowerCase()).filter(isSha256Hex))];
}

export function createStockImageImport(db: DatabaseSync, input: CreateStockImageImportInput): { ok: true; duplicateWarning: boolean } | { ok: false; message: string } {
  const importId = normalizeStockImageImportId(input.importId);
  const imageHash = String(input.imageHash ?? "").trim().toLowerCase();
  const source = input.source === "android" ? "android" : input.source === "desktop" ? "desktop" : null;
  if (!importId || !isSha256Hex(imageHash) || !source) {
    return { ok: false, message: "Görsel içe aktarma kimliği veya özeti geçersiz." };
  }
  if (db.prepare("SELECT id FROM stock_image_imports WHERE import_id = ?").get(importId)) {
    return { ok: false, message: "Bu içe aktarma daha önce başlatılmış." };
  }
  const duplicateWarning = Boolean(db
    .prepare("SELECT id FROM stock_image_imports WHERE image_hash = ? AND status = 'applied' LIMIT 1")
    .get(imageHash));
  const now = new Date().toISOString();
  db
    .prepare(`
        INSERT INTO stock_image_imports (
          id, import_id, source, device_id, image_hash, original_filename, status,
          supplier_name, invoice_number, invoice_date, raw_analysis_json, error_message,
          created_at, applied_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'analyzing', NULL, NULL, NULL, NULL, NULL, ?, NULL)
      `)
    .run(
      `stock_image_import_record_${randomUUID()}`,
      importId,
      source,
      nullableTrimmedString(input.deviceId)?.slice(0, 120) ?? null,
      imageHash,
      nullableTrimmedString(input.originalFilename)?.slice(0, 255) ?? null,
      now
    );
  return { ok: true, duplicateWarning };
}

export function completeStockImageAnalysis(db: DatabaseSync, importIdValue: string, analysis: StockImageAnalysis): StockImageAnalysis | null {
  const importId = normalizeStockImageImportId(importIdValue);
  if (!importId) {
    return null;
  }
  const existing = db
    .prepare("SELECT status FROM stock_image_imports WHERE import_id = ?")
    .get(importId) as { status?: string } | undefined;
  if (!existing || !["analyzing", "review"].includes(String(existing.status ?? ""))) {
    return null;
  }
  const sanitized = sanitizeStockImageAnalysis(analysis, getTrackedStockCandidates(db));
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM stock_image_import_lines WHERE import_id = ?").run(importId);
    const insertLine = db.prepare(`
        INSERT INTO stock_image_import_lines (
          id, import_id, raw_text, matched_menu_item_id, suggested_quantity,
          approved_quantity, source_quantity_text, confidence, status, note, created_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
      `);
    for (const line of sanitized.lines) {
      const needsReview = line.matched_menu_item_id === null
        || line.suggested_quantity === null
        || line.confidence === "low"
        || Boolean(line.needs_review_reason);
      insertLine.run(
        `stock_image_import_line_${randomUUID()}`,
        importId,
        line.raw_text,
        line.matched_menu_item_id,
        line.suggested_quantity,
        line.source_quantity_text,
        line.confidence,
        needsReview ? "needs_review" : "proposed",
        line.needs_review_reason,
        now
      );
    }
    db
      .prepare(`
          UPDATE stock_image_imports
          SET status = 'review', supplier_name = ?, invoice_number = ?, invoice_date = ?,
              raw_analysis_json = ?, error_message = NULL
          WHERE import_id = ? AND status IN ('analyzing', 'review')
        `)
      .run(
        sanitized.document.supplier_name,
        sanitized.document.invoice_number,
        sanitized.document.invoice_date,
        JSON.stringify(sanitized),
        importId
      );
    db.exec("COMMIT");
    return sanitized;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function failStockImageImport(db: DatabaseSync, importIdValue: string, message: string, cancelled = false): void {
  const importId = normalizeStockImageImportId(importIdValue);
  if (!importId) {
    return;
  }
  db
    .prepare(`
        UPDATE stock_image_imports
        SET status = ?, error_message = ?
        WHERE import_id = ? AND status != 'applied'
      `)
    .run(cancelled ? "cancelled" : "failed", String(message ?? "").trim().slice(0, 1000) || null, importId);
}

export function applyStockImageImport(db: DatabaseSync, input: ApplyStockImageImportInput): { ok: true; message: string; importId: string; appliedLineCount: number; totalQuantity: number } | { ok: false; message: string } {
  const importId = normalizeStockImageImportId(input.importId);
  const imageHash = String(input.imageHash ?? "").trim().toLowerCase();
  if (!importId || !isSha256Hex(imageHash)) {
    return { ok: false, message: "Görsel stok taslağı geçersiz." };
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = applyStockImageImportInTransaction(db, {
      importId,
      imageHash,
      lines: input.lines,
      source: "desktop",
      actorDeviceId: "",
      duplicateWarningAcknowledged: input.duplicateWarningAcknowledged === true,
      canOverrideDuplicate: true,
      now: new Date().toISOString()
    });
    if (!result.ok) {
      db.exec("ROLLBACK");
      return result;
    }
    db.exec("COMMIT");
    return result;
  } catch {
    db.exec("ROLLBACK");
    return { ok: false, message: "Stoklar tek işlem içinde güncellenemedi." };
  }
}

export function applyStockImageImportInTransaction(db: DatabaseSync, input: ApplyStockImageImportTransactionInput): { ok: true; message: string; importId: string; appliedLineCount: number; totalQuantity: number } | { ok: false; message: string } {
  const record = db
    .prepare("SELECT source, device_id, image_hash, status FROM stock_image_imports WHERE import_id = ? LIMIT 1")
    .get(input.importId) as Record<string, unknown> | undefined;
  if (!record || String(record.image_hash ?? "").toLowerCase() !== input.imageHash || String(record.source ?? "") !== input.source) {
    return { ok: false, message: "Görsel stok taslağı bulunamadı veya değiştirilmiş." };
  }
  if (String(record.status ?? "") === "applied") {
    return { ok: false, message: "Bu içe aktarma daha önce uygulanmış." };
  }
  if (!["analyzing", "review"].includes(String(record.status ?? ""))) {
    return { ok: false, message: "Bu görsel stok taslağı artık uygulanamaz." };
  }
  const lines = normalizeStockImageApplyLines(input.lines);
  if (!lines || lines.length === 0) {
    return { ok: false, message: "Uygulanacak geçerli stok satırı bulunamadı." };
  }
  const duplicate = db
    .prepare(`
        SELECT import_id
        FROM stock_image_imports
        WHERE image_hash = ? AND status = 'applied' AND import_id != ?
        LIMIT 1
      `)
    .get(input.imageHash, input.importId);
  if (duplicate && !input.duplicateWarningAcknowledged) {
    return { ok: false, message: "Bu görsel daha önce stok girişinde kullanılmış olabilir." };
  }
  if (duplicate && !input.canOverrideDuplicate) {
    return { ok: false, message: "Bu görseli yeniden uygulamak için yönetici yetkisi gerekli." };
  }

  const candidates = new Map(getTrackedStockCandidates(db).map((candidate) => [candidate.id, candidate]));
  for (const line of lines) {
    if (!candidates.has(line.menu_item_id)) {
      return { ok: false, message: "Satırlardan biri artık mevcut veya stok takipli bir menü ürünü değil." };
    }
  }

  db
    .prepare("UPDATE stock_image_import_lines SET status = 'ignored', approved_quantity = NULL WHERE import_id = ?")
    .run(input.importId);
  const insertApprovedLine = db.prepare(`
      INSERT INTO stock_image_import_lines (
        id, import_id, raw_text, matched_menu_item_id, suggested_quantity,
        approved_quantity, source_quantity_text, confidence, status, note, created_at
      ) VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, 'approved', NULL, ?)
    `);
  let totalQuantity = 0;
  for (const line of lines) {
    insertApprovedLine.run(
      `stock_image_import_line_${randomUUID()}`,
      input.importId,
      line.raw_text.slice(0, 1000),
      line.menu_item_id,
      line.quantity,
      line.confidence,
      input.now
    );
    const result = mutateStoredMenuStock(db, {
      menuItemId: line.menu_item_id,
      type: "image_import_add",
      quantityChange: line.quantity,
      sourceType: "stock_image_import",
      sourceId: input.importId,
      actorSource: input.source,
      actorDeviceId: input.actorDeviceId,
      note: line.raw_text.slice(0, 500),
      now: input.now
    });
    if (!result.ok) {
      return result;
    }
    totalQuantity += line.quantity;
  }
  const update = db
    .prepare(`
        UPDATE stock_image_imports
        SET status = 'applied', applied_at = ?, error_message = NULL
        WHERE import_id = ? AND status IN ('analyzing', 'review')
      `)
    .run(input.now, input.importId);
  if (Number(update.changes) !== 1) {
    return { ok: false, message: "Görsel stok taslağı uygulanmış olarak kaydedilemedi." };
  }
  insertDatabaseEvent(db, {
    type: "stock.image_import_applied",
    actorType: input.source,
    actorId: input.actorDeviceId,
    entityType: "stock_image_import",
    entityId: input.importId,
    payload: {
      source: input.source,
      line_count: lines.length,
      total_quantity: totalQuantity
    },
    now: input.now
  });
  queueStoredSyncJob(db, "menu_publish", input.now);
  queueStoredSyncJob(db, "android_snapshot", input.now);
  return {
    ok: true,
    message: `${lines.length} stok satırı güncellendi.`,
    importId: input.importId,
    appliedLineCount: lines.length,
    totalQuantity
  };
}
