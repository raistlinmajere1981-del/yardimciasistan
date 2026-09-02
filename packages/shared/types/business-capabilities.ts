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

  RETAIL_BARCODE: "retail.barcode",
  RETAIL_PURCHASING: "retail.purchasing",
  RETAIL_SUPPLIERS: "retail.suppliers",
  RETAIL_LABELS: "retail.labels"
} as const;

export type BusinessCapability = typeof BUSINESS_CAPABILITIES[keyof typeof BUSINESS_CAPABILITIES];
export type BusinessProfileAvailability = "available" | "planned";

export interface BusinessProfileDefinition {
  id: BusinessType;
  label: string;
  description: string;
  availability: BusinessProfileAvailability;
  defaultCapabilities: BusinessCapability[];
}

export interface LegacyBusinessModuleFlags {
  rooms?: boolean;
  tables?: boolean;
  qrMenu?: boolean;
  qr_menu?: boolean;
  whatsapp?: boolean;
  android?: boolean;
  stock?: boolean;
}

export interface LegacyBusinessModuleDefaults {
  roomsEnabled: boolean;
  tablesEnabled: boolean;
  qrMenuEnabled: boolean;
  whatsappEnabled: boolean;
  androidEnabled: boolean;
}

const C = BUSINESS_CAPABILITIES;

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
  C.RETAIL_BARCODE,
  C.RETAIL_PURCHASING,
  C.RETAIL_SUPPLIERS,
  C.RETAIL_LABELS
];

function uniqueCapabilities(...groups: BusinessCapability[][]): BusinessCapability[] {
  return [...new Set(groups.flat())];
}

export const BUSINESS_PROFILES: Record<BusinessType, BusinessProfileDefinition> = {
  pension_restaurant: {
    id: "pension_restaurant",
    label: "Pansiyon + Restoran/Kafe",
    description: "Konaklama ve yiyecek-içecek operasyonları aynı işletme omurgasında çalışır.",
    availability: "available",
    defaultCapabilities: uniqueCapabilities(
      CORE_BUSINESS_CAPABILITIES,
      STANDARD_CONNECTED_CAPABILITIES,
      ACCOMMODATION_CAPABILITIES,
      FOOD_SERVICE_CAPABILITIES
    )
  },
  pension: {
    id: "pension",
    label: "Pansiyon",
    description: "Konaklama, müşteri, finans, web ve saha operasyonları için hazır profil.",
    availability: "available",
    defaultCapabilities: uniqueCapabilities(
      CORE_BUSINESS_CAPABILITIES,
      STANDARD_CONNECTED_CAPABILITIES,
      ACCOMMODATION_CAPABILITIES
    )
  },
  restaurant: {
    id: "restaurant",
    label: "Restoran",
    description: "Masa, sipariş, menü, stok, satış ve saha operasyonları için hazır profil.",
    availability: "available",
    defaultCapabilities: uniqueCapabilities(
      CORE_BUSINESS_CAPABILITIES,
      STANDARD_CONNECTED_CAPABILITIES,
      FOOD_SERVICE_CAPABILITIES
    )
  },
  cafe: {
    id: "cafe",
    label: "Kafe",
    description: "Restoran profilinin daha hafif kullanım biçimi; aynı yiyecek-içecek yeteneklerini kullanır.",
    availability: "available",
    defaultCapabilities: uniqueCapabilities(
      CORE_BUSINESS_CAPABILITIES,
      STANDARD_CONNECTED_CAPABILITIES,
      FOOD_SERVICE_CAPABILITIES
    )
  },
  market: {
    id: "market",
    label: "Market / Perakende",
    description: "Ürün, barkod, stok, hızlı satış, tedarikçi ve etiket operasyonları için planlanan profil.",
    availability: "planned",
    defaultCapabilities: uniqueCapabilities(
      CORE_BUSINESS_CAPABILITIES,
      STANDARD_CONNECTED_CAPABILITIES,
      RETAIL_CAPABILITIES
    )
  },
  other: {
    id: "other",
    label: "Genel İşletme",
    description: "Yalnız ortak işletme çekirdeğiyle başlayan, yeteneklerin sonradan eklendiği profil.",
    availability: "planned",
    defaultCapabilities: [...CORE_BUSINESS_CAPABILITIES]
  }
};

export function normalizeBusinessType(value: string): BusinessType {
  return Object.prototype.hasOwnProperty.call(BUSINESS_PROFILES, value)
    ? value as BusinessType
    : "other";
}

export function getBusinessProfile(value: string): BusinessProfileDefinition {
  return BUSINESS_PROFILES[normalizeBusinessType(value)];
}

export function getAvailableBusinessProfiles(): BusinessProfileDefinition[] {
  return Object.values(BUSINESS_PROFILES).filter((profile) => profile.availability === "available");
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

export function legacyModuleDefaultsForProfile(businessType: string): LegacyBusinessModuleDefaults {
  const capabilities = getBusinessProfile(businessType).defaultCapabilities;
  return {
    roomsEnabled: hasBusinessCapability(capabilities, C.ACCOMMODATION_ROOMS),
    tablesEnabled: hasBusinessCapability(capabilities, C.FOOD_TABLES),
    qrMenuEnabled: hasBusinessCapability(capabilities, C.QR_MENU),
    whatsappEnabled: hasBusinessCapability(capabilities, C.WHATSAPP),
    androidEnabled: hasBusinessCapability(capabilities, C.ANDROID)
  };
}

/**
 * Transitional adapter for installations that still persist rooms/tables/etc.
 * The rest of the application can depend on capabilities now, while storage
 * can be migrated independently later.
 */
export function resolveBusinessCapabilities(input: {
  businessType: string;
  modules?: LegacyBusinessModuleFlags;
  aiEnabled?: boolean;
}): BusinessCapability[] {
  const modules = input.modules ?? {};
  const resolved = new Set<BusinessCapability>(CORE_BUSINESS_CAPABILITIES);

  if (modules.rooms) {
    ACCOMMODATION_CAPABILITIES.forEach((capability) => resolved.add(capability));
  }
  if (modules.tables) {
    [C.FOOD_TABLES, C.FOOD_RESERVATIONS, C.FOOD_ORDERS, C.SALES].forEach((capability) => resolved.add(capability));
  }
  if (modules.qrMenu || modules.qr_menu) {
    [C.FOOD_MENU, C.QR_MENU, C.CATALOG, C.INVENTORY].forEach((capability) => resolved.add(capability));
  }
  if (modules.stock) {
    [C.CATALOG, C.INVENTORY].forEach((capability) => resolved.add(capability));
  }
  if (modules.whatsapp) resolved.add(C.WHATSAPP);
  if (modules.android) resolved.add(C.ANDROID);
  if (input.aiEnabled) resolved.add(C.AI);

  // Market is the first profile that cannot be represented by the legacy
  // room/table flags. Until capability persistence lands, make the domain
  // semantics available from the profile id itself.
  if (normalizeBusinessType(input.businessType) === "market") {
    RETAIL_CAPABILITIES.forEach((capability) => resolved.add(capability));
  }

  return [...resolved];
}
