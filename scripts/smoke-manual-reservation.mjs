import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const dataRoot = mkdtempSync(join(tmpdir(), "yardimci-manual-reservation-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataRoot
});

try {
  database.initialize();
  const now = new Date().toISOString();
  const sqlite = new DatabaseSync(database.databasePath);
  try {
    sqlite.prepare(`
      INSERT INTO customers (
        id, full_name, phone, email, source, notes, tags_json, last_contact_at,
        identity_type, identity_number, nationality, birth_date, gender,
        document_serial_number, document_expiry_date, birth_place, mother_name,
        father_name, issuing_authority, address, created_at, updated_at,
        deleted_at, sync_status
      ) VALUES (?, ?, ?, '', 'manual', '', '[]', ?, '', '', '', '', '', '', '', '', '', '', '', '', ?, ?, '', 'local_only')
    `).run("manual_reservation_customer", "Rezervasyon Test Müşterisi", "+905551112233", now, now, now);
  } finally {
    sqlite.close();
  }

  const created = database.saveManualReservation({
    customerId: "manual_reservation_customer",
    startDate: "2035-09-01",
    endDate: "2035-09-03",
    guestCount: 2,
    notes: "Telefonla alınan test rezervasyonu."
  });
  assert.equal(created.ok, true, created.message);
  const reservation = created.dashboardData.reservations.find(
    (item) => item.customerId === "manual_reservation_customer" && item.startDate === "2035-09-01"
  );
  assert.ok(reservation, "Manual reservation must appear in dashboard data");
  assert.match(reservation.requestId, /^manual:/);
  assert.equal(reservation.status, "approved");
  assert.equal(reservation.reservationType, "room");
  assert.equal(reservation.guestCount, 2);
  assert.equal(reservation.notes, "Telefonla alınan test rezervasyonu.");

  const invalidRange = database.saveManualReservation({
    customerId: "manual_reservation_customer",
    startDate: "2035-09-03",
    endDate: "2035-09-03",
    guestCount: 1,
    notes: ""
  });
  assert.equal(invalidRange.ok, false);

  const verify = new DatabaseSync(database.databasePath, { readOnly: true });
  try {
    const row = verify.prepare("SELECT request_id, status, reservation_type FROM reservations WHERE id = ?").get(reservation.id);
    assert.equal(row.request_id, `manual:${reservation.id}`);
    assert.equal(row.status, "approved");
    assert.equal(row.reservation_type, "room");
    const eventCount = Number(
      verify.prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'reservation.created' AND entity_id = ?").get(reservation.id)?.count ?? 0
    );
    assert.ok(eventCount >= 1, "reservation.created event missing");
    assert.equal(String(verify.prepare("PRAGMA integrity_check").get().integrity_check), "ok");
  } finally {
    verify.close();
  }

  console.log("manual-reservation-smoke-ok: direct create, dashboard mapping, validation and event verified");
} finally {
  database.close();
  rmSync(dataRoot, { recursive: true, force: true });
}
