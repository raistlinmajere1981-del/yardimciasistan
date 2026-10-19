import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { marketingFixture } from "./test-helpers/marketing-fixtures.mjs";

const require = createRequire(import.meta.url);
const shared = require("../packages/shared/dist");
const { BUSINESS_CAPABILITIES: C, BUSINESS_AI_DOMAIN_POLICY: domains, BUSINESS_AI_INTENT_POLICY: intents, BUSINESS_AI_INFORMATION_PATTERNS: informationPatterns, evaluateBusinessAiInput } = shared;
const snapshot = JSON.parse(readFileSync("firm-template/web-module/lib/business-ai-policy.json", "utf8"));
assert.deepEqual(snapshot, { domains, intents, informationPatterns }, "AI PHP snapshot drift: build shared then npm run sync:business-ai-policy");

const cases = [
  { capabilities: [], requestType: "general_info", text: "yarın için 2 kişilik müsait oda var mı" },
  { capabilities: [C.ACCOMMODATION_ROOMS], requestType: "general_info", text: "yarın müsait oda var mı" },
  { capabilities: [], requestType: "general_info", text: "Konaklama istiyorum" },
  { capabilities: [], requestType: "general_info", text: "Kuantum terapi hizmeti veriyor musunuz?" },
  { capabilities: [], requestType: "new_service", text: "Holografik terapi istiyorum" },
  { capabilities: [], requestType: "restaurant_reservation", text: "Merhaba" },
  { capabilities: [C.FOOD_TABLES], requestType: "restaurant_reservation", text: "Merhaba" },
  { capabilities: [C.FOOD_MENU], requestType: "restaurant_reservation", text: "Masa ayırtmak istiyorum" },
  { capabilities: [C.CATALOG], requestType: "general_info", text: "oda spreyi stokta var mı" },
  { capabilities: [], requestType: "general_info", text: "oda spreyi stokta var mı" },
  { capabilities: [C.ACCOMMODATION_ROOMS], requestType: "breakfast_request", text: "Kahvaltı" },
  { capabilities: [], requestType: "breakfast_request", text: "Kahvaltı" },
  { capabilities: [C.ACCOMMODATION_ROOMS], requestType: "qr_menu_question", text: "" },
  { capabilities: [C.FOOD_MENU], requestType: "qr_menu_question", text: "" },
  { capabilities: [C.CALENDAR, C.TASKS], requestType: "general_info", text: "Randevu almak istiyorum" },
  { capabilities: [], requestType: "general_info", text: "Kart geçiyor mu?" },
  { capabilities: [C.CATALOG], requestType: "general_info", text: "Pepsi var mı?", matchedCatalogSources: ["catalog"] },
  { capabilities: [], requestType: "general_info", text: "Pepsi var mı?", matchedCatalogSources: ["catalog"] },
  { capabilities: [C.ACCOMMODATION_ROOMS], requestType: "general_info", text: "Room availability", responseLanguage: "en" },
  { capabilities: [C.ACCOMMODATION_ROOMS], requestType: "general_info", text: "Room prices", responseLanguage: "en" },
  { capabilities: [], requestType: "general_info", text: "Room availability", responseLanguage: "en" },
  { capabilities: [C.ACCOMMODATION_ROOMS], requestType: "general_info", text: "Do you serve breakfast?", responseLanguage: "en" },
  { capabilities: [C.FOOD_TABLES], requestType: "general_info", text: "Is a table available?", responseLanguage: "en" },
  { capabilities: [C.FOOD_MENU], requestType: "general_info", text: "Menu information", responseLanguage: "en" },
  { capabilities: [C.CATALOG], requestType: "general_info", text: "Room spray in stock?", responseLanguage: "en" },
  { capabilities: [], requestType: "general_info", text: "What is your address?", responseLanguage: "en" },
  { capabilities: [], requestType: "general_info", text: "Quantum healing service?", responseLanguage: "en" },
  { capabilities: [], requestType: "general_info", text: "Book an appointment", responseLanguage: "en" }
];
// Evaluate the real PHP policy and chat functions, without endpoint bootstrap/storage side effects.
const php = spawnSync("php", ["-r", `
require 'firm-template/web-module/lib/business-ai-policy.php';
$source = file_get_contents('firm-template/web-module/api/chat.php');
eval(substr($source, strpos($source, 'function ya_chat_generate_android_report')));
$cases = json_decode(stream_get_contents(STDIN), true);
$results = [];
foreach ($cases as $case) {
  $context = ['capability_ids' => $case['capabilities'], 'profile_id' => 'pension_restaurant', 'profile_label' => 'Otel Restoran', 'description' => 'Kuantum terapi, konaklama ve randevu sunarız.', 'offeredServices' => ['konaklama'], 'tenantVerticals' => ['hotel'], 'verifiedDomains' => ['accommodation']];
  $decision = ya_business_ai_evaluate($case['capabilities'], $case['requestType'], $case['text'], $case['matchedCatalogSources'] ?? []);
  $catalog = array_map(static fn ($source) => ['source' => $source], $case['matchedCatalogSources'] ?? []);
  $reply = ya_chat_generate_reply(['profile_id' => 'pension_restaurant'], ['enabled' => false], ['request_type' => $case['requestType'], 'response_language' => $case['responseLanguage'] ?? 'tr'], $case['text'], [], $context, $catalog);
  $results[] = ['decision' => $decision, 'reply' => $reply];
}
echo json_encode($results, JSON_UNESCAPED_UNICODE);
`], { input: JSON.stringify(cases), encoding: "utf8" });
assert.equal(php.status, 0, php.stderr);
const results = JSON.parse(php.stdout);
for (const [index, input] of cases.entries()) {
  const expected = evaluateBusinessAiInput(input.capabilities, input.requestType, input.text, input.matchedCatalogSources);
  assert.deepEqual(results[index].decision, expected);
  if (["unsupported", "unrecognized"].includes(expected.kind)) {
    assert.equal(results[index].reply.error.code, expected.kind === "unsupported" ? "unsupported_business_domain" : "unrecognized_business_intent");
    assert.equal(results[index].reply.fallback, true);
  } else assert.equal(results[index].reply.error.code, "ai_disabled");
  if (input.responseLanguage === "en") {
    assert.doesNotMatch(results[index].reply.answer, /(?:işletmemiz|mesajınızı|hizmeti etkin değil|yanıtı)/i, "English fallback must not leak Turkish boilerplate");
    assert.match(results[index].reply.answer, /business|service|contact/i, "English fallback responds in the visitor language");
  }
}
const roomSpray = cases.findIndex(input => input.text === "Room spray in stock?");
assert.deepEqual(results[roomSpray].decision.domains, ["commerce"], "room spray must not accidentally activate accommodation capability");

const { createOwnerReplySuggestionForRequest, rewriteOwnerReplySuggestionForRequest } = require("../apps/desktop-app/dist-electron/business-ai-service.js");
// Any access beyond request/capability/save would reach provider configuration and fail this test.
for (const input of cases.filter((input) => ["unsupported", "unrecognized"].includes(evaluateBusinessAiInput(input.capabilities, input.requestType, input.text).kind))) {
  let saved;
  const database = {
    getRequestById: () => ({ id: "request_test", customer_name: "Test", request_type: input.requestType, message: input.text }),
    getEnabledBusinessCapabilities: () => input.capabilities,
    saveRequestAiSuggestion: (value) => { saved = value; return { ok: true }; }
  };
  assert.equal((await createOwnerReplySuggestionForRequest(database, "request_test")).ok, true);
  assert.deepEqual(saved.missingFields, []);
  assert.match(saved.suggestedReply, /etkin değil|doğrulayamıyorum/);
}
let rewritten;
await rewriteOwnerReplySuggestionForRequest({
  getRequestById: () => ({ id: "request_test", customer_name: "Test", request_type: "general_info", message: "Kart geçiyor mu?" }),
  getEnabledBusinessCapabilities: () => [],
  saveRequestAiSuggestion: (value) => { rewritten = value; return { ok: true }; }
}, { requestId: "request_test", instructions: "Restoran hizmetimizi öner" });
assert.match(rewritten.suggestedReply, /restoran hizmeti etkin değil/);

const fixture = marketingFixture({ ai: true });
try {
  for (const capability of ["text_generation", "rewrite", "channel_adaptation", "image_generation"]) {
    for (const text of ["Konaklama tanıtımı", "Randevu almak istiyorum", "Kuantum terapi hizmeti veriyoruz"]) {
      const before = fixture.calls.length;
      await assert.rejects(fixture.service.generate({ capability, channel: "website", text, instructions: "" }), (error) => error.code === "unsupported_business_domain");
      assert.equal(fixture.calls.length, before, "unsupported/unknown domains must not reach text/image providers");
    }
  }
  for (const field of ["instructions", "styleHints"]) {
    await assert.rejects(fixture.service.generate({ capability: "image_generation", text: "Tanıtım", instructions: "", [field]: "Konaklama" }), (error) => error.code === "unsupported_business_domain");
  }
  await fixture.service.generate({ capability: "text_generation", text: "Ürün tanıtımı", instructions: "" });
  assert.match(fixture.calls.at(-1).body.messages[0].content, /capabilityIds/);
  await fixture.service.generate({ capability: "image_generation", text: "Ürün tanıtımı", instructions: "" });
  assert.match(fixture.calls.at(-1).body.prompt, /business domain allowlist/);
} finally { fixture.dispose(); }
console.log("AI boundary: registry/snapshot parity, PHP+owner call chains, marketing text/image negative gates passed.");
