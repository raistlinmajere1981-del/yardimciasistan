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
    servicePreferences: { whatsapp: false, android: false },
    initialCounts: { rooms: 2, tables: 3 },
    tableCategories: [
      { name: "Salon", tableCount: 2 },
      { name: "Teras", tableCount: 1 }
    ]
  });
  assert.equal(setup.ok, true, setup.ok ? "" : setup.message);

  const initial = getBusinessLayout(database.databasePath);
  assert.deepEqual(initial.capabilities, { rooms: true, tables: true });
  assert.equal(initial.rooms.length, 2);
  assert.deepEqual(initial.tableCategories, [
    { name: "Salon", tableCount: 2 },
    { name: "Teras", tableCount: 1 }
  ]);

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
        currency: "TRY"
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
        currency: "TRY"
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
  assert.ok(save.layout.rooms.some((room) => room.name === "Bahçe Oda" && room.id && room.id !== firstRoom.id));
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
        currency: removableRoom.currency
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
      currency: "TRY"
    }]
  });
  assert.equal(unknownRoom.ok, false);
  assert.match(unknownRoom.message, /artık mevcut değil/iu);

  console.log("business-layout-smoke-ok: atomic room/table layout, archive, blocker and partial update verified");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
