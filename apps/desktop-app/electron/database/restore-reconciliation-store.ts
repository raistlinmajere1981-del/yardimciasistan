import { DatabaseSync } from "node:sqlite";
import { createId } from "@yardimci-asistan/shared";
import type { WebOrderEnvelope } from "@yardimci-asistan/sync-core";
import { DESKTOP_PUBLICATION_JOB_TYPES } from "../desktop-publication-registry";
import { queueSyncJob } from "./sync-runtime-store";

export interface RestoreReconciliationStatus {
  operationId: string;
  state: "activation_pending" | "reconciliation_pending" | "complete";
  target: string;
  expectedEpoch: number | null;
  sourceEpoch: number;
  requestsThrough: number;
  ordersThrough: number;
  requestsComplete: boolean;
  ordersComplete: boolean;
  remainingPublications: number;
}

export function getRestoreReconciliationStatus(db: DatabaseSync): RestoreReconciliationStatus | undefined {
  const row = db.prepare("SELECT * FROM sync_restore_reconciliation WHERE id = 'primary'").get();
  if (!row) return undefined;
  return { operationId: String(row.operation_id), state: row.state as RestoreReconciliationStatus["state"],
    target: String(row.target), expectedEpoch: row.expected_epoch === null ? null : Number(row.expected_epoch),
    sourceEpoch: Number(row.source_epoch), requestsThrough: Number(row.requests_through), ordersThrough: Number(row.orders_through),
    requestsComplete: Boolean(row.requests_complete), ordersComplete: Boolean(row.orders_complete),
    remainingPublications: Number(db.prepare("SELECT COUNT(*) AS n FROM sync_restore_publications WHERE applied_revision = 0").get()!.n) };
}

/** Runs against the STAGED restored database before the relaunch marker is
 * committed. No network or runtime reset. All jobs/identity/replay state commit
 * together, so a crash cannot leave half a publication registry queued.
 */
export function beginRestoreReconciliation(db: DatabaseSync, operationId: string, clientId: string, currentDatabasePath?: string) {
  if (getRestoreReconciliationStatus(db)?.operationId === operationId) return;
  const retained = new Map<string, string>();
  if (currentDatabasePath) {
    const current = new DatabaseSync(currentDatabasePath, { readOnly: true });
    try {
      current.exec("BEGIN");
      const business = db.prepare("SELECT id FROM business WHERE deleted_at = '' LIMIT 1").get()?.id;
      if (business && current.prepare("SELECT id FROM business WHERE deleted_at = '' LIMIT 1").get()?.id === business) {
        for (const row of current.prepare("SELECT * FROM sync_restore_order_snapshots").all()) retained.set(String(row.web_order_id), String(row.snapshot_json));
        for (const row of current.prepare(`SELECT id, business_id, customer_id, customer_name, buyer_snapshot_json, delivery_snapshot_json,
          source, source_reference, subtotal, discount_total, total, currency, note, placed_at, created_at
          FROM commerce_orders WHERE business_id = ? AND source IN ('web-online-sales', 'web-dealer') AND source_reference != ''`).all(business)) {
          const items = current.prepare(`SELECT product_id, product_name, sku, barcode, unit, unit_price, quantity, line_total, tax_rate, created_at
            FROM commerce_order_items WHERE order_id = ? ORDER BY id`).all(row.id!);
          const { id: _id, ...order } = row;
          retained.set(String(order.source_reference), JSON.stringify({ kind: "order", order, items }));
        }
        for (const rejected of current.prepare("SELECT * FROM commerce_dealer_order_rejections").all()) {
          if (!retained.has(String(rejected.web_order_id))) retained.set(String(rejected.web_order_id), JSON.stringify({ kind: "rejected", rejected }));
        }
      }
      current.exec("COMMIT");
    } finally { current.close(); }
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const now = new Date().toISOString();
    db.exec("DELETE FROM sync_outbox; DELETE FROM sync_outbox_revisions; DELETE FROM sync_publication_payloads; DELETE FROM sync_publication_sources; DELETE FROM sync_restore_publications; DELETE FROM sync_restore_reconciliation;");
    db.prepare("INSERT INTO desktop_sync_identity(id, client_id) VALUES ('primary', ?) ON CONFLICT(id) DO UPDATE SET client_id = excluded.client_id").run(clientId);
    db.prepare("UPDATE sync_runtime SET publication_target = '', request_cursor = 0, acknowledged_cursor = 0, web_order_cursor = 0, web_order_acknowledged_cursor = 0, last_attempt_at = '', last_success_at = '', last_error = '', consecutive_failures = 0, updated_at = ? WHERE id = 'primary'").run(now);
    db.prepare("INSERT INTO sync_restore_reconciliation(id, operation_id, state, created_at) VALUES ('primary', ?, 'activation_pending', ?)").run(operationId, now);
    for (const jobType of DESKTOP_PUBLICATION_JOB_TYPES) {
      queueSyncJob(db, jobType, now);
      db.prepare("INSERT INTO sync_restore_publications(job_key) VALUES (?)").run(jobType.replace(/_publish$/, ""));
    }
    const save = db.prepare("INSERT INTO sync_restore_order_snapshots(web_order_id, snapshot_json) VALUES (?, ?) ON CONFLICT(web_order_id) DO UPDATE SET snapshot_json = excluded.snapshot_json");
    for (const [id, snapshot] of retained) save.run(id, snapshot);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function saveRestoreActivationExpectation(db: DatabaseSync, operationId: string, target: string, epoch: number, requests: number, orders: number) {
  db.prepare("UPDATE sync_restore_reconciliation SET target = ?, expected_epoch = ?, requests_through = ?, orders_through = ? WHERE operation_id = ? AND state = 'activation_pending' AND expected_epoch IS NULL")
    .run(target, epoch, requests, orders, operationId);
}

export function finishRestoreActivation(db: DatabaseSync, operationId: string, target: string, epoch: number) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = getRestoreReconciliationStatus(db);
    if (!current || current.operationId !== operationId || current.target !== target
        || (current.state === "activation_pending" ? current.expectedEpoch !== epoch - 1 : current.sourceEpoch !== epoch)) {
      throw new Error("Restore activation continuation uyuşmuyor.");
    }
    db.prepare("INSERT INTO sync_publication_sources(target, source_epoch) VALUES (?, ?) ON CONFLICT(target) DO UPDATE SET source_epoch = excluded.source_epoch").run(target, epoch);
    db.prepare("UPDATE sync_restore_reconciliation SET state = 'reconciliation_pending', source_epoch = ? WHERE operation_id = ? AND state = 'activation_pending' AND expected_epoch = ? AND target = ?")
      .run(epoch, operationId, epoch - 1, target);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function finishRestoreReplay(db: DatabaseSync, kind: "requests" | "orders") {
  db.prepare(`UPDATE sync_restore_reconciliation SET ${kind}_complete = 1 WHERE state = 'reconciliation_pending'`).run();
  finishRestoreReconciliationIfReady(db);
}

export function finishRestoreReconciliationIfReady(db: DatabaseSync) {
  db.prepare(`UPDATE sync_restore_reconciliation SET state = 'complete', completed_at = ? WHERE state = 'reconciliation_pending'
    AND requests_complete = 1 AND orders_complete = 1 AND NOT EXISTS (SELECT 1 FROM sync_restore_publications WHERE applied_revision = 0)
    AND NOT EXISTS (SELECT 1 FROM sync_outbox o JOIN sync_restore_publications r ON r.job_key = o.job_key)`)
    .run(new Date().toISOString());
}

/** Only explicit, authenticated restore replay calls this facade. Snapshot rows
 * were copied locally before replacement, never supplied by the Web. Existing
 * restored owner decisions (including tombstones) win. Missing historical price
 * evidence blocks/retries rather than silently repricing or acknowledging loss.
 */
export function replayRetainedWebOrder(db: DatabaseSync, envelope: WebOrderEnvelope): boolean {
  const restore = getRestoreReconciliationStatus(db);
  if (!restore || restore.state !== "reconciliation_pending" || restore.ordersComplete
      || envelope.syncSeq > restore.ordersThrough) throw new Error("Restore sipariş replay sınırı geçersiz.");
  const source = envelope.kind === "dealer" ? "web-dealer" : "web-online-sales";
  db.exec("BEGIN IMMEDIATE");
  try {
    const businessId = db.prepare("SELECT id FROM business WHERE deleted_at = '' LIMIT 1").get()!.id!;
    if (db.prepare("SELECT 1 FROM commerce_orders WHERE business_id = ? AND source = ? AND source_reference = ?").get(businessId, source, envelope.id)
        || (source === "web-dealer" && db.prepare("SELECT 1 FROM commerce_dealer_order_rejections WHERE web_order_id = ?").get(envelope.id))) {
      db.exec("COMMIT"); return true;
    }
    const row = db.prepare("SELECT snapshot_json FROM sync_restore_order_snapshots WHERE web_order_id = ?").get(envelope.id);
    if (!row) {
      if (envelope.previouslyAcknowledged) throw new Error("Geçmiş Web siparişinin canonical fiyat snapshot'ı yok; replay bekliyor.");
      db.exec("COMMIT"); return false;
    }
    const snapshot = JSON.parse(String(row.snapshot_json));
    if (snapshot.kind === "rejected") {
      if (source !== "web-dealer") throw new Error("Restore sipariş kaynağı uyuşmuyor.");
      const rejected = snapshot.rejected;
      db.prepare("INSERT INTO commerce_dealer_order_rejections(web_order_id, dealer_access_id, access_revision, reason, created_at) VALUES (?, ?, ?, 'access_revoked', ?)")
        .run(envelope.id, rejected.dealer_access_id, rejected.access_revision, rejected.created_at);
    } else {
      const order = snapshot.order;
      if (snapshot.kind !== "order" || order.source !== source || order.source_reference !== envelope.id || order.business_id !== businessId
          || JSON.stringify(snapshot.items.map((item: { product_id: string; quantity: number }) => [item.product_id, Number(item.quantity)]).sort())
            !== JSON.stringify(envelope.items.map(item => [item.productId, Number(item.quantity)]).sort())) throw new Error("Restore sipariş ingress snapshot'ı uyuşmuyor.");
      const customerId = order.customer_id && db.prepare("SELECT 1 FROM customers WHERE id = ? AND business_id = ?").get(order.customer_id, businessId) ? order.customer_id : null;
      const id = createId("commerce_order_");
      db.prepare(`INSERT INTO commerce_orders(id, business_id, customer_id, customer_name, buyer_snapshot_json, delivery_snapshot_json,
        status, source, source_reference, subtotal, discount_total, total, currency, note, placed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'placed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, businessId, customerId, order.customer_name, order.buyer_snapshot_json, order.delivery_snapshot_json, source, envelope.id,
          order.subtotal, order.discount_total, order.total, order.currency, order.note, order.placed_at, order.created_at, new Date().toISOString());
      const insert = db.prepare(`INSERT INTO commerce_order_items(id, order_id, product_id, product_name, sku, barcode, unit, unit_price, quantity, line_total, tax_rate, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const item of snapshot.items) insert.run(createId("commerce_order_item_"), id, item.product_id, item.product_name, item.sku, item.barcode,
        item.unit, item.unit_price, item.quantity, item.line_total, item.tax_rate, item.created_at);
    }
    db.exec("COMMIT"); return true;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
