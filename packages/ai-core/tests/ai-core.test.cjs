const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  buildWebChatMessages,
  createChatCompletionsUrl,
  createOwnerReplySuggestion,
  generateOwnerReplySuggestion,
  generateOpenAICompatibleChat,
  generateWebChatReply,
  loadKnowledgeDocuments
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
      message: "Balkonlu oda var mı?"
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
