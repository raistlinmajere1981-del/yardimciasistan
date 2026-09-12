const assert = require("node:assert/strict");
const test = require("node:test");
const {
  generateConfiguredChat,
  isGoogleAiStudioVisionModel,
  listGoogleAiStudioModels
} = require("../dist");

function model(id, description = "") {
  return { id, displayName: id, description };
}

test("Gemini discovery accepts stable Flash families without a hard-coded minor-version allowlist", () => {
  assert.equal(isGoogleAiStudioVisionModel(model("gemini-3.7-flash")), true);
  assert.equal(isGoogleAiStudioVisionModel(model("gemini-3.8-flash")), true);
  assert.equal(isGoogleAiStudioVisionModel(model("gemini-3.8-flash-lite")), true);
  assert.equal(isGoogleAiStudioVisionModel(model("gemini-4.0-flash")), true);

  assert.equal(isGoogleAiStudioVisionModel(model("gemini-2.5-flash")), false);
  assert.equal(isGoogleAiStudioVisionModel(model("gemini-3.8-pro")), false);
  assert.equal(isGoogleAiStudioVisionModel(model("gemini-3.8-flash-preview")), false);
  assert.equal(isGoogleAiStudioVisionModel(model("gemini-3.8-flash-image")), false);
  assert.equal(isGoogleAiStudioVisionModel(model("gemini-3.8-flash", "Deprecated model")), false);
});

test("Google model listing keeps new stable Flash versions returned by the live models endpoint", async () => {
  const result = await listGoogleAiStudioModels(
    {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "google-secret"
    },
    async () => new Response(JSON.stringify({
      models: [
        {
          name: "models/gemini-3.8-flash",
          baseModelId: "gemini-3.8-flash",
          displayName: "Gemini 3.8 Flash",
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "models/gemini-4.0-flash-lite",
          baseModelId: "gemini-4.0-flash-lite",
          displayName: "Gemini 4.0 Flash Lite",
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "models/gemini-3.8-flash-preview",
          displayName: "Gemini 3.8 Flash Preview",
          supportedGenerationMethods: ["generateContent"]
        }
      ]
    }), { status: 200, headers: { "Content-Type": "application/json" } })
  );

  assert.equal(result.ok, true);
  assert.deepEqual(
    new Set(result.models.map((entry) => entry.id)),
    new Set(["gemini-3.8-flash", "gemini-4.0-flash-lite"])
  );
});

test("native Google AI Studio results expose the concrete Gemini service separately from provider family", async () => {
  const result = await generateConfiguredChat(
    {
      enabled: true,
      provider: "openai_compatible",
      service: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-3.8-flash",
      apiKey: "google-secret",
      messages: [{ role: "user", content: "Merhaba" }]
    },
    async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "Merhaba" }] } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } })
  );

  assert.equal(result.ok, true);
  assert.equal(result.provider, "openai_compatible");
  assert.equal(result.service, "gemini");
  assert.equal(result.model, "gemini-3.8-flash");
});
