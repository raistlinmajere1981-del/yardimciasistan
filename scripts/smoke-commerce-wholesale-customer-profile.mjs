import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist/index.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-asistan-wholesale-customer-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataDir
});

const baseCustomer = (overrides = {}) => ({
  fullName: "Ticari Müşteri",
  phone: "05550001001",
  email: "ticari@example.test",
  notes: "",
  tags: [],
  identityType: "",
  identityNumber: "",
  nationality: "",
  birthDate: "",
  birthdayMessageEnabled: true,
  gender: "",
  documentSerialNumber: "",
  documentExpiryDate: "",
  birthPlace: "",
  motherName: "",
  fatherName: "",
  issuingAuthority: "",
  address: "",
  ...overrides
});

try {
  database.initialize();
  const setup = database.saveInitialSetup({
    businessName: "Toptan Smoke",
    profileId: "market",
    profileOptions: [C.WHOLESALE],
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "wholesale-customer-smoke-secret",
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
    servicePreferences: { whatsapp: false, android: false },
    initialCounts: { rooms: 0, tables: 0 },
    tableCategories: []
  });
  assert.equal(setup.ok, true, setup.ok ? "" : setup.message);

  const enabled = new Set(database.getEnabledBusinessCapabilities());
  assert.equal(enabled.has(C.WHOLESALE), true);
  assert.equal(enabled.has(C.ORDERS), true);
  assert.equal(enabled.has(C.CATALOG), true);
  assert.equal(enabled.has(C.CUSTOMERS), true);
  assert.equal(enabled.has(C.SALES), true, "Market's existing sales capability remains intact.");

  const first = database.saveCustomer(baseCustomer({
    commercialProfile: {
      companyName: "Karadeniz Gıda Ltd. Şti.",
      taxOffice: "Cide",
      taxNumber: "1234567890",
      authorizedPerson: "Ticari Müşteri",
      dealerStatus: "candidate",
      paymentTermDays: 15,
      notes: "İlk görüşme tamamlandı."
    }
  }));
  assert.equal(first.ok, true, first.ok ? "" : first.message);
  const firstId = first.savedId;

  let firstCustomer = database.getDashboardData().customers.find((customer) => customer.id === firstId);
  assert.ok(firstCustomer);
  assert.equal(firstCustomer.commercialProfile?.companyName, "Karadeniz Gıda Ltd. Şti.");
  assert.equal(firstCustomer.commercialProfile?.taxOffice, "Cide");
  assert.equal(firstCustomer.commercialProfile?.taxNumber, "1234567890");
  assert.equal(firstCustomer.commercialProfile?.dealerStatus, "candidate");
  assert.equal(firstCustomer.commercialProfile?.paymentTermDays, 15);

  const raw = new DatabaseSync(database.databasePath);
  try {
    const stored = raw.prepare(`
      SELECT business_id, company_name, tax_number, dealer_status, payment_term_days, created_at
      FROM customer_commercial_profiles
      WHERE customer_id = ?
    `).get(firstId);
    assert.ok(stored?.business_id);
    assert.equal(stored.company_name, "Karadeniz Gıda Ltd. Şti.");
    assert.equal(stored.tax_number, "1234567890");
    assert.equal(stored.dealer_status, "candidate");
    assert.equal(Number(stored.payment_term_days), 15);

    const createdAt = String(stored.created_at);
    const updated = database.saveCustomer(baseCustomer({
      id: firstId,
      fullName: "Ticari Müşteri Güncel",
      commercialProfile: {
        companyName: "Karadeniz Gıda Ticaret",
        taxOffice: "Cide",
        taxNumber: "1234567890",
        authorizedPerson: "Ticari Müşteri Güncel",
        dealerStatus: "active",
        paymentTermDays: 30,
        notes: "Bayi sözleşmesi hazır."
      }
    }));
    assert.equal(updated.ok, true, updated.ok ? "" : updated.message);

    const updatedStored = raw.prepare(`
      SELECT company_name, dealer_status, payment_term_days, created_at
      FROM customer_commercial_profiles
      WHERE customer_id = ?
    `).get(firstId);
    assert.equal(updatedStored.company_name, "Karadeniz Gıda Ticaret");
    assert.equal(updatedStored.dealer_status, "active");
    assert.equal(Number(updatedStored.payment_term_days), 30);
    assert.equal(String(updatedStored.created_at), createdAt, "Profile update must preserve created_at.");
  } finally {
    raw.close();
  }

  firstCustomer = database.getDashboardData().customers.find((customer) => customer.id === firstId);
  assert.equal(firstCustomer?.commercialProfile?.dealerStatus, "active");
  assert.equal(firstCustomer?.fullName, "Ticari Müşteri Güncel");

  const basicOnlyUpdate = database.saveCustomer(baseCustomer({
    id: firstId,
    fullName: "Ticari Müşteri Temel Güncelleme"
  }));
  assert.equal(basicOnlyUpdate.ok, true, basicOnlyUpdate.ok ? "" : basicOnlyUpdate.message);
  firstCustomer = database.getDashboardData().customers.find((customer) => customer.id === firstId);
  assert.equal(firstCustomer?.commercialProfile?.dealerStatus, "active");
  assert.equal(firstCustomer?.commercialProfile?.taxNumber, "1234567890");
  assert.equal(
    firstCustomer?.commercialProfile?.companyName,
    "Karadeniz Gıda Ticaret",
    "Commercial profile must survive customer edits that do not own wholesale fields."
  );

  const second = database.saveCustomer(baseCustomer({
    fullName: "İkinci Ticari Müşteri",
    phone: "05550001002",
    email: "ikinci@example.test",
    commercialProfile: {
      companyName: "İkinci Firma",
      taxOffice: "Cide",
      taxNumber: "2222222222",
      authorizedPerson: "İkinci Yetkili",
      dealerStatus: "candidate",
      paymentTermDays: 0,
      notes: ""
    }
  }));
  assert.equal(second.ok, true, second.ok ? "" : second.message);

  const duplicateTax = database.saveCustomer(baseCustomer({
    id: second.savedId,
    fullName: "Bu Ad Kaydedilmemeli",
    phone: "05550001002",
    email: "ikinci@example.test",
    commercialProfile: {
      companyName: "Çakışan Firma",
      taxOffice: "Cide",
      taxNumber: "1234567890",
      authorizedPerson: "İkinci Yetkili",
      dealerStatus: "active",
      paymentTermDays: 10,
      notes: ""
    }
  }));
  assert.equal(duplicateTax.ok, false);
  assert.match(duplicateTax.message, /vergi numarası/i);
  assert.equal(
    database.getDashboardData().customers.find((customer) => customer.id === second.savedId)?.fullName,
    "İkinci Ticari Müşteri",
    "Rejected commercial profile update must not partially update the customer."
  );

  const removed = database.saveCustomer(baseCustomer({
    id: firstId,
    fullName: "Ticari Müşteri Temel Güncelleme",
    commercialProfile: null
  }));
  assert.equal(removed.ok, true, removed.ok ? "" : removed.message);
  assert.equal(
    database.getDashboardData().customers.find((customer) => customer.id === firstId)?.commercialProfile,
    null
  );

  const restored = database.saveCustomer(baseCustomer({
    id: firstId,
    fullName: "Ticari Müşteri Temel Güncelleme",
    commercialProfile: {
      companyName: "Karadeniz Gıda Ticaret",
      taxOffice: "Cide",
      taxNumber: "1234567890",
      authorizedPerson: "Ticari Müşteri Güncel",
      dealerStatus: "active",
      paymentTermDays: 30,
      notes: ""
    }
  }));
  assert.equal(restored.ok, true, restored.ok ? "" : restored.message);

  const deleted = database.deleteCustomer(firstId);
  assert.equal(deleted.ok, true, deleted.ok ? "" : deleted.message);

  const rawAfterDelete = new DatabaseSync(database.databasePath);
  try {
    assert.equal(
      Number(rawAfterDelete.prepare(
        "SELECT COUNT(*) AS count FROM customer_commercial_profiles WHERE customer_id = ?"
      ).get(firstId).count),
      0,
      "Customer deletion must release the commercial profile and tax number."
    );
  } finally {
    rawAfterDelete.close();
  }

  const reusedTax = database.saveCustomer(baseCustomer({
    fullName: "Yeni Bayi",
    phone: "05550001003",
    email: "yeni@example.test",
    commercialProfile: {
      companyName: "Yeni Bayi Ltd.",
      taxOffice: "Cide",
      taxNumber: "1234567890",
      authorizedPerson: "Yeni Yetkili",
      dealerStatus: "candidate",
      paymentTermDays: 7,
      notes: ""
    }
  }));
  assert.equal(reusedTax.ok, true, reusedTax.ok ? "" : reusedTax.message);

  console.log("commerce-wholesale-customer-profile-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
