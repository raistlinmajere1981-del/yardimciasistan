import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { DesktopFinanceService } = require("../apps/desktop-app/dist-electron/finance.js");

const appPath = join(process.cwd(), "apps", "desktop-app");
const dataDir = join(process.cwd(), "artifacts", "finance-service-smoke", String(Date.now()));
mkdirSync(dataDir, { recursive: true });

const database = new DesktopDatabase({ appPath, userDataPath: dataDir });

try {
  database.initialize();
  const service = new DesktopFinanceService(database.databasePath);
  const baseline = service.getData();

  const incomeResult = service.saveManualEntry({
    direction: "income",
    amountMinor: 10000,
    paymentMethod: "cash",
    category: "other_income",
    description: "Smoke gelir"
  });
  assert.equal(incomeResult.ok, true);
  assert.equal(incomeResult.data.todayIncomeMinor, baseline.todayIncomeMinor + 10000);

  const expenseResult = service.saveManualEntry({
    direction: "expense",
    amountMinor: 2500,
    paymentMethod: "card",
    category: "stock",
    description: "Smoke gider"
  });
  assert.equal(expenseResult.ok, true);
  assert.equal(expenseResult.data.todayExpenseMinor, baseline.todayExpenseMinor + 2500);
  assert.equal(
    expenseResult.data.todayNetMinor,
    baseline.todayNetMinor + 7500,
    "Manual income and expense must change today's net by the expected minor-unit amount."
  );

  const manualIncome = expenseResult.data.recentEntries.find((entry) => entry.description === "Smoke gelir");
  assert.ok(manualIncome, "Manual income must appear in recent entries.");

  const deleteResult = service.deleteManualEntry(manualIncome.id);
  assert.equal(deleteResult.ok, true);
  assert.equal(deleteResult.data.recentEntries.some((entry) => entry.id === manualIncome.id), false);
  assert.equal(deleteResult.data.todayIncomeMinor, baseline.todayIncomeMinor);

  const sqlite = new DatabaseSync(database.databasePath);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  try {
    sqlite.prepare(`
      INSERT INTO reservations (
        id, request_id, customer_id, reservation_type, status, title, start_date, end_date, time,
        guest_count, adult_count, child_count, room_ids_json, table_ids_json, notes, price_note,
        payment_status, created_at, updated_at, deleted_at, sync_status
      ) VALUES (?, '', '', 'room', 'approved', ?, ?, ?, '', 2, 2, 0, '[]', '[]', '', '',
        'not_required', ?, ?, '', 'local_only')
    `).run("finance_service_reservation", "Kasa Smoke Konaklama", today, shiftDate(today, 2), now, now);
  } finally {
    sqlite.close();
  }

  const beforeTotal = service.getData();
  const zeroPriceReservation = beforeTotal.pensionBalances.find((item) => item.reservationId === "finance_service_reservation");
  assert.ok(zeroPriceReservation, "Approved pension reservation without price must be offered for amount entry.");
  assert.equal(zeroPriceReservation.agreedTotalMinor, 0);

  const totalResult = service.setReservationAgreedTotal({
    reservationId: "finance_service_reservation",
    amountMinor: 450000,
    currency: "TRY"
  });
  assert.equal(totalResult.ok, true);
  const priced = totalResult.data.pensionBalances.find((item) => item.reservationId === "finance_service_reservation");
  assert.ok(priced);
  assert.equal(priced.agreedTotalMinor, 450000);
  assert.equal(priced.remainingMinor, 450000);

  const partialResult = service.addPensionPayment({
    reservationId: "finance_service_reservation",
    amountMinor: 100000,
    paymentMethod: "cash",
    note: "Kapora"
  });
  assert.equal(partialResult.ok, true);
  const partial = partialResult.data.pensionBalances.find((item) => item.reservationId === "finance_service_reservation");
  assert.ok(partial);
  assert.equal(partial.paidTotalMinor, 100000);
  assert.equal(partial.remainingMinor, 350000);
  assert.equal(partial.paymentStatus, "partial");
  assert.ok(
    partialResult.data.recentEntries.some((entry) => entry.sourceType === "pension_payment" && entry.amountMinor === 100000),
    "Pension payment must create an automatic finance income entry."
  );

  const overpay = service.addPensionPayment({
    reservationId: "finance_service_reservation",
    amountMinor: 350001,
    paymentMethod: "card"
  });
  assert.equal(overpay.ok, false, "Payment greater than the remaining balance must be rejected.");

  const paidResult = service.addPensionPayment({
    reservationId: "finance_service_reservation",
    amountMinor: 350000,
    paymentMethod: "card"
  });
  assert.equal(paidResult.ok, true);
  const paid = paidResult.data.pensionBalances.find((item) => item.reservationId === "finance_service_reservation");
  assert.ok(paid);
  assert.equal(paid.remainingMinor, 0);
  assert.equal(paid.paymentStatus, "paid");

  console.log("finance-service-smoke-ok");
} finally {
  database.close();
}

function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
