const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BUSINESS_CAPABILITIES,
  createBusinessAiContext
} = require("../dist");

const publicProfile = {
  description: "Mahalle içinde hizmet veren aile işletmesi.",
  latitude: null,
  longitude: null,
  directionsNote: "Ana caddeden ikinci sokak.",
  checkInTime: "14:00",
  checkOutTime: "11:00",
  breakfastStartTime: "08:00",
  breakfastEndTime: "10:00",
  features: ["wifi", "parking"],
  policyNote: "İade koşulları fiş üzerinde belirtilir.",
  paymentNote: "Nakit ve kart kabul edilir.",
  languages: ["Türkçe", "English"]
};

test("market AI context keeps general business facts and drops hospitality-only details", () => {
  const context = createBusinessAiContext({
    businessName: "Nehir Tekel",
    profileId: "market",
    phone: "+903121112233",
    whatsapp: "+905551112233",
    email: "info@example.test",
    address: "Örnek Mahallesi 1",
    enabledCapabilities: [
      BUSINESS_CAPABILITIES.CATALOG,
      BUSINESS_CAPABILITIES.INVENTORY,
      BUSINESS_CAPABILITIES.SALES,
      BUSINESS_CAPABILITIES.RETAIL_BARCODE,
      BUSINESS_CAPABILITIES.WHATSAPP
    ],
    publicProfile
  });

  assert.equal(context.profileId, "market");
  assert.equal(context.profileLabel, "Market / Perakende");
  assert.equal(context.directionsNote, "Ana caddeden ikinci sokak.");
  assert.equal(context.paymentNote, "Nakit ve kart kabul edilir.");
  assert.deepEqual(context.languages, ["Türkçe", "English"]);
  assert.deepEqual(context.features, []);
  assert.equal(context.checkInTime, "");
  assert.equal(context.checkOutTime, "");
  assert.equal(context.breakfastStartTime, "");
  assert.equal(context.breakfastEndTime, "");
});

test("hospitality AI context keeps accommodation facts and hides disabled WhatsApp", () => {
  const context = createBusinessAiContext({
    businessName: "Test Pansiyon",
    profileId: "pension",
    phone: "+902521112233",
    whatsapp: "+905551112233",
    email: "",
    address: "Sahil yolu",
    enabledCapabilities: [
      BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS,
      BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS
    ],
    publicProfile
  });

  assert.deepEqual(context.features, ["Wi-Fi", "Otopark"]);
  assert.equal(context.checkInTime, "14:00");
  assert.equal(context.breakfastStartTime, "08:00");
  assert.equal(context.whatsappEnabled, false);
  assert.equal(context.whatsapp, "");
});
