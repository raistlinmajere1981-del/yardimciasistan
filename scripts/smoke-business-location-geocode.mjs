import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  geocodeBusinessAddress
} = require("../apps/desktop-app/dist-electron/business-location-geocode.js");

const address = "Selanik caddesi No:65 Kızılay Çankaya Ankara Türkiye";
const requestedUrls = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url) => {
  requestedUrls.push(String(url));
  if (requestedUrls.length === 1) {
    return {
      ok: true,
      json: async () => []
    };
  }
  return {
    ok: true,
    json: async () => [
      {
        lat: "39.920770",
        lon: "32.854110",
        display_name: "Selanik Caddesi 65, Kızılay, Çankaya, Ankara"
      }
    ]
  };
};

try {
  const result = await geocodeBusinessAddress(address);

  assert.equal(result.ok, true);
  assert.equal(result.results.length, 1);
  const candidate = result.results[0];
  assert.equal(candidate.label, "Selanik Caddesi 65, Kızılay, Çankaya, Ankara");
  assert.equal(candidate.latitude, 39.92077);
  assert.equal(candidate.longitude, 32.85411);
  assert.equal(candidate.id, "39.920770:32.854110:0");

  assert.ok(requestedUrls.length >= 2, "Exact query should miss and fallback should be tried.");
  assert.ok(requestedUrls.length <= 4, "Fallback chain should stay within variant limit.");

  const firstUrl = new URL(requestedUrls[0]);
  assert.equal(firstUrl.searchParams.get("format"), "jsonv2");
  assert.equal(firstUrl.searchParams.get("countrycodes"), "tr");
  assert.equal(firstUrl.searchParams.get("limit"), "5");
  assert.equal(firstUrl.searchParams.get("q"), "Selanik caddesi No:65 Kızılay Çankaya Ankara Türkiye");

  for (const rawUrl of requestedUrls) {
    const parsed = new URL(rawUrl);
    assert.equal(parsed.searchParams.get("format"), "jsonv2");
    assert.equal(parsed.searchParams.get("countrycodes"), "tr");
    assert.equal(parsed.searchParams.get("limit"), "5");
  }

  const queries = requestedUrls.map((rawUrl) => new URL(rawUrl).searchParams.get("q") ?? "");
  assert.equal(new Set(queries.map((query) => query.toLocaleLowerCase("tr-TR"))).size, queries.length);

  const fallbackQuery = queries[1];
  assert.ok(
    /Selanik caddesi 65 Kızılay Çankaya Ankara/i.test(fallbackQuery),
    `Search-friendly fallback should keep the house number while removing country/noise, got: ${fallbackQuery}`
  );
  assert.equal(/\bTürkiye\b/iu.test(fallbackQuery), false);
  assert.equal(/\bNo:/u.test(fallbackQuery), false);
  assert.notEqual(
    fallbackQuery.toLocaleLowerCase("tr-TR"),
    queries[0].toLocaleLowerCase("tr-TR")
  );

  console.log("business-location-geocode-smoke-ok: exact, street and locality fallbacks verified");
} finally {
  globalThis.fetch = originalFetch;
}
