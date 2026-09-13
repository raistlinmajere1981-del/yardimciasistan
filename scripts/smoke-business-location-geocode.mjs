import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildBusinessLocationQueryVariants,
  buildBusinessLocationSearchUrl
} = require("../apps/desktop-app/dist-electron/business-location-geocode.js");

const variants = buildBusinessLocationQueryVariants(
  "Selanik caddesi No:65 Kızılay Çankaya Ankara Türkiye"
);

assert.equal(variants[0], "Selanik caddesi No:65 Kızılay Çankaya Ankara Türkiye");
assert.ok(
  variants.some((query) => /Selanik caddesi 65 Kızılay Çankaya Ankara/i.test(query)),
  "Search-friendly fallback should keep the house number while removing country/noise."
);
assert.ok(
  variants.some((query) => /Selanik caddesi Kızılay Çankaya Ankara/i.test(query) && !/\b65\b/.test(query)),
  "Street-level fallback should remove an unmapped building number."
);
assert.ok(
  variants.some((query) => /^Kızılay Çankaya Ankara$/i.test(query)),
  "Locality fallback should remain available when the street itself is missing from OSM."
);
assert.equal(new Set(variants.map((query) => query.toLocaleLowerCase("tr-TR"))).size, variants.length);
assert.ok(variants.length <= 4);

const searchUrl = new URL(buildBusinessLocationSearchUrl(variants[0]));
assert.equal(searchUrl.searchParams.get("countrycodes"), "tr");
assert.equal(searchUrl.searchParams.get("limit"), "5");
assert.equal(searchUrl.searchParams.get("q"), variants[0]);

const abbreviated = buildBusinessLocationQueryVariants(
  "Atatürk Cd. No:12 Daire:4 Konak İzmir Türkiye"
);
assert.ok(abbreviated.some((query) => /Atatürk Caddesi 12/i.test(query)));
assert.ok(abbreviated.some((query) => !/Daire/i.test(query)));

console.log("business-location-geocode-smoke-ok: exact, street and locality fallbacks verified");
