import {
  BUSINESS_CAPABILITIES,
  getBusinessProfile,
  hasBusinessCapability,
  type BusinessCapability
} from "./business-capabilities";
import {
  getBusinessPublicFeatureCatalogForCapabilities,
  getBusinessPublicFeatureLabel,
  normalizeBusinessPublicFeatures,
  normalizeBusinessPublicLanguages,
  normalizeBusinessSocialLinks,
  type BusinessPublicProfile,
  type BusinessSocialLink
} from "./business-public-profile";
import type { BusinessType } from "./business";

export const BUSINESS_AI_CONTEXT_VERSION = 1 as const;

export interface BusinessAiContext {
  version: typeof BUSINESS_AI_CONTEXT_VERSION;
  businessName: string;
  profileId: BusinessType;
  profileLabel: string;
  phone: string;
  whatsapp: string;
  whatsappEnabled: boolean;
  email: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  description: string;
  directionsNote: string;
  policyNote: string;
  paymentNote: string;
  languages: string[];
  features: string[];
  featureIds: string[];
  socialLinks: BusinessSocialLink[];
  capabilityIds?: BusinessCapability[];
  checkInTime: string;
  checkOutTime: string;
  breakfastStartTime: string;
  breakfastEndTime: string;
}

export interface BusinessAiContextSource {
  businessName: string;
  profileId: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  enabledCapabilities: Iterable<BusinessCapability>;
  publicProfile: BusinessPublicProfile;
}

export function createBusinessAiContext(source: BusinessAiContextSource): BusinessAiContext {
  const profile = getBusinessProfile(source.profileId);
  const enabled = source.enabledCapabilities instanceof Set
    ? source.enabledCapabilities
    : new Set(source.enabledCapabilities);
  const hasAccommodation = hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS);
  const hasFoodService = hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.FOOD_MENU)
    || hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.FOOD_TABLES)
    || hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.FOOD_ORDERS);
  const hospitalityDetailsRelevant = hasAccommodation || hasFoodService;
  const normalizedFeatureIds = hospitalityDetailsRelevant
    ? normalizeBusinessPublicFeatures(source.publicProfile.features)
        .filter((featureId) => getBusinessPublicFeatureCatalogForCapabilities(enabled)
          .some((feature) => feature.id === featureId))
    : [];
  const whatsappEnabled = hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.WHATSAPP);

  return {
    version: BUSINESS_AI_CONTEXT_VERSION,
    businessName: cleanText(source.businessName, 160),
    profileId: profile.id,
    profileLabel: profile.label,
    phone: cleanText(source.phone, 80),
    whatsapp: whatsappEnabled ? cleanText(source.whatsapp, 80) : "",
    whatsappEnabled,
    email: cleanText(source.email, 160),
    address: cleanText(source.address, 500),
    latitude: source.publicProfile.latitude,
    longitude: source.publicProfile.longitude,
    description: cleanText(source.publicProfile.description, 1600),
    directionsNote: cleanText(source.publicProfile.directionsNote, 1200),
    policyNote: cleanText(source.publicProfile.policyNote, 1200),
    paymentNote: cleanText(source.publicProfile.paymentNote, 800),
    languages: normalizeBusinessPublicLanguages(source.publicProfile.languages),
    features: normalizedFeatureIds.map(getBusinessPublicFeatureLabel),
    featureIds: normalizedFeatureIds,
    socialLinks: normalizeBusinessSocialLinks(source.publicProfile.socialLinks),
    capabilityIds: [...enabled].sort(),
    checkInTime: hasAccommodation ? source.publicProfile.checkInTime : "",
    checkOutTime: hasAccommodation ? source.publicProfile.checkOutTime : "",
    breakfastStartTime: hasAccommodation ? source.publicProfile.breakfastStartTime : "",
    breakfastEndTime: hasAccommodation ? source.publicProfile.breakfastEndTime : ""
  };
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}


export type BusinessAiUnsupportedDomain = "accommodation" | "food_service";

/**
 * Hard domain guard for AI reply surfaces. Request labels can be generic or stale,
 * so strong intent in the message is evaluated against the persisted capability set.
 */
export function getUnsupportedBusinessAiDomain(
  capabilities: Iterable<BusinessCapability>,
  requestType: string,
  message: string
): BusinessAiUnsupportedDomain | null {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  const normalized = normalizeIntentText(message);
  const hasAccommodation = enabled.has(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS);
  const hasFoodService = enabled.has(BUSINESS_CAPABILITIES.FOOD_TABLES)
    || enabled.has(BUSINESS_CAPABILITIES.FOOD_MENU)
    || enabled.has(BUSINESS_CAPABILITIES.FOOD_ORDERS);

  const accommodationIntent = requestType === "pension_reservation"
    || /(^|\s)(pansiyon|konaklama|geceleme)(\s|$)/u.test(normalized)
    || (/(^|\s)oda(\s|$)/u.test(normalized)
      && /(^|\s)(musait|bos|rezerv|gece|kisi|konak|kalma|yatak|var)(\s|$)/u.test(normalized));
  if (accommodationIntent && !hasAccommodation) {
    return "accommodation";
  }

  const breakfastIntent = requestType === "breakfast_request"
    || /(^|\s)kahvalti(\s|$)/u.test(normalized);
  if (breakfastIntent && !hasAccommodation && !hasFoodService) {
    return "food_service";
  }

  const foodIntent = requestType === "restaurant_reservation"
    || /(^|\s)(restoran|restaurant)(\s|$)/u.test(normalized)
    || /masa\s+(rezerv|ayirt|musait)/u.test(normalized)
    || /aksam\s+yemegi/u.test(normalized);
  if (foodIntent && !hasFoodService) {
    return "food_service";
  }

  if (requestType === "qr_menu_question" && !enabled.has(BUSINESS_CAPABILITIES.FOOD_MENU)) {
    return "food_service";
  }

  return null;
}

const TURKISH_INTENT_REPLACEMENTS: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u"
};

function normalizeIntentText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (letter) => TURKISH_INTENT_REPLACEMENTS[letter] ?? letter)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
