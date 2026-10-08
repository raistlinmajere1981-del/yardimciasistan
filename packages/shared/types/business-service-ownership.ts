import { BUSINESS_CAPABILITIES as C, expandBusinessCapabilities, type BusinessCapability } from "./business-capabilities";

/** Availability only: none of these edges activates a service or replaces its test. */
export const BUSINESS_SERVICE_CAPABILITY_OWNERS = {
  whatsapp: [C.CUSTOMERS],
  whatsappCloud: [C.CUSTOMERS], // Operational template messages also use this provider.
  birthday: [C.WHATSAPP],
  android: [C.DEVICES],
  ai: [C.CUSTOMERS], // The assistant is useful without Marketing.
  sms: [C.MESSAGING_CAMPAIGNS],
  instagram: [C.MARKETING_STUDIO],
  delivery: [C.ONLINE_SALES, C.WHOLESALE],
  shipping: [C.ONLINE_SALES, C.WHOLESALE],
  dealerPortal: [C.WHOLESALE],
  productData: [C.RETAIL_BARCODE],
  kbs: [C.ACCOMMODATION_STAYS],
  googleReviews: [C.ACCOMMODATION_ROOMS]
} as const satisfies Record<string, readonly BusinessCapability[]>;

export type BusinessService = keyof typeof BUSINESS_SERVICE_CAPABILITY_OWNERS;

export function isBusinessServiceAvailable(service: BusinessService, capabilities: Iterable<BusinessCapability>): boolean {
  const enabled = new Set(capabilities);
  return BUSINESS_SERVICE_CAPABILITY_OWNERS[service].some(owner =>
    expandBusinessCapabilities([owner]).every(capability => enabled.has(capability)));
}
