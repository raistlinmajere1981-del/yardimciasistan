export const BUSINESS_SOCIAL_PLATFORM_CATALOG = [
  { id: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com"] },
  { id: "instagram", label: "Instagram", hosts: ["instagram.com"] },
  { id: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { id: "tiktok", label: "TikTok", hosts: ["tiktok.com"] },
  { id: "x", label: "X", hosts: ["x.com", "twitter.com"] }
] as const;

export type BusinessSocialPlatformId = (typeof BUSINESS_SOCIAL_PLATFORM_CATALOG)[number]["id"];

export interface BusinessSocialLink {
  platform: BusinessSocialPlatformId;
  url: string;
}

const BUSINESS_SOCIAL_PLATFORM_IDS = new Set<string>(
  BUSINESS_SOCIAL_PLATFORM_CATALOG.map((platform) => platform.id)
);

export const BUSINESS_PUBLIC_FEATURE_CATALOG = [
  { id: "wifi", label: "Wi-Fi", group: "connectivity" },
  { id: "parking", label: "Otopark", group: "transport" },
  { id: "pet_friendly", label: "Evcil hayvan kabul edilir", group: "policy" },
  { id: "family_friendly", label: "Çocuklu ailelere uygun", group: "policy" },
  { id: "wheelchair_access", label: "Tekerlekli sandalye erişimine uygun", group: "accessibility" },
  { id: "step_free_access", label: "Basamaksız erişim", group: "accessibility" },
  { id: "garden", label: "Bahçe", group: "outdoor" },
  { id: "terrace", label: "Teras", group: "outdoor" },
  { id: "luggage_storage", label: "Bagaj emaneti", group: "service" },
  { id: "airport_transfer", label: "Havalimanı transferi", group: "transport" }
] as const;

export type BusinessPublicFeatureId = (typeof BUSINESS_PUBLIC_FEATURE_CATALOG)[number]["id"];
export type BusinessPublicFeatureGroup = (typeof BUSINESS_PUBLIC_FEATURE_CATALOG)[number]["group"];

const ACCOMMODATION_ONLY_PUBLIC_FEATURE_IDS = new Set<BusinessPublicFeatureId>([
  "luggage_storage",
  "airport_transfer"
]);

export const BUSINESS_PUBLIC_PROFILE_LIMITS = {
  description: 1600,
  directionsNote: 1200,
  policyNote: 1200,
  paymentNote: 800,
  language: 40,
  languages: 12,
  features: BUSINESS_PUBLIC_FEATURE_CATALOG.length,
  socialLinks: BUSINESS_SOCIAL_PLATFORM_CATALOG.length,
  socialUrl: 1000
} as const;

/**
 * Customer-facing business facts that do not already have an authoritative
 * source elsewhere. Business name, phone, WhatsApp, e-mail and street address
 * remain owned by the main setup/settings record and are merged into the
 * future public context instead of being duplicated here.
 */
export interface BusinessPublicProfile {
  description: string;
  latitude: number | null;
  longitude: number | null;
  directionsNote: string;
  checkInTime: string;
  checkOutTime: string;
  breakfastStartTime: string;
  breakfastEndTime: string;
  features: BusinessPublicFeatureId[];
  policyNote: string;
  paymentNote: string;
  languages: string[];
  socialLinks: BusinessSocialLink[];
}

export type SaveBusinessPublicProfileInput = BusinessPublicProfile;

const BUSINESS_PUBLIC_FEATURE_IDS = new Set<string>(
  BUSINESS_PUBLIC_FEATURE_CATALOG.map((feature) => feature.id)
);
const BUSINESS_PUBLIC_FEATURE_LABELS = new Map<string, string>(
  BUSINESS_PUBLIC_FEATURE_CATALOG.map((feature) => [feature.id, feature.label])
);

export function isBusinessPublicFeatureId(value: unknown): value is BusinessPublicFeatureId {
  return typeof value === "string" && BUSINESS_PUBLIC_FEATURE_IDS.has(value);
}

/**
 * Public profile features are allow-listed so internal/free-form values cannot
 * accidentally become customer-facing web or AI context later.
 */
export function normalizeBusinessPublicFeatures(values: readonly unknown[]): BusinessPublicFeatureId[] {
  const normalized: BusinessPublicFeatureId[] = [];
  const seen = new Set<BusinessPublicFeatureId>();

  for (const value of values) {
    if (!isBusinessPublicFeatureId(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export function getBusinessPublicFeatureLabel(value: string): string {
  return BUSINESS_PUBLIC_FEATURE_LABELS.get(value) ?? value;
}

export function getBusinessPublicFeatureCatalogForCapabilities(
  capabilities: Iterable<string>
): readonly (typeof BUSINESS_PUBLIC_FEATURE_CATALOG)[number][] {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  const hasAccommodation = enabled.has("accommodation.rooms");
  const hasFoodService = enabled.has("food_service.menu")
    || enabled.has("food_service.tables")
    || enabled.has("food_service.orders");

  if (hasAccommodation) {
    return BUSINESS_PUBLIC_FEATURE_CATALOG;
  }
  if (hasFoodService) {
    return BUSINESS_PUBLIC_FEATURE_CATALOG.filter(
      (feature) => !ACCOMMODATION_ONLY_PUBLIC_FEATURE_IDS.has(feature.id)
    );
  }
  return [];
}

export function isBusinessPublicClockTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value === "") return true;
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function normalizeBusinessPublicLanguages(values: readonly unknown[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") continue;
    const language = value.trim().replace(/\s+/g, " ").slice(0, BUSINESS_PUBLIC_PROFILE_LIMITS.language);
    if (!language) continue;
    const key = language.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(language);
    if (normalized.length >= BUSINESS_PUBLIC_PROFILE_LIMITS.languages) break;
  }

  return normalized;
}

export function hasCompleteBusinessPublicMapPoint(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === "number"
    && Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && typeof longitude === "number"
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180;
}


export function isBusinessSocialPlatformId(value: unknown): value is BusinessSocialPlatformId {
  return typeof value === "string" && BUSINESS_SOCIAL_PLATFORM_IDS.has(value);
}

export function normalizeBusinessSocialLinkUrl(
  platform: BusinessSocialPlatformId,
  value: unknown
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return "";
  }

  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    return "";
  }

  const definition = BUSINESS_SOCIAL_PLATFORM_CATALOG.find((candidate) => candidate.id === platform);
  if (!definition) return "";
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const matchesPlatform = definition.hosts.some((host) =>
    hostname === host || hostname.endsWith(`.${host}`)
  );
  if (!matchesPlatform) return "";

  parsed.protocol = "https:";
  parsed.hash = "";
  return parsed.toString();
}

export function normalizeBusinessSocialLinks(values: readonly unknown[]): BusinessSocialLink[] {
  const normalized: BusinessSocialLink[] = [];
  const seen = new Set<BusinessSocialPlatformId>();

  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const candidate = value as { platform?: unknown; url?: unknown };
    if (!isBusinessSocialPlatformId(candidate.platform) || seen.has(candidate.platform)) continue;
    const url = normalizeBusinessSocialLinkUrl(candidate.platform, candidate.url);
    if (!url) continue;
    seen.add(candidate.platform);
    normalized.push({ platform: candidate.platform, url });
    if (normalized.length >= BUSINESS_PUBLIC_PROFILE_LIMITS.socialLinks) break;
  }

  return normalized;
}
