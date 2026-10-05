import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");

const appPath = join(process.cwd(), "apps", "desktop-app");
const dataDir = join(process.cwd(), "artifacts", "finance-db-smoke", String(Date.now()));
mkdirSync(dataDir, { recursive: true });

const database = new DesktopDatabase({
  appPath,
  userDataPath: dataDir
});

try {
  database.initialize();
  verifyFinanceFoundation(database.databasePath);
  console.log("finance-db-smoke-ok");
} finally {
  database.close();
}

function verifyFinanceFoundation(databasePath) {
  const sqlite = new DatabaseSync(databasePath);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  try {
    sqlite.exec("PRAGMA foreign_keys = ON");

    const reservationColumns = sqlite.prepare("PRAGMA table_info(reservations)").all();
    assert.ok(reservationColumns.some((column) => column.name === "agreed_total_minor"));
    assert.ok(reservationColumns.some((column) => column.name === "currency"));

    const roomColumns = sqlite.prepare("PRAGMA table_info(rooms)").all();
    assert.ok(roomColumns.some((column) => column.name === "nightly_price_minor"));
    assert.ok(roomColumns.some((column) => column.name === "price_currency"));

    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'finance_entries'").get().count,
      1
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'pension_payments'").get().count,
      1
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'view' AND name = 'pension_payment_totals'").get().count,
      1
    );

    sqlite.prepare(`
      INSERT INTO tables (
        id, name, area, capacity, status, current_customer_id, current_reservation_id,
        notes, is_active, sort_order, created_at, updated_at, deleted_at, sync_status
      ) VALUES (?, ?, ?, 4, 'available', '', '', '', 1, 999, ?, ?, '', 'local_only')
    `).run("finance_smoke_table", "Finans Test Masası", "Test", now, now);

    sqlite.prepare(`
      INSERT INTO table_orders (
        id, table_id, status, opened_at, closed_at, subtotal, discount_total, total,
        note, created_at, updated_at
      ) VALUES (?, ?, 'open', ?, '', 250.50, 0, 250.50, '', ?, ?)
    `).run("finance_smoke_order", "finance_smoke_table", now, now, now);

    sqlite.prepare(`
      UPDATE table_orders
      SET status = 'paid', closed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, "finance_smoke_order");

    const restaurantEntry = sqlite.prepare(`
      SELECT direction, amount_minor, currency, category, source_type, source_id
      FROM finance_entries
      WHERE source_type = 'restaurant_order' AND source_id = ?
    `).get("finance_smoke_order");

    assert.deepEqual(
      { ...restaurantEntry },
      {
        direction: "income",
        amount_minor: 25050,
        currency: "TRY",
        category: "restaurant",
        source_type: "restaurant_order",
        source_id: "finance_smoke_order"
      },
      "Paid restaurant order must create one automatic income entry in kuruş."
    );

    sqlite.prepare(`
      UPDATE table_orders
      SET note = 'Tekrar güncellendi', updated_at = ?
      WHERE id = ?
    `).run(new Date(Date.now() + 1000).toISOString(), "finance_smoke_order");

    assert.equal(
      sqlite.prepare(`
        SELECT COUNT(*) AS count
        FROM finance_entries
        WHERE source_type = 'restaurant_order' AND source_id = ?
      `).get("finance_smoke_order").count,
      1,
      "Updating a paid order must not duplicate its automatic income entry."
    );

    const cancelledAt = new Date(Date.now() + 1500).toISOString();
    sqlite.prepare(`
      UPDATE table_orders
      SET status = 'cancelled', updated_at = ?
      WHERE id = ?
    `).run(cancelledAt, "finance_smoke_order");
    assert.equal(
      sqlite.prepare(`
        SELECT deleted_at
        FROM finance_entries
        WHERE source_type = 'restaurant_order' AND source_id = ?
      `).get("finance_smoke_order").deleted_at,
      cancelledAt,
      "Moving a paid order away from paid must remove it from visible cash totals."
    );

    const repaidAt = new Date(Date.now() + 1750).toISOString();
    sqlite.prepare(`
      UPDATE table_orders
      SET status = 'paid', closed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(repaidAt, repaidAt, "finance_smoke_order");
    assert.equal(
      sqlite.prepare(`
        SELECT deleted_at
        FROM finance_entries
        WHERE source_type = 'restaurant_order' AND source_id = ?
      `).get("finance_smoke_order").deleted_at,
      "",
      "Returning the order to paid must reactivate the same finance entry."
    );

    sqlite.prepare(`
      INSERT INTO reservations (
        id, request_id, customer_id, reservation_type, status, title, start_date, end_date, time,
        guest_count, adult_count, child_count, room_ids_json, table_ids_json, notes, price_note,
        payment_status, created_at, updated_at, deleted_at, sync_status, agreed_total_minor, currency
      ) VALUES (?, '', '', 'room', 'approved', ?, ?, ?, '', 2, 2, 0, '[]', '[]', '', '',
        'not_required', ?, ?, '', 'local_only', 450000, 'TRY')
    `).run("finance_smoke_reservation", "Finans Test Konaklaması", today, today, now, now);

    assert.equal(
      sqlite.prepare("SELECT payment_status FROM reservations WHERE id = ?").get("finance_smoke_reservation").payment_status,
      "unpaid",
      "A reservation with an agreed total must start as unpaid."
    );

    sqlite.prepare(`
      INSERT INTO pension_payments (
        id, reservation_id, amount_minor, currency, payment_method, paid_at,
        note, created_at, updated_at, deleted_at, sync_status
      ) VALUES (?, ?, 100000, 'TRY', 'cash', ?, 'Kapora', ?, ?, '', 'local_only')
    `).run("finance_smoke_payment_1", "finance_smoke_reservation", now, now, now);

    assert.equal(
      sqlite.prepare("SELECT payment_status FROM reservations WHERE id = ?").get("finance_smoke_reservation").payment_status,
      "partial"
    );

    const firstPensionEntry = sqlite.prepare(`
      SELECT direction, amount_minor, payment_method, category, deleted_at
      FROM finance_entries
      WHERE source_type = 'pension_payment' AND source_id = ?
    `).get("finance_smoke_payment_1");
    assert.deepEqual({ ...firstPensionEntry }, {
      direction: "income",
      amount_minor: 100000,
      payment_method: "cash",
      category: "pension",
      deleted_at: ""
    });

    sqlite.prepare(`
      INSERT INTO pension_payments (
        id, reservation_id, amount_minor, currency, payment_method, paid_at,
        note, created_at, updated_at, deleted_at, sync_status
      ) VALUES (?, ?, 350000, 'TRY', 'card', ?, 'Kalan ödeme', ?, ?, '', 'local_only')
    `).run("finance_smoke_payment_2", "finance_smoke_reservation", now, now, now);

    assert.equal(
      sqlite.prepare("SELECT payment_status FROM reservations WHERE id = ?").get("finance_smoke_reservation").payment_status,
      "paid"
    );

    const paidTotals = sqlite.prepare(`
      SELECT agreed_total_minor, paid_total_minor, remaining_minor, currency
      FROM pension_payment_totals
      WHERE reservation_id = ?
    `).get("finance_smoke_reservation");
    assert.deepEqual({ ...paidTotals }, {
      agreed_total_minor: 450000,
      paid_total_minor: 450000,
      remaining_minor: 0,
      currency: "TRY"
    });

    const deletedAt = new Date(Date.now() + 2000).toISOString();
    sqlite.prepare(`
      UPDATE pension_payments
      SET deleted_at = ?, updated_at = ?
      WHERE id = ?
    `).run(deletedAt, deletedAt, "finance_smoke_payment_2");

    assert.equal(
      sqlite.prepare("SELECT payment_status FROM reservations WHERE id = ?").get("finance_smoke_reservation").payment_status,
      "partial",
      "Soft deleting a payment must recalculate the reservation payment status."
    );

    assert.equal(
      sqlite.prepare(`
        SELECT deleted_at
        FROM finance_entries
        WHERE source_type = 'pension_payment' AND source_id = ?
      `).get("finance_smoke_payment_2").deleted_at,
      deletedAt,
      "Soft deleting a pension payment must hide its linked finance entry too."
    );

    const partialTotals = sqlite.prepare(`
      SELECT paid_total_minor, remaining_minor
      FROM pension_payment_totals
      WHERE reservation_id = ?
    `).get("finance_smoke_reservation");
    assert.deepEqual({ ...partialTotals }, {
      paid_total_minor: 100000,
      remaining_minor: 350000
    });

    sqlite.prepare(`
      INSERT INTO finance_entries (
        id, direction, amount_minor, currency, payment_method, category, description,
        occurred_at, source_type, source_id, note, created_at, updated_at, deleted_at, sync_status
      ) VALUES (?, 'expense', 125000, 'TRY', 'cash', 'stock', 'Market / stok', ?,
        'manual', '', '', ?, ?, '', 'local_only')
    `).run("finance_smoke_expense", now, now, now);

    assert.equal(
      sqlite.prepare("SELECT amount_minor FROM finance_entries WHERE id = ?").get("finance_smoke_expense").amount_minor,
      125000
    );
  } finally {
    sqlite.close();
  }
}
