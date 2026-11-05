const assert = require("node:assert/strict");
const test = require("node:test");
const { generateConfiguredChat, analyzeCloudflareImage, generateConfiguredImage, CloudflareAiError } = require("../dist");
const { cloudflareAiBaseUrl, cloudflareAiAccountId, isCloudflareAiBaseUrl, supportsSttModel, supportsImageGenerationModel } = require("@yardimci-asistan/shared");
const models = {
  text: "@cf/zai-org/glm-4.7-flash",
  vision: "@cf/meta/llama-4-scout-17b-16e-instruct",
  image: "@cf/black-forest-labs/flux-1-schnell",
  stt: "@cf/openai/whisper-large-v3-turbo"
};
const baseUrl = cloudflareAiBaseUrl("a".repeat(32));
const config = { enabled: true, provider: "openai_compatible", service: "cloudflare", baseUrl, apiKey: "fixture-cloudflare-token", model: models.text, timeoutMs: 500 };
const messages = [{ role: "user", content: "Merhaba" }];
const json = (result, init) => new Response(JSON.stringify({ success: true, result }), init);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("Cloudflare exact account root and documented capability policy", () => {
  assert.equal(cloudflareAiAccountId(baseUrl), "a".repeat(32));
  assert.ok(isCloudflareAiBaseUrl(baseUrl));
  for (const invalid of [baseUrl.replace("https:", "http:"), baseUrl.replace("api.cloudflare.com", "api.cloudflare.com.evil.test"), baseUrl.replace(".com/", ".com:443/"), `${baseUrl}?token=x`, `${baseUrl}#x`, baseUrl.replace("/ai", "/ai/../ai"), cloudflareAiBaseUrl("short")]) assert.equal(isCloudflareAiBaseUrl(invalid), false);
  assert.equal(supportsSttModel("cloudflare", models.stt), true);
  // Capability/model-task binding is verified against the live catalog in Settings.
  assert.equal(supportsSttModel("cloudflare", "@cf/vendor/whisper-current"), false);
  assert.equal(supportsSttModel("cloudflare", "../unsafe-model"), false);
  assert.equal(supportsImageGenerationModel("cloudflare", models.image), true);
  assert.equal(supportsImageGenerationModel("gemini", models.image), false);
});

test("Cloudflare text routes through the existing configured chat with native GLM and Scout output", async () => {
  for (const result of [{ choices: [{ message: { content: "Merhaba dünya" }, finish_reason: "stop" }] }, { response: "Merhaba dünya" }]) {
    const completion = await generateConfiguredChat({ ...config, messages }, async (url, init) => {
      assert.equal(url, `${baseUrl}/run/${models.text}`);
      assert.equal(init.headers.Authorization, `Bearer ${config.apiKey}`);
      assert.equal(init.redirect, "error");
      assert.deepEqual(JSON.parse(init.body), { messages, stream: false });
      return json(result);
    });
    assert.equal(completion.ok, true); assert.equal(completion.answer, "Merhaba dünya");
  }
});

test("Cloudflare vision sends inline image to the separate configured vision model", async () => {
  const image = `data:image/png;base64,${png.toString("base64")}`;
  const result = await analyzeCloudflareImage({ ...config, model: models.vision }, "Görseli tarif et", image, async (url, init) => {
    assert.equal(url, `${baseUrl}/run/${models.vision}`);
    const parts = JSON.parse(init.body).messages[0].content;
    assert.deepEqual(parts, [{ type: "text", text: "Görseli tarif et" }, { type: "image_url", image_url: { url: image } }]);
    return json({ response: "Siyah bir nokta" });
  });
  assert.equal(result.ok, true);
  for (const invalid of ["https://evil.test/image.png", "data:text/html;base64,YQ=="]) {
    assert.equal((await analyzeCloudflareImage({ ...config, model: models.vision }, "test", invalid, () => { throw new Error("must not fetch"); })).reason, "configuration");
  }
});

for (const [status, code, reason] of [[401,10000,"authentication"],[403,5018,"permission"],[403,5035,"permission"],[429,3036,"quota_exhausted"],[429,3040,"service_busy"],[429,0,"rate_limited"],[400,5007,"model_unavailable"],[408,3007,"timeout"],[500,0,"service_busy"],[503,0,"service_busy"]]) {
  test(`Cloudflare error ${status}/${code} is ${reason} and never leaks provider body`, async () => {
    const failure = await generateConfiguredChat({ ...config, messages }, async () => new Response(JSON.stringify({ success: false, errors: [{ code, message: `${config.apiKey} private customer content` }] }), { status, headers: { "retry-after": "8" } }));
    assert.equal(failure.ok, false); assert.equal(failure.reason, reason); assert.equal(failure.retryAfterSeconds, 8);
    assert.equal(JSON.stringify(failure).includes(config.apiKey), false);
    assert.equal(JSON.stringify(failure).includes("private customer content"), false);
  });
}

test("Cloudflare invalid envelope, empty/truncated output, oversized response and network/timeout", async () => {
  for (const body of ["not json", "null", JSON.stringify({ result: { response: "ok" } }), JSON.stringify({ success: true, result: { response: "" } }), JSON.stringify({ success: true, result: { choices: [{ message: { content: "partial" }, finish_reason: "length" }] } }), "x".repeat(128*1024+1)]) {
    assert.equal((await generateConfiguredChat({ ...config, messages }, async () => new Response(body))).reason, "invalid_response");
  }
  assert.equal((await generateConfiguredChat({ ...config, messages }, async () => { throw new TypeError("fetch failed fixture-cloudflare-token"); })).reason, "network");
  const timeout = await generateConfiguredChat({ ...config, messages, timeoutMs: 5 }, (_url, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Abort", "AbortError")))));
  assert.equal(timeout.reason, "timeout");
});

test("Cloudflare FLUX JPEG is decoded via host normalizer before claiming PNG", async () => {
  const jpeg = Buffer.from([255,216,255,224,0,16,1]);
  const imageConfig = { ...config, model: models.image };
  let converted = false;
  const fetchImage = async (url, init) => {
    assert.equal(url, `${baseUrl}/run/${models.image}`);
    assert.deepEqual(JSON.parse(init.body), { prompt: "A blue circle" });
    return json({ image: jpeg.toString("base64") });
  };
  const image = await generateConfiguredImage(imageConfig, "A blue circle", "landscape", fetchImage, (bytes, aspect) => {
    assert.deepEqual(Buffer.from(bytes), jpeg); assert.equal(aspect, "landscape"); converted = true; return png;
  });
  assert.ok(converted); assert.equal(image.mimeType, "image/png"); assert.deepEqual(Buffer.from(image.bytes), png);
  await assert.rejects(generateConfiguredImage(imageConfig, "A blue circle", "square", fetchImage), error => error instanceof CloudflareAiError && error.reason === "invalid_response");
  await assert.rejects(generateConfiguredImage(imageConfig, "A blue circle", "square", async () => json({ image: Buffer.from("fake PNG").toString("base64") })), /beklediği biçimde/);
  await assert.rejects(generateConfiguredImage(imageConfig, "x".repeat(2049), "square", () => { throw new Error("must not fetch"); }), error => error.reason === "invalid_request");
});

test("FLUX NSFW false positives report Cloudflare content filtering, not malformed JSON", async () => {
  const imageConfig = { ...config, model: models.image };
  const blocked = async () => new Response(JSON.stringify({
    success: false, errors: [{ code: 8007, message: "Input prompt contains NSFW content." }]
  }), { status: 400 });
  await assert.rejects(generateConfiguredImage(imageConfig, "A cozy cottage beneath a clear blue sky", "square", blocked),
    error => error instanceof CloudflareAiError
      && error.providerCode === "8007"
      && error.reason === "invalid_request"
      && /içerik filtresi/.test(error.message)
      && !error.message.includes(config.apiKey));
});

test("Cloudflare unsafe config fails before credentials leave the adapter", async () => {
  for (const patch of [{ baseUrl: `${baseUrl}?evil` }, { apiKey: "key\r\nInjected: x" }, { model: "../evil" }, { enabled: false }]) {
    const result = await generateConfiguredChat({ ...config, ...patch, messages }, () => { throw new Error("must not fetch"); });
    assert.equal(result.reason, "configuration");
  }
});

test("Cloudflare LLaVA image-to-text uses its native byte-array request and description response", async () => {
  const model = "@cf/llava-hf/llava-1.5-7b-hf";
  const image = `data:image/png;base64,${png.toString("base64")}`;
  const completion = await analyzeCloudflareImage({ ...config, model }, "Görseli tarif et", image, async (url, init) => {
    assert.equal(url, `${baseUrl}/run/${model}`);
    assert.deepEqual(JSON.parse(init.body), {
      image: [...png], prompt: "Görseli tarif et", max_tokens: 512
    });
    assert.equal(JSON.parse(init.body).messages, undefined);
    return json({ description: "Küçük bir görsel." });
  });
  assert.equal(completion.ok, true);
  assert.equal(completion.answer, "Küçük bir görsel.");
});

test("Cloudflare Moondream 3.1 uses query/image/question and parses answer (not chat messages)", async () => {
  const model = "@cf/moondream/moondream3.1-9B-A2B";
  const image = `data:image/png;base64,${png.toString("base64")}`;
  const completion = await analyzeCloudflareImage({ ...config, model }, "Ne görüyorsun?", image, async (url, init) => {
    assert.equal(url, `${baseUrl}/run/${model}`);
    assert.deepEqual(JSON.parse(init.body), { task: "query", image, question: "Ne görüyorsun?", reasoning: false, stream: false });
    return json({ answer: "Mavi bir şekil.", finish_reason: "stop" });
  });
  assert.equal(completion.ok, true);
  assert.equal(completion.answer, "Mavi bir şekil.");
  const invalid = await analyzeCloudflareImage({ ...config, model }, "Soru", image, async () => json({ answer: "" }));
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, "invalid_response");
});

test("Cloudflare image rejection never fetches remote URLs or malformed base64 and keeps other vision models working", async () => {
  for (const image of ["https://example.test/private.png", "data:image/png;base64,abc", "data:image/png;base64,<bad>"]) {
    const result = await analyzeCloudflareImage({ ...config, model: "@cf/llava-hf/llava-1.5-7b-hf" }, "Görsel", image,
      () => { throw Error("Invalid image must not reach provider"); });
    assert.equal(result.reason, "configuration");
  }
  const image = `data:image/png;base64,${png.toString("base64")}`;
  const generic = await analyzeCloudflareImage({ ...config, model: models.vision }, "Görsel", image, async (_url, init) => {
    assert.equal(JSON.parse(init.body).messages[0].content[1].image_url.url, image);
    return json({ response: "Mevcut genel biçim korunuyor." });
  });
  assert.equal(generic.ok, true);
});
