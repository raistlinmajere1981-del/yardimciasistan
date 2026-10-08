export interface BusinessLocationGeocodeCandidate {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

export type BusinessLocationGeocodeResponse =
  | { ok: true; results: BusinessLocationGeocodeCandidate[] }
  | { ok: false; message: string };

const DEFAULT_GEOCODER_BASE_URL = "https://nominatim.openstreetmap.org";
const GEOCODER_REQUEST_INTERVAL_MS = 1_100;
const GEOCODER_REQUEST_TIMEOUT_MS = 8_000;
const GEOCODER_CACHE_LIMIT = 50;
const MAX_QUERY_VARIANTS = 4;
const GEOCODER_USER_AGENT = "YardimciAsistanDesktop/0.1.2 (+https://github.com/raistlinmajere1981-del/yardimciasistan)";

const cache = new Map<string, BusinessLocationGeocodeCandidate[]>();
let requestQueue: Promise<void> = Promise.resolve();
let nextRequestAt = 0;

export async function geocodeBusinessAddress(address: string): Promise<BusinessLocationGeocodeResponse> {
  const query = normalizeQuery(address);
  if (query.length < 3) {
    return { ok: false, message: "Haritada aramak için işletme adresini girin." };
  }

  const cacheKey = query.toLocaleLowerCase("tr-TR");
  const cached = cache.get(cacheKey);
  if (cached) {
    return { ok: true, results: cached.map((candidate) => ({ ...candidate })) };
  }

  try {
    let results: BusinessLocationGeocodeCandidate[] = [];
    for (const queryVariant of buildBusinessLocationQueryVariants(query)) {
      results = await searchBusinessLocationVariant(queryVariant);
      if (results.length > 0) break;
    }

    cacheResult(cacheKey, results);
    return { ok: true, results };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Adres araması zaman aşımına uğradı. İnternet bağlantısını kontrol edip tekrar deneyin."
      : "Adres haritada aranamadı. İnternet bağlantısını kontrol edin veya noktayı elle seçin.";
    return { ok: false, message };
  }
}

/**
 * Turkish postal addresses often contain details that OpenStreetMap does not
 * have at building level (No:, apartment, block, floor, etc.). Search the most
 * specific form first, then progressively relax it. The first non-empty result
 * wins, so a precise building match is never replaced by a broader street or
 * neighbourhood match.
 */
function buildBusinessLocationQueryVariants(address: string): string[] {
  const original = normalizeQuery(address);
  if (!original) return [];

  const variants: string[] = [];
  const pushVariant = (value: string) => {
    const normalized = normalizeQuery(value);
    if (normalized.length < 3) return;
    const key = normalized.toLocaleLowerCase("tr-TR");
    if (variants.some((candidate) => candidate.toLocaleLowerCase("tr-TR") === key)) return;
    variants.push(normalized);
  };

  pushVariant(original);

  const searchFriendly = normalizeTurkishAddressSyntax(removeCountryName(original));
  pushVariant(searchFriendly);

  const streetLevel = removeSecondaryAddressDetails(searchFriendly);
  pushVariant(streetLevel);

  const localityLevel = removeStreetSegment(streetLevel);
  pushVariant(localityLevel);

  return variants.slice(0, MAX_QUERY_VARIANTS);
}

function buildBusinessLocationSearchUrl(address: string): string {
  const configuredBaseUrl = String(process.env.YA_GEOCODER_BASE_URL ?? "").trim();
  const baseUrl = /^https?:\/\//i.test(configuredBaseUrl)
    ? configuredBaseUrl
    : DEFAULT_GEOCODER_BASE_URL;
  const endpoint = new URL("search", `${baseUrl.replace(/\/+$/, "")}/`);
  endpoint.searchParams.set("format", "jsonv2");
  endpoint.searchParams.set("q", normalizeQuery(address));
  endpoint.searchParams.set("countrycodes", "tr");
  endpoint.searchParams.set("limit", "5");
  endpoint.searchParams.set("addressdetails", "0");
  return endpoint.toString();
}

async function searchBusinessLocationVariant(query: string): Promise<BusinessLocationGeocodeCandidate[]> {
  return enqueueGeocoderRequest(async () => {
    const endpoint = buildBusinessLocationSearchUrl(query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEOCODER_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Language": "tr,en;q=0.8",
          "User-Agent": GEOCODER_USER_AGENT
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Geocoding request failed with ${response.status}.`);
      }

      const payload = await response.json() as unknown;
      return parseGeocoderPayload(payload);
    } finally {
      clearTimeout(timeout);
    }
  });
}

function normalizeQuery(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/[;,]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

function removeCountryName(value: string): string {
  return normalizeQuery(value.replace(/(?:^|\s)(?:türkiye|turkiye|turkey)(?=\s|$)/giu, " "));
}

function normalizeTurkishAddressSyntax(value: string): string {
  return normalizeQuery(value
    .replace(/\b(?:cd|cad)\.?(?=\s|$)/giu, "Caddesi")
    .replace(/\b(?:sk|sok)\.?(?=\s|$)/giu, "Sokak")
    .replace(/\bblv\.?(?=\s|$)/giu, "Bulvarı")
    .replace(
      /\b(?:kapı\s*no|kapi\s*no|bina\s*no|no|numara)\s*[:.#-]?\s*(\d+[a-zA-ZçğıöşüÇĞİÖŞÜ]?(?:[/-]\d+[a-zA-ZçğıöşüÇĞİÖŞÜ]?)?)\b/giu,
      "$1"
    ));
}

function removeSecondaryAddressDetails(value: string): string {
  return normalizeQuery(value
    .replace(
      /\b(?:daire|kat|blok|apt|apartman(?:ı|i)?|sitesi|site)\s*[:.#-]?\s*[a-zA-Z0-9çğıöşüÇĞİÖŞÜ/-]+\b/giu,
      " "
    )
    .replace(
      /\b(caddesi|cadde|sokağı|sokak|bulvarı|bulvar)\s+\d+[a-zA-ZçğıöşüÇĞİÖŞÜ]?(?:[/-]\d+[a-zA-ZçğıöşüÇĞİÖŞÜ]?)?\b/giu,
      "$1"
    ));
}

function removeStreetSegment(value: string): string {
  const match = value.match(/^.*?\b(?:caddesi|cadde|sokağı|sokak|bulvarı|bulvar)\b\s+(.+)$/iu);
  return match ? normalizeQuery(match[1] ?? "") : "";
}

function parseGeocoderPayload(payload: unknown): BusinessLocationGeocodeCandidate[] {
  if (!Array.isArray(payload)) return [];

  const results: BusinessLocationGeocodeCandidate[] = [];
  for (const [index, item] of payload.entries()) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const latitude = Number(row.lat);
    const longitude = Number(row.lon);
    const label = typeof row.display_name === "string" ? row.display_name.trim() : "";
    if (!label
        || !Number.isFinite(latitude)
        || !Number.isFinite(longitude)
        || latitude < -90
        || latitude > 90
        || longitude < -180
        || longitude > 180) {
      continue;
    }

    results.push({
      id: `${latitude.toFixed(6)}:${longitude.toFixed(6)}:${index}`,
      label,
      latitude: roundCoordinate(latitude),
      longitude: roundCoordinate(longitude)
    });
  }
  return results;
}

function enqueueGeocoderRequest<T>(operation: () => Promise<T>): Promise<T> {
  const scheduled = requestQueue.then(async () => {
    const waitMs = Math.max(0, nextRequestAt - Date.now());
    if (waitMs > 0) await wait(waitMs);
    try {
      return await operation();
    } finally {
      nextRequestAt = Date.now() + GEOCODER_REQUEST_INTERVAL_MS;
    }
  });
  requestQueue = scheduled.then(() => undefined, () => undefined);
  return scheduled;
}

function cacheResult(key: string, results: BusinessLocationGeocodeCandidate[]) {
  if (cache.size >= GEOCODER_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, results.map((candidate) => ({ ...candidate })));
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function roundCoordinate(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
