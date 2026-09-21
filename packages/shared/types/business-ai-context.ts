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
  type BusinessPublicProfile
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
  description: string;
  directionsNote: string;
  policyNote: string;
  paymentNote: string;
  languages: string[];
  features: string[];
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
    description: cleanText(source.publicProfile.description, 1600),
    directionsNote: cleanText(source.publicProfile.directionsNote, 1200),
    policyNote: cleanText(source.publicProfile.policyNote, 1200),
    paymentNote: cleanText(source.publicProfile.paymentNote, 800),
    languages: normalizeBusinessPublicLanguages(source.publicProfile.languages),
    features: hospitalityDetailsRelevant
      ? normalizeBusinessPublicFeatures(source.publicProfile.features)
          .filter((featureId) => getBusinessPublicFeatureCatalogForCapabilities(enabled)
            .some((feature) => feature.id === featureId))
          .map(getBusinessPublicFeatureLabel)
      : [],
    checkInTime: hasAccommodation ? source.publicProfile.checkInTime : "",
    checkOutTime: hasAccommodation ? source.publicProfile.checkOutTime : "",
    breakfastStartTime: hasAccommodation ? source.publicProfile.breakfastStartTime : "",
    breakfastEndTime: hasAccommodation ? source.publicProfile.breakfastEndTime : ""
  };
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}
