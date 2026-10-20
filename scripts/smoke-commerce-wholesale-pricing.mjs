import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist/index.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  setBusinessCapability
} = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const {
  saveRuntimeCatalogProduct
} = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const {
  resolveCommerceProductPrice
} = require("../apps/desktop-app/dist-electron/commerce-pricing-service.js");

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-wholesale-pricing-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataDir
});

const customerInput = (overrides = {}) => ({
  fullName: "Bayi Fiyat Testi",
  phone: "05550003001",
  email: "",
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
    businessName: "Wholesale Pricing Smoke",
    profileId: "market",
    profileOptions: [C.WHOLESALE],
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "wholesale-pricing-smoke-secret",
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

  const product = saveRuntimeCatalogProduct(database.databasePath, {
    name: "Fiyat Gruplu Ürün",
    sku: "PRICE-001",
    barcode: "8690000030001",
    salePrice: 100,
    dealerPriceA: 80,
    dealerPriceB: null,
    purchasePrice: 60,
    currency: "TRY",
    unit: "piece",
    taxRate: 20,
    trackInventory: false,
    isActive: true
  });
  assert.equal(product.salePrice, 100);
  assert.equal(product.dealerPriceA, 80);
  assert.equal(product.dealerPriceB, null);

  const savedCustomer = database.saveCustomer(customerInput({
    commercialProfile: {
      companyName: "Fiyat Test Bayi Ltd.",
      taxOffice: "Cide",
      taxNumber: "3333333333",
      authorizedPerson: "Bayi Fiyat Testi",
      dealerStatus: "active",
      priceGroup: "dealer_a",
      paymentTermDays: 30,
      notes: ""
    }
  }));
  assert.equal(savedCustomer.ok, true, savedCustomer.ok ? "" : savedCustomer.message);
  const customerId = savedCustomer.savedId;

  const retailNoCustomer = resolveCommerceProductPrice(database.databasePath, {
    productId: product.id
  });
  assert.deepEqual(retailNoCustomer, {
    productId: product.id,
    customerId: "",
    requestedGroup: "retail",
    appliedGroup: "retail",
    unitPrice: 100,
    currency: "TRY",
    fallbackToRetail: false,
    dealerEligible: false
  });

  const dealerA = resolveCommerceProductPrice(database.databasePath, {
    productId: product.id,
    customerId
  });
  assert.equal(dealerA.requestedGroup, "dealer_a");
  assert.equal(dealerA.appliedGroup, "dealer_a");
  assert.equal(dealerA.unitPrice, 80);
  assert.equal(dealerA.fallbackToRetail, false);
  assert.equal(dealerA.dealerEligible, true);

  const dealerBUpdate = database.saveCustomer(customerInput({
    id: customerId,
    commercialProfile: {
      companyName: "Fiyat Test Bayi Ltd.",
      taxOffice: "Cide",
      taxNumber: "3333333333",
      authorizedPerson: "Bayi Fiyat Testi",
      dealerStatus: "active",
      priceGroup: "dealer_b",
      paymentTermDays: 30,
      notes: ""
    }
  }));
  assert.equal(dealerBUpdate.ok, true, dealerBUpdate.ok ? "" : dealerBUpdate.message);

  const dealerBFallback = resolveCommerceProductPrice(database.databasePath, {
    productId: product.id,
    customerId
  });
  assert.equal(dealerBFallback.requestedGroup, "dealer_b");
  assert.equal(dealerBFallback.appliedGroup, "retail");
  assert.equal(dealerBFallback.unitPrice, 100);
  assert.equal(dealerBFallback.fallbackToRetail, true);
  assert.equal(dealerBFallback.dealerEligible, true);

  const zeroDealerB = saveRuntimeCatalogProduct(database.databasePath, {
    ...product,
    dealerPriceB: 0
  });
  assert.equal(zeroDealerB.dealerPriceB, 0);
  const freeDealerB = resolveCommerceProductPrice(database.databasePath, {
    productId: product.id,
    customerId
  });
  assert.equal(freeDealerB.appliedGroup, "dealer_b");
  assert.equal(freeDealerB.unitPrice, 0);
  assert.equal(freeDealerB.fallbackToRetail, false);

  const candidateUpdate = database.saveCustomer(customerInput({
    id: customerId,
    commercialProfile: {
      companyName: "Fiyat Test Bayi Ltd.",
      taxOffice: "Cide",
      taxNumber: "3333333333",
      authorizedPerson: "Bayi Fiyat Testi",
      dealerStatus: "inactive",
      priceGroup: "dealer_a",
      paymentTermDays: 30,
      notes: ""
    }
  }));
  assert.equal(candidateUpdate.ok, true, candidateUpdate.ok ? "" : candidateUpdate.message);

  const candidateRetail = resolveCommerceProductPrice(database.databasePath, {
    productId: product.id,
    customerId
  });
  assert.equal(candidateRetail.requestedGroup, "dealer_a");
  assert.equal(candidateRetail.appliedGroup, "retail");
  assert.equal(candidateRetail.unitPrice, 100);
  assert.equal(candidateRetail.fallbackToRetail, true);
  assert.equal(candidateRetail.dealerEligible, false);

  const retailGroupUpdate = database.saveCustomer(customerInput({
    id: customerId,
    commercialProfile: {
      companyName: "Fiyat Test Bayi Ltd.",
      taxOffice: "Cide",
      taxNumber: "3333333333",
      authorizedPerson: "Bayi Fiyat Testi",
      dealerStatus: "active",
      priceGroup: "retail",
      paymentTermDays: 30,
      notes: ""
    }
  }));
  assert.equal(retailGroupUpdate.ok, true, retailGroupUpdate.ok ? "" : retailGroupUpdate.message);

  const explicitRetail = resolveCommerceProductPrice(database.databasePath, {
    productId: product.id,
    customerId
  });
  assert.equal(explicitRetail.requestedGroup, "retail");
  assert.equal(explicitRetail.appliedGroup, "retail");
  assert.equal(explicitRetail.unitPrice, 100);
  assert.equal(explicitRetail.fallbackToRetail, false);
  assert.equal(explicitRetail.dealerEligible, true);

  const dealerAgain = database.saveCustomer(customerInput({
    id: customerId,
    commercialProfile: {
      companyName: "Fiyat Test Bayi Ltd.",
      taxOffice: "Cide",
      taxNumber: "3333333333",
      authorizedPerson: "Bayi Fiyat Testi",
      dealerStatus: "active",
      priceGroup: "dealer_a",
      paymentTermDays: 30,
      notes: ""
    }
  }));
  assert.equal(dealerAgain.ok, true, dealerAgain.ok ? "" : dealerAgain.message);

  setBusinessCapability(database.databasePath, {
    capability: C.WHOLESALE,
    enabled: false
  });

  const capabilityOffRetail = resolveCommerceProductPrice(database.databasePath, {
    productId: product.id,
    customerId
  });
  assert.equal(capabilityOffRetail.requestedGroup, "dealer_a");
  assert.equal(capabilityOffRetail.appliedGroup, "retail");
  assert.equal(capabilityOffRetail.unitPrice, 100);
  assert.equal(capabilityOffRetail.fallbackToRetail, true);
  assert.equal(capabilityOffRetail.dealerEligible, false);

  console.log("commerce-wholesale-pricing-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
