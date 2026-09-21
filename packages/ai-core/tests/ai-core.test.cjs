const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  buildWebChatMessages,
  createChatCompletionsUrl,
  createGoogleGenerateContentUrl,
  createGoogleModelsUrl,
  createGoogleVisionCheckBody,
  createOwnerReplySuggestion,
  generateOwnerReplySuggestion,
  generateConfiguredChat,
  generateOpenAICompatibleChat,
  generateWebChatReply,
  isGoogleAiStudioVisionModel,
  listGoogleAiStudioModels,
  loadKnowledgeDocuments,
  rankGoogleAiStudioModels,
  verifyGoogleAiStudioVisionModel
} = require("../dist");

test("loadKnowledgeDocuments reads known markdown files with limits", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ya-ai-knowledge-"));
  fs.writeFileSync(path.join(directory, "firma.md"), "# Firma\n" + "A".repeat(20));
  fs.writeFileSync(path.join(directory, "odalar.md"), "# Odalar\nBalkonlu oda var.");

  const documents = loadKnowledgeDocuments({
    directory,
    fileNames: ["firma.md", "missing.md", "odalar.md"],
    maxCharsPerFile: 12,
    maxTotalChars: 24
  });

  assert.equal(documents.length, 2);
  assert.equal(documents[0].title, "Firma");
  assert.equal(documents[0].truncated, true);
  assert.ok(documents[1].content.includes("Odalar"));
});

test("buildWebChatMessages includes guardrails and user message", () => {
  const messages = buildWebChatMessages({
    businessName: "Deniz Çiçeği",
    message: "12 Temmuz için kesin rezervasyon yapabilir misiniz?",
    knowledgeDocuments: [
      {
        id: "firma",
        title: "Firma",
        content: "Kesin rezervasyon onayı verilmez.",
        sourcePath: "firma.md",
        truncated: false
      }
    ],
    history: [
      { role: "assistant", content: "Merhaba" },
      { role: "system", content: "ignored" }
    ]
  });

  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /Kesin rezervasyon/);
  assert.equal(messages.at(-1).role, "user");
  assert.match(messages.at(-1).content, /12 Temmuz/);
  assert.equal(messages.some((message) => message.content === "ignored"), false);
});

test("web chat guardrails cover reservation, price and unknown-topic boundaries", () => {
  const messages = buildWebChatMessages({
    businessName: "Deniz Çiçeği",
    message: "Bu akşam kesin masa ayırıp fiyatı garanti eder misiniz?",
    knowledgeDocuments: []
  });
  const systemPrompt = messages[0].content;

  assert.match(systemPrompt, /Kesin rezervasyon/);
  assert.match(systemPrompt, /bağlayıcı fiyat/);
  assert.match(systemPrompt, /Eksik tarih, saat, kişi sayısı, telefon/);
  assert.match(systemPrompt, /Bilmediğin konuda tahmin yürütme/);
  assert.match(systemPrompt, /WhatsApp/);
});

test("generateOpenAICompatibleChat posts chat completion request", async () => {
  const calls = [];
  const result = await generateOpenAICompatibleChat(
    {
      enabled: true,
      provider: "openai_compatible",
      baseUrl: "https://api.example.test/v1",
      model: "demo-model",
      apiKey: "secret",
      messages: [{ role: "user", content: "Merhaba" }]
    },
    async (url, init) => {
      calls.push({
        url,
        headers: init.headers,
        body: JSON.parse(init.body)
      });

      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: "Merhaba, nasıl yardımcı olabilirim?"
            }
          }
        ]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.answer, "Merhaba, nasıl yardımcı olabilirim?");
  assert.equal(calls[0].url, "https://api.example.test/v1/chat/completions");
  assert.equal(calls[0].headers.Authorization, "Bearer secret");
  assert.equal(calls[0].body.store, false);
});

test("generateOpenAICompatibleChat uses x-goog-api-key for Google authorization keys", async () => {
  let capturedHeaders;
  const result = await generateOpenAICompatibleChat(
    {
      enabled: true,
      provider: "openai_compatible",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-flash",
      apiKey: "AQ.google-auth-key",
      authMode: "google_api_key",
      messages: [{ role: "user", content: "Merhaba" }]
    },
    async (_url, init) => {
      capturedHeaders = init.headers;
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Bağlantı çalışıyor." } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  );

  assert.equal(result.ok, true);
  assert.equal(capturedHeaders["x-goog-api-key"], "AQ.google-auth-key");
  assert.equal("Authorization" in capturedHeaders, false);
});

test("generateConfiguredChat uses native generateContent for Google AI Studio", async () => {
  const calls = [];
  const result = await generateConfiguredChat(
    {
      enabled: true,
      provider: "openai_compatible",
      service: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-flash",
      apiKey: "AQ.google-auth-key",
      messages: [
        { role: "system", content: "Kısa cevap ver." },
        { role: "user", content: "Merhaba" }
      ]
    },
    async (url, init) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Bağlantı çalışıyor." }] } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.answer, "Bağlantı çalışıyor.");
  assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash:generateContent");
  assert.equal(calls[0].headers["x-goog-api-key"], "AQ.google-auth-key");
  assert.equal("Authorization" in calls[0].headers, false);
  assert.equal(calls[0].body.systemInstruction.parts[0].text, "Kısa cevap ver.");
  assert.deepEqual(calls[0].body.contents[0], { role: "user", parts: [{ text: "Merhaba" }] });
});

test("listGoogleAiStudioModels returns only generateContent models without exposing the key in the URL", async () => {
  const calls = [];
  const result = await listGoogleAiStudioModels(
    {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "google-secret"
    },
    async (url, init) => {
      calls.push({ url, headers: init.headers });
      return new Response(JSON.stringify({
        models: [
          {
            name: "models/gemini-3.5-flash",
            baseModelId: "gemini-3.5-flash",
            displayName: "Gemini 3.5 Flash",
            supportedGenerationMethods: ["generateContent"],
            inputTokenLimit: 1000
          },
          {
            name: "models/text-embedding",
            supportedGenerationMethods: ["embedContent"]
          }
        ]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.models.map((model) => model.id), ["gemini-3.5-flash"]);
  assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000");
  assert.equal(calls[0].headers["x-goog-api-key"], "google-secret");
  assert.equal(calls[0].url.includes("google-secret"), false);
});

test("listGoogleAiStudioModels keeps only current general-purpose multimodal Gemini models and removes duplicates", async () => {
  const result = await listGoogleAiStudioModels(
    {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "google-secret"
    },
    async () => new Response(JSON.stringify({
      models: [
        {
          name: "models/gemini-3.6-flash-001",
          baseModelId: "gemini-3.6-flash",
          displayName: "Gemini 3.6 Flash",
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "models/gemini-3.6-flash-002",
          baseModelId: "gemini-3.6-flash",
          displayName: "Gemini 3.6 Flash duplicate",
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "models/gemini-3.1-pro-preview",
          displayName: "Gemini 3.1 Pro Preview",
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "models/gemini-3.5-flash-lite",
          displayName: "Gemini 3.5 Flash-Lite",
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "models/gemini-2.5-flash",
          displayName: "Gemini 2.5 Flash",
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "models/gemini-flash-latest",
          displayName: "Gemini Flash Latest",
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "models/gemini-3.1-flash-image",
          displayName: "Gemini image generator",
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "models/gemini-3.1-flash-tts-preview",
          displayName: "Gemini TTS",
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "models/gemini-2.0-flash",
          displayName: "Gemini 2.0 Flash Shut down",
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "models/gemma-3-27b-it",
          displayName: "Gemma 3",
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "models/gemini-embedding-2",
          displayName: "Gemini Embedding 2",
          supportedGenerationMethods: ["embedContent"]
        }
      ]
    }), { status: 200, headers: { "Content-Type": "application/json" } })
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.models.map((model) => model.id), ["gemini-3.5-flash-lite", "gemini-3.6-flash"]);
  assert.equal(isGoogleAiStudioVisionModel({ id: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", description: "" }), false);
  assert.equal(isGoogleAiStudioVisionModel({ id: "gemini-flash-latest", displayName: "Gemini Flash Latest", description: "" }), false);
  assert.equal(isGoogleAiStudioVisionModel({ id: "gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro Preview", description: "" }), false);
  assert.equal(isGoogleAiStudioVisionModel({ id: "gemini-2.5-flash-image", displayName: "Nano Banana", description: "" }), false);
});

test("verifyGoogleAiStudioVisionModel sends an inline image and JSON response configuration", async () => {
  const calls = [];
  const result = await verifyGoogleAiStudioVisionModel(
    {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-3.6-flash",
      apiKey: "google-secret"
    },
    async (url, init) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "{\"vision\":true}" }] } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.model, "gemini-3.6-flash");
  assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent");
  assert.equal(calls[0].headers["x-goog-api-key"], "google-secret");
  assert.equal(calls[0].body.contents[0].parts[1].inlineData.mimeType, "image/png");
  assert.match(calls[0].body.contents[0].parts[1].inlineData.data, /^[A-Za-z0-9+/]+=*$/);
  assert.equal(calls[0].body.generationConfig.responseMimeType, "application/json");
  assert.equal("temperature" in calls[0].body.generationConfig, false);
  assert.deepEqual(calls[0].body, createGoogleVisionCheckBody());
});

test("createGoogleModelsUrl accepts the configured OpenAI-compatible Gemini endpoint", () => {
  assert.equal(
    createGoogleModelsUrl("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"),
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000"
  );
  assert.equal(createGoogleModelsUrl("https://provider.example.test/v1beta/openai"), "");
  assert.equal(
    createGoogleGenerateContentUrl("https://generativelanguage.googleapis.com/v1beta", "models/gemini-flash"),
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash:generateContent"
  );
});

test("rankGoogleAiStudioModels prefers current stable text models over quota-closed discontinued variants", () => {
  const ranked = rankGoogleAiStudioModels([
    "gemini-2.0-flash-lite",
    "gemini-3.1-flash-image-preview",
    "gemini-2.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3-flash-preview"
  ]);

  assert.equal(ranked[0], "gemini-3.5-flash");
  assert.ok(ranked.indexOf("gemini-2.5-flash-lite") < ranked.indexOf("gemini-2.0-flash-lite"));
  assert.ok(ranked.indexOf("gemini-2.0-flash-lite") < ranked.indexOf("gemini-3.1-flash-image-preview"));
});


test("generateWebChatReply returns fallback answer when provider request fails", async () => {
  const result = await generateWebChatReply(
    {
      businessName: "Deniz Çiçeği",
      message: "Bana kesin fiyat verir misiniz?",
      knowledgeDocuments: []
    },
    {
      enabled: true,
      provider: "openai_compatible",
      baseUrl: "https://api.example.test/v1",
      model: "demo-model",
      apiKey: "secret"
    },
    async () => new Response(JSON.stringify({ error: { message: "quota" } }), {
      status: 429,
      headers: { "Content-Type": "application/json" }
    })
  );

  assert.equal(result.ok, false);
  assert.equal(result.provider, "openai_compatible");
  assert.match(result.fallbackAnswer, /işletme sahibi/);
});

test("generateWebChatReply returns safe fallback when disabled", async () => {
  const result = await generateWebChatReply(
    {
      businessName: "Deniz Çiçeği",
      message: "Fiyat nedir?",
      knowledgeDocuments: []
    },
    {
      enabled: false,
      provider: "disabled",
      baseUrl: "",
      model: "",
      apiKey: ""
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.fallback, true);
  assert.match(result.answer, /işletme sahibi/);
});

test("createOwnerReplySuggestion keeps owner approval boundary", () => {
  const suggestion = createOwnerReplySuggestion({
    businessName: "Deniz Çiçeği Pansiyon",
    customerName: "Demo Misafir",
    requestType: "pension_reservation",
    dateText: "",
    guestCount: 2,
    message: "Balkonlu oda istiyorum."
  });

  assert.match(suggestion.summary, /pansiyon rezervasyonu/);
  assert.deepEqual(suggestion.missingFields, ["tarih"]);
  assert.match(suggestion.suggestedReply, /işletme sahibi/);
});

test("createOwnerReplySuggestion asks for missing fields and avoids final approval language", () => {
  const suggestion = createOwnerReplySuggestion({
    businessName: "Deniz Çiçeği Pansiyon",
    customerName: "Demo Masa",
    requestType: "price_question",
    dateText: "",
    guestCount: 0,
    message: ""
  });

  assert.match(suggestion.summary, /fiyat sorusu/);
  assert.deepEqual(suggestion.missingFields, ["tarih", "kişi sayısı", "kısa not"]);
  assert.match(suggestion.suggestedReply, /Müsaitlik ve fiyat bilgisi/);
  assert.doesNotMatch(suggestion.suggestedReply, /rezervasyonunuz onaylandı/i);
});

test("generateOwnerReplySuggestion uses provider JSON when available", async () => {
  const calls = [];
  const suggestion = await generateOwnerReplySuggestion(
    {
      businessName: "Deniz Çiçeği Pansiyon",
      customerName: "Demo Misafir",
      requestType: "pension_reservation",
      dateText: "18-20 Temmuz",
      guestCount: 2,
      message: "Balkonlu oda var mı?",
      instructions: "Kısa ve samimi yaz."
    },
    {
      enabled: true,
      provider: "openai_compatible",
      baseUrl: "https://api.example.test/v1",
      model: "demo-model",
      apiKey: "secret"
    },
    async (url, init) => {
      calls.push({
        url,
        body: JSON.parse(init.body)
      });

      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "Demo Misafir balkonlu oda soruyor.",
                missingFields: [],
                suggestedReply: "Merhaba Demo Misafir, talebinizi aldık. Müsaitlik ve fiyat bilgisini kontrol edip size dönüş yapacağız."
              })
            }
          }
        ]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  );

  assert.equal(suggestion.fallback, false);
  assert.equal(suggestion.provider, "openai_compatible");
  assert.equal(suggestion.model, "demo-model");
  assert.match(suggestion.summary, /balkonlu oda/);
  assert.match(suggestion.suggestedReply, /kontrol edip/);
  assert.equal(calls[0].url, "https://api.example.test/v1/chat/completions");
  assert.match(calls[0].body.messages[0].content, /Kesin rezervasyon/);
  assert.match(calls[0].body.messages[1].content, /Kısa ve samimi yaz/);
});

test("generateOwnerReplySuggestion falls back on provider errors or unsafe approval language", async () => {
  const input = {
    businessName: "Deniz Çiçeği Pansiyon",
    customerName: "Demo Misafir",
    requestType: "pension_reservation",
    dateText: "18-20 Temmuz",
    guestCount: 2,
    message: "Balkonlu oda var mı?"
  };

  const failedSuggestion = await generateOwnerReplySuggestion(
    input,
    {
      enabled: true,
      provider: "openai_compatible",
      baseUrl: "https://api.example.test/v1",
      model: "demo-model",
      apiKey: "secret"
    },
    async () => new Response(JSON.stringify({ error: { message: "quota" } }), {
      status: 429,
      headers: { "Content-Type": "application/json" }
    })
  );

  assert.equal(failedSuggestion.fallback, true);
  assert.match(failedSuggestion.providerMessage, /quota/);
  assert.match(failedSuggestion.suggestedReply, /işletme sahibi/);

  const unsafeSuggestion = await generateOwnerReplySuggestion(
    input,
    {
      enabled: true,
      provider: "openai_compatible",
      baseUrl: "https://api.example.test/v1",
      model: "demo-model",
      apiKey: "secret"
    },
    async () => new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: "Tehlikeli cevap",
              missingFields: [],
              suggestedReply: "Rezervasyonunuz onaylandı, fiyat garantisi veriyoruz."
            })
          }
        }
      ]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  );

  assert.equal(unsafeSuggestion.fallback, true);
  assert.match(unsafeSuggestion.providerMessage, /bağlayıcı onay/);
  assert.doesNotMatch(unsafeSuggestion.suggestedReply, /onaylandı/i);
});

test("createChatCompletionsUrl accepts full endpoint or base URL", () => {
  assert.equal(createChatCompletionsUrl("https://api.example.test/v1"), "https://api.example.test/v1/chat/completions");
  assert.equal(createChatCompletionsUrl("https://api.example.test/v1/chat/completions"), "https://api.example.test/v1/chat/completions");
});


test("owner reply uses current business context and does not demand reservation fields for market-style info questions", () => {
  const suggestion = createOwnerReplySuggestion({
    businessName: "Nehir Tekel",
    customerName: "Ali",
    requestType: "location_question",
    dateText: "",
    guestCount: 0,
    message: "Nasıl gelebilirim?",
    businessContext: {
      profileId: "market",
      profileLabel: "Market / Perakende",
      directionsNote: "Ana caddeden ikinci sokak."
    }
  });
  assert.deepEqual(suggestion.missingFields, []);
});

test("owner reply prompt carries published business context and forbids sector assumptions", async () => {
  let sentBody;
  const result = await generateOwnerReplySuggestion({
    businessName: "Nehir Tekel",
    customerName: "Ali",
    requestType: "general_info",
    dateText: "",
    guestCount: 0,
    message: "Kart geçiyor mu?",
    businessContext: {
      profileId: "market",
      profileLabel: "Market / Perakende",
      paymentNote: "Nakit ve kart kabul edilir.",
      checkInTime: ""
    }
  }, {
    enabled: true,
    provider: "openai_compatible",
    baseUrl: "https://api.example.test/v1",
    model: "demo-model",
    apiKey: "secret"
  }, async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        summary: "Ödeme yöntemi sorusu",
        missingFields: [],
        suggestedReply: "Merhaba Ali, nakit ve kart kabul ediyoruz."
      }) } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  assert.equal(result.fallback, false);
  const system = sentBody.messages[0].content;
  const user = JSON.parse(sentBody.messages[1].content);
  assert.match(system, /bağlamda bulunmayan sektör/);
  assert.equal(user.businessContext.profileId, "market");
  assert.equal(user.businessContext.paymentNote, "Nakit ve kart kabul edilir.");
});
