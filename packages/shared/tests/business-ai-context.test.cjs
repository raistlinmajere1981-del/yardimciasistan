const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BUSINESS_CAPABILITIES,
  createBusinessAiContext,
  evaluateBusinessAiInput,
  canBusinessSpeakForAiDomain,
  detectBusinessAiDomainMentions,
  BUSINESS_AI_DOMAIN_POLICY
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
  languages: ["Türkçe", "English"],
  socialLinks: [
    { platform: "instagram", url: "https://instagram.com/testpansiyon" }
  ]
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
  assert.equal(context.profileLabel, "Market / Perakende / Toptan");
  assert.equal(context.directionsNote, "Ana caddeden ikinci sokak.");
  assert.equal(context.paymentNote, "Nakit ve kart kabul edilir.");
  assert.deepEqual(context.languages, ["Türkçe", "English"]);
  assert.deepEqual(context.features, []);
  assert.deepEqual(context.featureIds, []);
  assert.equal(context.latitude, null);
  assert.equal(context.longitude, null);
  assert.deepEqual(context.socialLinks, [
    { platform: "instagram", url: "https://instagram.com/testpansiyon" }
  ]);
  assert.deepEqual(context.capabilityIds, [
    BUSINESS_CAPABILITIES.CATALOG,
    BUSINESS_CAPABILITIES.INVENTORY,
    BUSINESS_CAPABILITIES.RETAIL_BARCODE,
    BUSINESS_CAPABILITIES.SALES,
    BUSINESS_CAPABILITIES.WHATSAPP
  ].sort());
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
  assert.deepEqual(context.featureIds, ["wifi", "parking"]);
  assert.equal(context.latitude, null);
  assert.equal(context.longitude, null);
  assert.equal(context.checkInTime, "14:00");
  assert.equal(context.breakfastStartTime, "08:00");
  assert.equal(context.whatsappEnabled, false);
  assert.equal(context.whatsapp, "");
});


test("AI domain guard blocks hospitality intent when capabilities do not expose that domain", () => {
  const market = [
    BUSINESS_CAPABILITIES.CATALOG,
    BUSINESS_CAPABILITIES.INVENTORY,
    BUSINESS_CAPABILITIES.SALES,
    BUSINESS_CAPABILITIES.RETAIL_BARCODE
  ];
  assert.equal(
    evaluateBusinessAiInput(market, "general_info", "yarın için 2 kişilik müsait oda var mı").domain,
    "accommodation"
  );
  assert.equal(
    evaluateBusinessAiInput(market, "pension_reservation", "yarın geliriz").domain,
    "accommodation"
  );
  assert.equal(
    evaluateBusinessAiInput(market, "restaurant_reservation", "iki kişilik masa").domain,
    "food_service"
  );
  assert.equal(
    evaluateBusinessAiInput(market, "general_info", "bu ürün stokta var mı").kind,
    "supported"
  );
  assert.equal(
    evaluateBusinessAiInput(market, "general_info", "oda spreyi stokta var mı").kind,
    "supported"
  );
});

test("AI domain guard honors composed capabilities instead of profile assumptions", () => {
  const composed = [
    BUSINESS_CAPABILITIES.CATALOG,
    BUSINESS_CAPABILITIES.SALES,
    BUSINESS_CAPABILITIES.RETAIL_BARCODE,
    BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS
  ];
  assert.equal(
    evaluateBusinessAiInput(composed, "general_info", "yarın müsait oda var mı").kind,
    "supported"
  );
  assert.equal(
    evaluateBusinessAiInput(composed, "restaurant_reservation", "masa ayırtmak istiyorum").domain,
    "food_service"
  );
});

test("mention detection never supplies business support; unknown domains fail closed", () => {
  assert.deepEqual(detectBusinessAiDomainMentions("", "Konaklama istiyorum"), ["accommodation"]);
  assert.equal(canBusinessSpeakForAiDomain([], "accommodation"), false);
  assert.equal(canBusinessSpeakForAiDomain([BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS], "accommodation"), true);
  for (const domain of ["quantum_spa", "new_domain", "toString", "__proto__"]) {
    assert.equal(canBusinessSpeakForAiDomain(Object.values(BUSINESS_CAPABILITIES), domain), false);
  }
  assert.equal(evaluateBusinessAiInput([], "", "Kuantum terapi hizmeti veriyor musunuz?").kind, "unrecognized");
  assert.equal(evaluateBusinessAiInput([], "new_service_request", "Holografik terapi istiyorum").kind, "unrecognized");
  assert.equal(evaluateBusinessAiInput([], "general_info", "Merhaba").kind, "information");
  assert.equal(evaluateBusinessAiInput([BUSINESS_CAPABILITIES.CATALOG], "", "Pepsi var mı?", ["catalog"]).kind, "supported");
  assert.equal(evaluateBusinessAiInput([], "", "Pepsi var mı?", ["catalog"]).kind, "unsupported");
  assert.equal(evaluateBusinessAiInput([BUSINESS_CAPABILITIES.CATALOG], "", "Çorba var mı?", ["menu"]).kind, "unsupported");
});

test("profile/service/verified labels cannot turn descriptions into capabilities", () => {
  const context = createBusinessAiContext({
    businessName: "Restoran Otel", profileId: "pension_restaurant", phone: "", whatsapp: "", email: "", address: "",
    enabledCapabilities: [], publicProfile: { ...publicProfile, description: "Konaklama, restoran ve randevu sunarız." }
  });
  // These fields do not exist in the product; even a foreign caller's metadata is not authority.
  Object.assign(context, { offeredServices: ["konaklama"], tenantVerticals: ["hotel"], verifiedDomains: ["accommodation"] });
  assert.deepEqual(context.capabilityIds, []);
  assert.equal(evaluateBusinessAiInput(context.capabilityIds, "", "Konaklama istiyorum").kind, "unsupported");
  assert.equal(canBusinessSpeakForAiDomain(context.capabilityIds, "accommodation"), false);
});

test("breakfast amenity exception and appointment denial are explicit", () => {
  const rooms = [BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS];
  assert.equal(evaluateBusinessAiInput(rooms, "breakfast_request", "Kahvaltı var mı?").kind, "supported");
  assert.equal(canBusinessSpeakForAiDomain(rooms, "food_service"), false);
  assert.equal(evaluateBusinessAiInput(rooms, "restaurant_reservation", "").kind, "unsupported");
  assert.equal(evaluateBusinessAiInput([], "breakfast_request", "").kind, "unsupported");
  assert.equal(evaluateBusinessAiInput([BUSINESS_CAPABILITIES.CALENDAR, BUSINESS_CAPABILITIES.TASKS], "", "Randevu almak istiyorum").kind, "unsupported");
  assert.equal(canBusinessSpeakForAiDomain(Object.values(BUSINESS_CAPABILITIES), "appointment"), false);
  assert.equal(evaluateBusinessAiInput(rooms, "qr_menu_question", "").kind, "unsupported");
  assert.equal(evaluateBusinessAiInput([BUSINESS_CAPABILITIES.FOOD_MENU], "qr_menu_question", "").kind, "supported");
  assert.equal(evaluateBusinessAiInput([BUSINESS_CAPABILITIES.FOOD_MENU], "restaurant_reservation", "Masa ayırtmak istiyorum").domain, "tables");
  assert.equal(canBusinessSpeakForAiDomain([BUSINESS_CAPABILITIES.FOOD_MENU], "tables"), false);
  assert.equal(evaluateBusinessAiInput([BUSINESS_CAPABILITIES.FOOD_TABLES], "general_info", "Bu akşam 4 kişilik masa var mı?").kind, "supported");
  assert.equal(evaluateBusinessAiInput([], "general_info", "Bu akşam 4 kişilik masa var mı?").domain, "tables");
  for (const text of ["Balkonlu oda var mı?", "Konaklamanız hakkında bilgi istiyorum"]) {
    assert.equal(evaluateBusinessAiInput(rooms, "general_info", text).kind, "supported");
    assert.equal(evaluateBusinessAiInput([], "general_info", text).kind, "unsupported");
  }
  assert.equal(evaluateBusinessAiInput([BUSINESS_CAPABILITIES.CATALOG], "general_info", "Oda spreyi var mı?").kind, "unrecognized");
});

test("every AI capability reference belongs to the canonical registry", () => {
  const ids = new Set(Object.values(BUSINESS_CAPABILITIES));
  for (const rule of Object.values(BUSINESS_AI_DOMAIN_POLICY)) {
    for (const id of rule.anyOf) assert.ok(ids.has(id), `Unregistered AI capability: ${id}`);
  }
  for (const [domain, rule] of Object.entries(BUSINESS_AI_DOMAIN_POLICY)) {
    assert.equal(canBusinessSpeakForAiDomain([], domain), false);
    for (const id of rule.anyOf) assert.equal(canBusinessSpeakForAiDomain([id], domain), true);
  }
});
