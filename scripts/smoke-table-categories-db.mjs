import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  getBusinessLayout,
  saveBusinessLayout
} = require("../apps/desktop-app/dist-electron/business-layout.js");

const appPath = join(process.cwd(), "apps", "desktop-app");
const dataDir = join(process.cwd(), "artifacts", "table-categories-db-smoke", String(Date.now()));
mkdirSync(dataDir, { recursive: true });

const database = new DesktopDatabase({
  appPath,
  userDataPath: dataDir
});

try {
  database.initialize();

  const setupSave = database.saveInitialSetup({
    businessName: "Kategori Smoke Restoranı",
    profileId: "restaurant",
    phone: "+905551112233",
    whatsapp: "+905551112233",
    email: "kategori@example.test",
    address: "Test adresi",
    webModuleUrl: "https://yardimciasistan.example.test",
    syncSecret: "kategori-smoke-secret",
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
    servicePreferences: {
      whatsapp: false,
      android: false
    }
  });
  assert.equal(setupSave.ok, true, setupSave.ok ? "" : setupSave.message);
  assert.deepEqual(getBusinessLayout(database.databasePath).tableCategories, []);

  const seedSave = saveBusinessLayout(database.databasePath, {
    tableCategories: [
      { name: "Bahçe", tableCount: 5 },
      { name: "Salon", tableCount: 4 },
      { name: "Teras", tableCount: 3 },
      { name: "Avlu", tableCount: 2 }
    ]
  });
  assert.equal(seedSave.ok, true, seedSave.ok ? "" : seedSave.message);
  assert.deepEqual(seedSave.layout.tableCategories, [
    { name: "Bahçe", tableCount: 5 },
    { name: "Salon", tableCount: 4 },
    { name: "Teras", tableCount: 3 },
    { name: "Avlu", tableCount: 2 }
  ]);

  const categoryInput = [
    { sourceName: "Bahçe", name: "İç Salon", tableCount: 3 },
    { sourceName: "Salon", name: "Üst Kat", tableCount: 2 },
    { sourceName: "Avlu", name: "Avlu", tableCount: 2 },
    { sourceName: "", name: "Sahil", tableCount: 1 }
  ];

  const categorySave = saveBusinessLayout(database.databasePath, {
    tableCategories: categoryInput
  });
  assert.equal(categorySave.ok, true, categorySave.ok ? "" : categorySave.message);
  assert.deepEqual(categorySave.layout.tableCategories, [
    { name: "İç Salon", tableCount: 3 },
    { name: "Üst Kat", tableCount: 2 },
    { name: "Avlu", tableCount: 2 },
    { name: "Sahil", tableCount: 1 }
  ]);
  assert.equal(database.getDashboardData().tables.length, 8);
  assert.deepEqual(
    database.getDashboardData().tables.map((table) => table.area),
    ["İç Salon", "İç Salon", "İç Salon", "Üst Kat", "Üst Kat", "Avlu", "Avlu", "Sahil"]
  );
  assert.deepEqual(
    database.getDashboardData().tables.slice(0, 3).map((table) => table.name),
    ["İç Salon 1", "İç Salon 2", "İç Salon 3"]
  );

  const duplicateCategorySave = saveBusinessLayout(database.databasePath, {
    tableCategories: [
      { sourceName: "İç Salon", name: "Salon", tableCount: 2 },
      { sourceName: "Üst Kat", name: "salon", tableCount: 2 }
    ]
  });
  assert.equal(duplicateCategorySave.ok, false);
  assert.match(duplicateCategorySave.message, /birden fazla/);
  assert.equal(database.getDashboardData().tables.length, 8);

  const protectedTable = database.getDashboardData().tables[2];
  const openedOrder = database.openTableOrder(protectedTable.id);
  assert.equal(openedOrder.ok, true);

  const beforeNoOpSave = database.getDashboardData().tables.map((table) => ({
    id: table.id,
    name: table.name,
    area: table.area,
    sortOrder: table.sortOrder
  }));
  const noOpSave = saveBusinessLayout(database.databasePath, {
    tableCategories: categoryInput
  });
  assert.equal(noOpSave.ok, true, noOpSave.ok ? "" : noOpSave.message);
  assert.deepEqual(
    database.getDashboardData().tables.map((table) => ({
      id: table.id,
      name: table.name,
      area: table.area,
      sortOrder: table.sortOrder
    })),
    beforeNoOpSave
  );

  const unsafeReduction = saveBusinessLayout(database.databasePath, {
    tableCategories: []
  });
  assert.equal(unsafeReduction.ok, false);
  assert.match(unsafeReduction.message, /aktif adisyon veya rezervasyona bağlı/iu);
  assert.equal(database.getDashboardData().tables.length, 8);

  const safeReduction = saveBusinessLayout(database.databasePath, {
    tableCategories: [
      { sourceName: "Avlu", name: "Servis Alanı", tableCount: 1 }
    ]
  });
  assert.equal(safeReduction.ok, true, safeReduction.ok ? "" : safeReduction.message);
  assert.deepEqual(safeReduction.layout.tableCategories, [
    { name: "Servis Alanı", tableCount: 1 }
  ]);
  assert.equal(database.getDashboardData().tables.length, 1);
  assert.equal(database.getDashboardData().tables[0].id, protectedTable.id);
  assert.equal(database.getDashboardData().tables[0].area, "Servis Alanı");
  assert.equal(database.getActiveTableOrder(protectedTable.id)?.id, openedOrder.order.id);

  console.log("Masa kategorisi veritabanı smoke testi başarılı.");
} finally {
  database.close();
}
