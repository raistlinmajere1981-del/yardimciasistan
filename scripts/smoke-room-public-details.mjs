import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { saveRoomProfile } = require("../apps/desktop-app/dist-electron/room-profile.js");

const dataRoot = mkdtempSync(join(tmpdir(), "yardimci-room-public-details-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataRoot
});

try {
  database.initialize();
  const room = database.getDashboardData().rooms.find((candidate) => candidate.isActive);
  assert.ok(room, "Fixture must provide at least one active room");

  const beforeDb = new DatabaseSync(database.databasePath, { readOnly: true });
  const before = beforeDb.prepare(`
    SELECT status, is_active, sort_order, nightly_price_minor, price_currency
    FROM rooms
    WHERE id = ?
  `).get(room.id);
  beforeDb.close();
  assert.ok(before);

  const result = saveRoomProfile(database.databasePath, {
    roomId: room.id,
    name: "Deniz Manzaralı Oda",
    amountMinor: Number(before.nightly_price_minor ?? 0),
    currency: String(before.price_currency ?? "TRY"),
    publicDetails: {
      roomId: room.id,
      name: "Deniz Manzaralı Oda",
      number: "A-4",
      capacity: 2,
      bedInfo: "1 çift kişilik yatak",
      floor: "1. kat",
      features: ["air_conditioning", "wifi", "sea_view", "internal_secret"],
      description: "Deniz manzaralı, balkon tarafındaki sessiz oda.",
      priceNote: "Fiyat sezona ve kişi sayısına göre değişebilir."
    }
  });
  assert.equal(result.ok, true, result.message);

  const updated = database.getDashboardData().rooms.find((candidate) => candidate.id === room.id);
  assert.ok(updated);
  assert.equal(updated.name, "Deniz Manzaralı Oda");
  assert.equal(updated.number, "A-4");
  assert.equal(updated.capacity, 2);
  assert.equal(updated.bedInfo, "1 çift kişilik yatak");
  assert.equal(updated.floor, "1. kat");
  assert.deepEqual(updated.features, ["air_conditioning", "wifi", "sea_view"]);
  assert.equal(updated.description, "Deniz manzaralı, balkon tarafındaki sessiz oda.");
  assert.equal(updated.priceNote, "Fiyat sezona ve kişi sayısına göre değişebilir.");

  const afterDb = new DatabaseSync(database.databasePath, { readOnly: true });
  try {
    const after = afterDb.prepare(`
      SELECT status, is_active, sort_order, nightly_price_minor, price_currency, features_json
      FROM rooms
      WHERE id = ?
    `).get(room.id);
    assert.ok(after);
    assert.equal(after.status, before.status, "Public detail edits must not change operational room status");
    assert.equal(after.is_active, before.is_active, "Public detail edits must not change active state");
    assert.equal(after.sort_order, before.sort_order, "Public detail edits must not change sort order");
    assert.equal(after.nightly_price_minor, before.nightly_price_minor, "Public detail edits must preserve the current nightly price");
    assert.equal(after.price_currency, before.price_currency, "Public detail edits must preserve the current price currency");
    assert.deepEqual(JSON.parse(String(after.features_json ?? "[]")), ["air_conditioning", "wifi", "sea_view"]);
  } finally {
    afterDb.close();
  }

  const invalidCapacity = saveRoomProfile(database.databasePath, {
    roomId: room.id,
    name: updated.name,
    amountMinor: Number(before.nightly_price_minor ?? 0),
    currency: String(before.price_currency ?? "TRY"),
    publicDetails: {
      roomId: room.id,
      name: updated.name,
      number: updated.number,
      capacity: 0,
      bedInfo: updated.bedInfo,
      floor: updated.floor,
      features: updated.features,
      description: updated.description,
      priceNote: updated.priceNote
    }
  });
  assert.equal(invalidCapacity.ok, false);
  assert.match(invalidCapacity.message, /kapasite/i);

  const mismatchedRoom = saveRoomProfile(database.databasePath, {
    roomId: room.id,
    name: updated.name,
    amountMinor: Number(before.nightly_price_minor ?? 0),
    currency: String(before.price_currency ?? "TRY"),
    publicDetails: {
      roomId: "different-room",
      name: updated.name,
      number: updated.number,
      capacity: updated.capacity,
      bedInfo: updated.bedInfo,
      floor: updated.floor,
      features: updated.features,
      description: updated.description,
      priceNote: updated.priceNote
    }
  });
  assert.equal(mismatchedRoom.ok, false);
  assert.match(mismatchedRoom.message, /geçersiz/i);

  console.log("room-public-details-smoke-ok: persistence, allow-listing, validation and operational isolation verified");
} finally {
  database.close();
  rmSync(dataRoot, { recursive: true, force: true });
}
