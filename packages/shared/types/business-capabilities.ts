import type { BusinessType } from "./business";

export const BUSINESS_CAPABILITIES = {
  CUSTOMERS: "core.customers",
  TASKS: "core.tasks",
  CALENDAR: "core.calendar",
  NOTIFICATIONS: "core.notifications",
  FINANCE: "core.finance",
  REPORTS: "core.reports",
  WEB: "core.web",
  SYNC: "core.sync",
  BACKUPS: "core.backups",
  DEVICES: "core.devices",

  WHATSAPP: "service.whatsapp",
  AI: "service.ai",
  ANDROID: "service.android",

  ACCOMMODATION_ROOMS: "accommodation.rooms",
  ACCOMMODATION_RESERVATIONS: "accommodation.reservations",
  ACCOMMODATION_STAYS: "accommodation.stays",
  ACCOMMODATION_FOLIO: "accommodation.folio",

  FOOD_TABLES: "food_service.tables",
  FOOD_RESERVATIONS: "food_service.reservations",
  FOOD_ORDERS: "food_service.orders",
  FOOD_MENU: "food_service.menu",
  QR_MENU: "channel.qr_menu",

  CATALOG: "commerce.catalog",
  INVENTORY: "commerce.inventory",
  SALES: "commerce.sales",
  CUSTOMER_CREDIT: "commerce.customer_credit",

  RETAIL_BARCODE: "retail.barcode",
  RETAIL_PURCHASING: "retail.purchasing",
  RETAIL_SUPPLIERS: "retail.suppliers",
  RETAIL_LABELS: "retail.labels"
} as const;

export type BusinessCapability = typeof BUSINESS_CAPABILITIES[keyof typeof BUSINESS_CAPABILITIES];

export interface BusinessProfileDefinition {
  id: BusinessType;
  label: string;
  description: string;
  defaultCapabilities: BusinessCapability[];
}

export interface BusinessCapabilityDependencyViolation {
  capability: BusinessCapability;
  missingDependencies: BusinessCapability[];
}

const C = BUSINESS_CAPABILITIES;

/**
 * Capability dependencies describe structural requirements, not UI bundles.
 * A capability may still be toggled independently as long as its prerequisites
 * remain enabled. This prevents invalid hybrid profiles without reintroducing
 * hardcoded business-type combinations.
 */
export const BUSINESS_CAPABILITY_DEPENDENCIES: Partial<Record<BusinessCapability, readonly BusinessCapability[]>> = {
  [C.ACCOMMODATION_RESERVATIONS]: [C.ACCOMMODATION_ROOMS],
  [C.ACCOMMODATION_STAYS]: [C.ACCOMMODATION_ROOMS],
  [C.ACCOMMODATION_FOLIO]: [C.ACCOMMODATION_ROOMS, C.ACCOMMODATION_STAYS, C.FINANCE],

  [C.FOOD_RESERVATIONS]: [C.FOOD_TABLES],
  [C.FOOD_ORDERS]: [C.FOOD_TABLES, C.FOOD_MENU],
  [C.QR_MENU]: [C.FOOD_MENU],

  [C.INVENTORY]: [C.CATALOG],
  [C.SALES]: [C.CATALOG],
  [C.CUSTOMER_CREDIT]: [C.CUSTOMERS, C.SALES, C.FINANCE],
  [C.RETAIL_BARCODE]: [C.CATALOG],
  [C.RETAIL_PURCHASING]: [C.CATALOG, C.INVENTORY],
  [C.RETAIL_LABELS]: [C.CATALOG]
};

export const CORE_BUSINESS_CAPABILITIES: BusinessCapability[] = [
  C.CUSTOMERS,
  C.TASKS,
  C.CALENDAR,
  C.NOTIFICATIONS,
  C.FINANCE,
  C.REPORTS,
  C.WEB,
  C.SYNC,
  C.BACKUPS,
  C.DEVICES
];

const STANDARD_CONNECTED_CAPABILITIES: BusinessCapability[] = [
  C.WHATSAPP,
  C.ANDROID
];

const ACCOMMODATION_CAPABILITIES: BusinessCapability[] = [
  C.ACCOMMODATION_ROOMS,
  C.ACCOMMODATION_RESERVATIONS,
  C.ACCOMMODATION_STAYS,
  C.ACCOMMODATION_FOLIO
];

const FOOD_SERVICE_CAPABILITIES: BusinessCapability[] = [
  C.FOOD_TABLES,
  C.FOOD_RESERVATIONS,
  C.FOOD_ORDERS,
  C.FOOD_MENU,
  C.QR_MENU,
  C.CATALOG,
  C.INVENTORY,
  C.SALES
];

const RETAIL_CAPABILITIES: BusinessCapability[] = [
  C.CATALOG,
  C.INVENTORY,
  C.SALES,
  C.CUSTOMER_CREDIT,
  C.RETAIL_BARCODE,
  C.RETAIL_PURCHASING,
  C.RETAIL_SUPPLIERS,
  C.RETAIL_LABELS
];

function uniqueCapabilities(...groups: BusinessCapability[][]): BusinessCapability[] {
  return [...new Set(groups.flat())];
}

export function getBusinessCapabilityDependencies(capability: BusinessCapability): readonly BusinessCapability[] {
  return BUSINESS_CAPABILITY_DEPENDENCIES[capability] ?? [];
}

export function expandBusinessCapabilities(capabilities: Iterable<BusinessCapability>): BusinessCapability[] {
  const expanded = new Set<BusinessCapability>(capabilities);
  const pending = [...expanded];

  while (pending.length > 0) {
    const capability = pending.pop();
    if (!capability) continue;
    for (const dependency of getBusinessCapabilityDependencies(capability)) {
      if (expanded.has(dependency)) continue;
      expanded.add(dependency);
      pending.push(dependency);
    }
  }

  return [...expanded];
}

export function validateBusinessCapabilitySet(
  capabilities: Iterable<BusinessCapability>
): BusinessCapabilityDependencyViolation[] {
  const enabled = new Set(capabilities);
  const violations: BusinessCapabilityDependencyViolation[] = [];

  for (const capability of enabled) {
    const missingDependencies = getBusinessCapabilityDependencies(capability)
      .filter((dependency) => !enabled.has(dependency));
    if (missingDependencies.length > 0) {
      violations.push({ capability, missingDependencies: [...missingDependencies] });
    }
  }

  return violations;
}

export function getEnabledBusinessCapabilityDependents(
  capability: BusinessCapability,
  enabledCapabilities: Iterable<BusinessCapability>
): BusinessCapability[] {
  const enabled = [...new Set(enabledCapabilities)];
  return enabled.filter((candidate) => {
    if (candidate === capability) return false;
    const closure = new Set(expandBusinessCapabilities([candidate]));
    return closure.has(capability);
  });
}

export const BUSINESS_PROFILES: Record<BusinessType, BusinessProfileDefinition> = {
  pension_restaurant: {
    id: "pension_restaurant",
    label: "Pansiyon + Restoran/Kafe",
    description: "Konaklama ve yiyecek-içecek operasyonları aynı işletme omurgasında çalışır.",
    defaultCapabilities: expandBusinessCapabilities(uniqueCapabilities(
      CORE_BUSINESS_CAPABILITIES,
      STANDARD_CONNECTED_CAPABILITIES,
      ACCOMMODATION_CAPABILITIES,
      FOOD_SERVICE_CAPABILITIES
    ))
  },
  pension: {
    id: "pension",
    label: "Pansiyon",
    description: "Konaklama, müşteri, finans, web ve saha operasyonları için hazır profil.",
    defaultCapabilities: expandBusinessCapabilities(uniqueCapabilities(
      CORE_BUSINESS_CAPABILITIES,
      STANDARD_CONNECTED_CAPABILITIES,
      ACCOMMODATION_CAPABILITIES
    ))
  },
  restaurant: {
    id: "restaurant",
    label: "Restoran",
    description: "Masa, sipariş, menü, stok, satış ve saha operasyonları için hazır profil.",
    defaultCapabilities: expandBusinessCapabilities(uniqueCapabilities(
      CORE_BUSINESS_CAPABILITIES,
      STANDARD_CONNECTED_CAPABILITIES,
      FOOD_SERVICE_CAPABILITIES
    ))
  },
  cafe: {
    id: "cafe",
    label: "Kafe",
    description: "Restoran profilinin daha hafif kullanım biçimi; aynı yiyecek-içecek yeteneklerini kullanır.",
    defaultCapabilities: expandBusinessCapabilities(uniqueCapabilities(
      CORE_BUSINESS_CAPABILITIES,
      STANDARD_CONNECTED_CAPABILITIES,
      FOOD_SERVICE_CAPABILITIES
    ))
  },
  market: {
    id: "market",
    label: "Market / Perakende",
    description: "Ürün, barkod, stok, hızlı satış, tedarikçi ve etiket operasyonları için hazır profil.",
    defaultCapabilities: expandBusinessCapabilities(uniqueCapabilities(
      CORE_BUSINESS_CAPABILITIES,
      STANDARD_CONNECTED_CAPABILITIES,
      RETAIL_CAPABILITIES
    ))
  }
};

export function normalizeBusinessType(value: string): BusinessType {
  return Object.prototype.hasOwnProperty.call(BUSINESS_PROFILES, value)
    ? value as BusinessType
    : "pension_restaurant";
}

export function getBusinessProfile(value: string): BusinessProfileDefinition {
  return BUSINESS_PROFILES[normalizeBusinessType(value)];
}

export function getBusinessProfiles(): BusinessProfileDefinition[] {
  return Object.values(BUSINESS_PROFILES);
}

export function hasBusinessCapability(
  capabilities: Iterable<BusinessCapability>,
  capability: BusinessCapability
): boolean {
  if (capabilities instanceof Set) return capabilities.has(capability);
  for (const current of capabilities) {
    if (current === capability) return true;
  }
  return false;
}
