import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  getBusinessLayout,
  saveBusinessLayout
} = require("../apps/desktop-app/dist-electron/business-layout.js");

const root = process.cwd();
const dataDir = mkdtempSync(join(tmpdir(), "yardimci-business-layout-"));
const database = new DesktopDatabase({
  appPath: join(root, "apps", "desktop-app"),
  userDataPath: dataDir
});

try {
  database.initialize();

  const setup = database.saveInitialSetup({
    businessName: "Layout Smoke İşletmesi",
    profileId: "pension_restaurant",
    phone: "+905550001122",
    whatsapp: "",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "layout-smoke-secret",
    autoSyncEnabled: true,
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
    servicePreferences: { whatsapp: false, android: false }
  });
  assert.equal(setup.ok, true, setup.ok ? "" : setup.message);

  const seeded = saveBusinessLayout(database.databasePath, {
    rooms: [
      {
        clientKey: "seed-room-1",
        name: "Oda 101",
        number: "101",
        capacity: 2,
        bedInfo: "1 çift kişilik yatak",
        floor: "",
        features: [],
        description: "",
        priceNote: "",
        nightlyPriceMinor: 10000,
        currency: "TRY"
      },
      {
        clientKey: "seed-room-2",
        name: "Oda 102",
        number: "102",
        capacity: 2,
        bedInfo: "1 çift kişilik yatak",
        floor: "",
        features: [],
        description: "",
        priceNote: "",
        nightlyPriceMinor: 10000,
        currency: "TRY"
      }
    ],
    tableCategories: [
      { name: "Salon", tableCount: 2 },
      { name: "Teras", tableCount: 1 }
    ]
  });
  assert.equal(seeded.ok, true, seeded.ok ? "" : seeded.message);

  const initial = getBusinessLayout(database.databasePath);
  assert.deepEqual(initial.capabilities, { rooms: true, tables: true });
  assert.deepEqual(initial.publication, { rooms: true, tables: false });
  assert.equal(initial.rooms.length, 2);
  for (const room of initial.rooms) assert.equal(room.outOfService, false);
  assert.deepEqual(initial.tableCategories, [
    { name: "Salon", tableCount: 2 },
    { name: "Teras", tableCount: 1 }
  ]);
  assert.equal(initial.tables.length, 3);
  assert.deepEqual(
    initial.tables.map((table) => ({
      name: table.name,
      area: table.area,
      capacity: table.capacity,
      description: table.description,
      features: table.features,
      smokingPolicy: table.smokingPolicy
    })),
    [
      { name: "Salon 1", area: "Salon", capacity: 4, description: "", features: [], smokingPolicy: "unspecified" },
      { name: "Salon 2", area: "Salon", capacity: 4, description: "", features: [], smokingPolicy: "unspecified" },
      { name: "Teras 1", area: "Teras", capacity: 4, description: "", features: [], smokingPolicy: "unspecified" }
    ]
  );

  const publicationSave = saveBusinessLayout(database.databasePath, {
    publication: { rooms: false, tables: true }
  });
  assert.equal(publicationSave.ok, true, publicationSave.ok ? "" : publicationSave.message);
  assert.deepEqual(publicationSave.layout.publication, { rooms: false, tables: true });

  const publicationDb = new DatabaseSync(database.databasePath);
  try {
    const row = publicationDb.prepare(
      "SELECT publish_rooms_web, publish_tables_web FROM business WHERE deleted_at = '' LIMIT 1"
    ).get();
    assert.equal(Number(row.publish_rooms_web), 0);
    assert.equal(Number(row.publish_tables_web), 1);
  } finally {
    publicationDb.close();
  }

  const firstRoom = initial.rooms[0];
  const removedRoom = initial.rooms[1];
  const save = saveBusinessLayout(database.databasePath, {
    rooms: [
      {
        id: firstRoom.id,
        name: "Deniz Oda",
        number: firstRoom.number,
        capacity: 3,
        bedInfo: "1 çift kişilik + 1 tek kişilik yatak",
        floor: "1",
        features: ["sea_view", "wifi"],
        description: "Deniz manzaralı oda",
        priceNote: "",
        nightlyPriceMinor: 250000,
        currency: "TRY",
        outOfService: false
      },
      {
        clientKey: "draft-new-room",
        name: "Bahçe Oda",
        number: "",
        capacity: 2,
        bedInfo: "1 çift kişilik yatak",
        floor: "Zemin",
        features: ["garden_view"],
        description: "",
        priceNote: "",
        nightlyPriceMinor: 180000,
        currency: "TRY",
        outOfService: false
      }
    ],
    tableCategories: [
      { sourceName: "Salon", name: "İç Salon", tableCount: 1 },
      { sourceName: "Teras", name: "Bahçe", tableCount: 2 }
    ]
  });
  assert.equal(save.ok, true, save.ok ? "" : save.message);
  assert.equal(save.layout.rooms.length, 2);
  assert.equal(save.layout.rooms[0].id, firstRoom.id);
  assert.equal(save.layout.rooms[0].name, "Deniz Oda");
  assert.equal(save.layout.rooms[0].nightlyPriceMinor, 250000);
  assert.equal(save.layout.rooms[0].outOfService, false);
  assert.ok(save.layout.rooms.some((room) => room.name === "Bahçe Oda" && room.id && room.id !== firstRoom.id && room.outOfService === false));
  assert.deepEqual(save.layout.tableCategories, [
    { name: "İç Salon", tableCount: 1 },
    { name: "Bahçe", tableCount: 2 }
  ]);

  const raw = new DatabaseSync(database.databasePath);
  try {
    const archived = raw.prepare("SELECT is_active, deleted_at FROM rooms WHERE id = ?").get(removedRoom.id);
    assert.equal(Number(archived.is_active), 0);
    assert.ok(String(archived.deleted_at));
    raw.prepare("UPDATE rooms SET status = 'occupied' WHERE id = ?").run(firstRoom.id);
  } finally {
    raw.close();
  }

  const beforeBlocked = getBusinessLayout(database.databasePath);
  const removableRoom = beforeBlocked.rooms.find((room) => room.id !== firstRoom.id);
  assert.ok(removableRoom);
  assert.equal(beforeBlocked.rooms.find((room) => room.id === firstRoom.id)?.canRemove, false);
  assert.match(
    beforeBlocked.rooms.find((room) => room.id === firstRoom.id)?.removeBlockReason ?? "",
    /aktif kullanım/iu
  );

  const blocked = saveBusinessLayout(database.databasePath, {
    rooms: [
      {
        id: removableRoom.id,
        name: removableRoom.name,
        number: removableRoom.number,
        capacity: removableRoom.capacity,
        bedInfo: removableRoom.bedInfo,
        floor: removableRoom.floor,
        features: removableRoom.features,
        description: removableRoom.description,
        priceNote: removableRoom.priceNote,
        nightlyPriceMinor: removableRoom.nightlyPriceMinor,
        currency: removableRoom.currency,
        outOfService: false
      }
    ],
    tableCategories: [
      { sourceName: "İç Salon", name: "Tek Alan", tableCount: 1 }
    ]
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /kaldırılamaz/iu);

  const afterBlocked = getBusinessLayout(database.databasePath);
  assert.equal(afterBlocked.rooms.length, 2);
  assert.deepEqual(afterBlocked.tableCategories, beforeBlocked.tableCategories);

  const tablesOnly = saveBusinessLayout(database.databasePath, {
    tableCategories: [
      { sourceName: "İç Salon", name: "Salon", tableCount: 1 },
      { sourceName: "Bahçe", name: "Bahçe", tableCount: 2 }
    ]
  });
  assert.equal(tablesOnly.ok, true, tablesOnly.ok ? "" : tablesOnly.message);
  assert.equal(tablesOnly.layout.rooms.length, 2);
  assert.deepEqual(tablesOnly.layout.tableCategories, [
    { name: "Salon", tableCount: 1 },
    { name: "Bahçe", tableCount: 2 }
  ]);

  const tableBeforeProfile = getBusinessLayout(database.databasePath).tables[0];
  assert.ok(tableBeforeProfile);
  const tableReader = new DatabaseSync(database.databasePath);
  let operationalTableBefore;
  try {
    operationalTableBefore = tableReader.prepare(
      "SELECT name, area, status, current_customer_id, current_reservation_id, notes, is_active, sort_order " +
      "FROM tables WHERE id = ?"
    ).get(tableBeforeProfile.id);
  } finally {
    tableReader.close();
  }
  assert.ok(operationalTableBefore);

  const tableProfileSave = saveBusinessLayout(database.databasePath, {
    tables: [{
      id: tableBeforeProfile.id,
      capacity: 6,
      description: "Deniz tarafında, geniş aile masası.",
      features: ["outdoor", "sea_view", "internal_secret"],
      smokingPolicy: "outdoor_only"
    }]
  });
  assert.equal(tableProfileSave.ok, true, tableProfileSave.ok ? "" : tableProfileSave.message);
  const profiledTable = tableProfileSave.layout.tables.find((table) => table.id === tableBeforeProfile.id);
  assert.ok(profiledTable);
  assert.equal(profiledTable.capacity, 6);
  assert.equal(profiledTable.description, "Deniz tarafında, geniş aile masası.");
  assert.deepEqual(profiledTable.features, ["outdoor", "sea_view"]);
  assert.equal(profiledTable.smokingPolicy, "outdoor_only");

  const tableAfterDb = new DatabaseSync(database.databasePath);
  try {
    const operationalTableAfter = tableAfterDb.prepare(
      "SELECT name, area, status, current_customer_id, current_reservation_id, notes, is_active, sort_order, " +
      "public_description, public_features_json, smoking_policy FROM tables WHERE id = ?"
    ).get(tableBeforeProfile.id);
    assert.ok(operationalTableAfter);
    for (const field of ["name", "area", "status", "current_customer_id", "current_reservation_id", "notes", "is_active", "sort_order"]) {
      assert.equal(operationalTableAfter[field], operationalTableBefore[field], `Public table edit must preserve ${field}`);
    }
    assert.equal(operationalTableAfter.public_description, "Deniz tarafında, geniş aile masası.");
    assert.deepEqual(JSON.parse(String(operationalTableAfter.public_features_json ?? "[]")), ["outdoor", "sea_view"]);
    assert.equal(operationalTableAfter.smoking_policy, "outdoor_only");
  } finally {
    tableAfterDb.close();
  }

  const invalidTableCapacity = saveBusinessLayout(database.databasePath, {
    tables: [{
      id: tableBeforeProfile.id,
      capacity: 0,
      description: "",
      features: [],
      smokingPolicy: "non_smoking"
    }]
  });
  assert.equal(invalidTableCapacity.ok, false);
  assert.match(invalidTableCapacity.message, /masa kapasitesi/i);

  const unknownRoom = saveBusinessLayout(database.databasePath, {
    rooms: [{
      id: "room_missing",
      name: "Olmayan Oda",
      number: "",
      capacity: 2,
      bedInfo: "",
      floor: "",
      features: [],
      description: "",
      priceNote: "",
      nightlyPriceMinor: 0,
      currency: "TRY",
      outOfService: false
    }]
  });
  assert.equal(unknownRoom.ok, false);
  assert.match(unknownRoom.message, /artık mevcut değil/iu);

  // Out-of-service is a BusinessLayout status, not is_active, with operational preservation.
  const layoutForOos = getBusinessLayout(database.databasePath);
  const oosTarget = layoutForOos.rooms.find((room) => room.id !== firstRoom.id);
  assert.ok(oosTarget);
  assert.equal(oosTarget.outOfService, false);
  const toRoomInput = (room, overrides = {}) => ({
    id: room.id,
    name: room.name,
    number: room.number,
    capacity: room.capacity,
    bedInfo: room.bedInfo,
    floor: room.floor,
    features: room.features,
    description: room.description,
    priceNote: room.priceNote,
    nightlyPriceMinor: room.nightlyPriceMinor,
    currency: room.currency,
    outOfService: false,
    ...overrides
  });

  const takeOut = saveBusinessLayout(database.databasePath, {
    rooms: layoutForOos.rooms.map((room) => toRoomInput(room, room.id === oosTarget.id ? { outOfService: true } : {}))
  });
  assert.equal(takeOut.ok, true, takeOut.ok ? "" : takeOut.message);
  assert.equal(takeOut.layout.rooms.find((room) => room.id === oosTarget.id)?.outOfService, true);
  const readStatus = (roomId) => {
    const reader = new DatabaseSync(database.databasePath);
    try {
      return reader.prepare("SELECT status, is_active FROM rooms WHERE id = ?").get(roomId);
    } finally {
      reader.close();
    }
  };
  const oosRow = readStatus(oosTarget.id);
  assert.equal(oosRow.status, "out_of_service");
  assert.equal(Number(oosRow.is_active), 1);

  const bringBack = saveBusinessLayout(database.databasePath, {
    rooms: takeOut.layout.rooms.map((room) => toRoomInput(room, room.id === oosTarget.id ? { outOfService: false } : {}))
  });
  assert.equal(bringBack.ok, true, bringBack.ok ? "" : bringBack.message);
  assert.equal(bringBack.layout.rooms.find((room) => room.id === oosTarget.id)?.outOfService, false);
  assert.equal(readStatus(oosTarget.id).status, "available");

  // Explicit false must preserve cleaning/maintenance instead of forcing available.
  const preserveBase = getBusinessLayout(database.databasePath);
  const preserveTarget = preserveBase.rooms.find((room) => room.id !== firstRoom.id);
  assert.ok(preserveTarget);
  const rawStatus = new DatabaseSync(database.databasePath);
  try {
    for (const status of ["cleaning", "maintenance"]) {
      rawStatus.prepare("UPDATE rooms SET status = ? WHERE id = ?").run(status, preserveTarget.id);
      const preserved = saveBusinessLayout(database.databasePath, {
        rooms: getBusinessLayout(database.databasePath).rooms.map((room) => toRoomInput(room))
      });
      assert.equal(preserved.ok, true, preserved.ok ? "" : preserved.message);
      assert.equal(preserved.layout.rooms.find((room) => room.id === preserveTarget.id)?.outOfService, false);
      assert.equal(readStatus(preserveTarget.id).status, status);
    }
    rawStatus.prepare("UPDATE rooms SET status = 'available' WHERE id = ?").run(preserveTarget.id);
  } finally {
    rawStatus.close();
  }

  // Occupied rooms cannot be taken out of service through BusinessLayout.
  const occupiedLayout = getBusinessLayout(database.databasePath);
  const occupiedAttempt = saveBusinessLayout(database.databasePath, {
    rooms: occupiedLayout.rooms.map((room) => toRoomInput(room, room.id === firstRoom.id ? { outOfService: true } : {}))
  });
  assert.equal(occupiedAttempt.ok, false);
  assert.match(occupiedAttempt.message, /hizmet dışına alınamaz/iu);

  // New rooms default to in-service; explicit true creates out_of_service.
  const withNew = saveBusinessLayout(database.databasePath, {
    rooms: [
      ...getBusinessLayout(database.databasePath).rooms.map((room) => toRoomInput(room)),
      { clientKey: "oos-new-default", name: "Varsayılan Oda", number: "999", capacity: 2, bedInfo: "", floor: "", features: [], description: "", priceNote: "", nightlyPriceMinor: 0, currency: "TRY", outOfService: false },
      { clientKey: "oos-new-out", name: "Kapalı Oda", number: "998", capacity: 2, bedInfo: "", floor: "", features: [], description: "", priceNote: "", nightlyPriceMinor: 0, currency: "TRY", outOfService: true }
    ]
  });
  assert.equal(withNew.ok, true, withNew.ok ? "" : withNew.message);
  assert.equal(withNew.layout.rooms.find((room) => room.name === "Varsayılan Oda")?.outOfService, false);
  assert.equal(withNew.layout.rooms.find((room) => room.name === "Kapalı Oda")?.outOfService, true);
  const closedReader = new DatabaseSync(database.databasePath);
  try {
    assert.equal(
      closedReader.prepare("SELECT status FROM rooms WHERE name = 'Kapalı Oda' AND deleted_at = '' LIMIT 1").get()?.status,
      "out_of_service"
    );
  } finally {
    closedReader.close();
  }

  // Historical inconsistency: an out_of_service room with an unfinished task
  // cannot be reactivated until the blocker is cleared; the normal path keeps working.
  const inconsistentBase = getBusinessLayout(database.databasePath);
  const inconsistentTarget = inconsistentBase.rooms.find((room) => room.name === "Varsayılan Oda");
  assert.ok(inconsistentTarget);
  assert.equal(inconsistentTarget.outOfService, false);
  const inconsistentTakeOut = saveBusinessLayout(database.databasePath, {
    rooms: inconsistentBase.rooms.map((room) => toRoomInput(room, room.id === inconsistentTarget.id ? { outOfService: true } : {}))
  });
  assert.equal(inconsistentTakeOut.ok, true, inconsistentTakeOut.ok ? "" : inconsistentTakeOut.message);
  assert.equal(inconsistentTakeOut.layout.rooms.find((room) => room.id === inconsistentTarget.id)?.outOfService, true);
  const blockerDb = new DatabaseSync(database.databasePath);
  try {
    blockerDb.prepare(
      "INSERT INTO daily_tasks (id, title, status, related_type, related_id, created_at, updated_at) " +
      "VALUES ('oos-blocker-task', 'Tarihsel oda görevi', 'pending', 'room', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"
    ).run(inconsistentTarget.id);
  } finally {
    blockerDb.close();
  }
  const blockedReactivate = saveBusinessLayout(database.databasePath, {
    rooms: getBusinessLayout(database.databasePath).rooms.map((room) => toRoomInput(room, room.id === inconsistentTarget.id ? { outOfService: false } : {}))
  });
  assert.equal(blockedReactivate.ok, false);
  assert.match(blockedReactivate.message, /yeniden hizmete alınamaz/iu);
  assert.equal(readStatus(inconsistentTarget.id).status, "out_of_service");
  assert.equal(getBusinessLayout(database.databasePath).rooms.find((room) => room.id === inconsistentTarget.id)?.outOfService, true);
  const unblockDb = new DatabaseSync(database.databasePath);
  try {
    unblockDb.prepare("DELETE FROM daily_tasks WHERE id = 'oos-blocker-task'").run();
  } finally {
    unblockDb.close();
  }
  const normalReactivate = saveBusinessLayout(database.databasePath, {
    rooms: getBusinessLayout(database.databasePath).rooms.map((room) => toRoomInput(room, room.id === inconsistentTarget.id ? { outOfService: false } : {}))
  });
  assert.equal(normalReactivate.ok, true, normalReactivate.ok ? "" : normalReactivate.message);
  assert.equal(normalReactivate.layout.rooms.find((room) => room.id === inconsistentTarget.id)?.outOfService, false);
  assert.equal(readStatus(inconsistentTarget.id).status, "available");

  console.log("business-layout-smoke-ok: atomic room/table layout, publication visibility, public table details, archive, blocker and partial update verified");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
