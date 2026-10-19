import { ui } from "./site-language";
export type BusinessProfileId = "pension_restaurant" | "pension" | "restaurant" | "market";
export type PublicSurface = "accommodation" | "food_service" | "menu" | "qr_menu" | "catalog" | "directions";
export type WidgetRequestType = "pension_reservation" | "restaurant_reservation" | "general_info";

export interface WidgetConfig {
  businessName: string;
  whatsappPhone: string;
  apiBaseUrl: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  profileId: BusinessProfileId | "";
  publicSurfaces: PublicSurface[];
  aiEnabled: boolean;
  whatsappEnabled: boolean;
  requestsEnabled: boolean;
  address: string;
  mapUrl: string;
}

export function readScriptConfig(): Partial<WidgetConfig> {
  const script = document.currentScript as HTMLScriptElement | null;
  const dataset = script?.dataset ?? {};
  const scriptConfig = removeEmptyValues({
    ...(dataset.businessName === undefined ? {} : { businessName: dataset.businessName }),
    ...(dataset.whatsappPhone === undefined ? {} : { whatsappPhone: dataset.whatsappPhone }),
    ...(dataset.apiBaseUrl === undefined ? {} : { apiBaseUrl: dataset.apiBaseUrl }),
    ...(dataset.logoUrl === undefined ? {} : { logoUrl: dataset.logoUrl }),
    ...(dataset.primaryColor === undefined ? {} : { primaryColor: dataset.primaryColor }),
    ...(dataset.accentColor === undefined ? {} : { accentColor: dataset.accentColor }),
    ...(dataset.address === undefined ? {} : { address: dataset.address }),
    ...(dataset.mapUrl === undefined ? {} : { mapUrl: dataset.mapUrl })
  });
  const profileId = normalizeBusinessProfileId(dataset.profileId);
  if (profileId) {
    scriptConfig.profileId = profileId;
  }
  if (dataset.aiEnabled === "true" || dataset.aiEnabled === "false") {
    scriptConfig.aiEnabled = dataset.aiEnabled === "true";
  }
  if (dataset.whatsappEnabled === "true" || dataset.whatsappEnabled === "false") {
    scriptConfig.whatsappEnabled = dataset.whatsappEnabled === "true";
  }
  return scriptConfig;
}

function removeEmptyValues(values: Partial<WidgetConfig>): Partial<WidgetConfig> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => typeof value === "string" && value.length > 0)
  );
}

export function normalizeBusinessProfileId(value: unknown): BusinessProfileId | "" {
  const profileId = String(value ?? "").trim();
  return ["pension_restaurant", "pension", "restaurant", "market"].includes(profileId)
    ? profileId as BusinessProfileId
    : "";
}

export function normalizePublicSurfaces(value: unknown): PublicSurface[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<PublicSurface>([
    "accommodation",
    "food_service",
    "menu",
    "qr_menu",
    "catalog",
    "directions"
  ]);
  return [...new Set(
    value
      .map((item) => String(item ?? "").trim() as PublicSurface)
      .filter((item) => allowed.has(item))
  )];
}

export function resolvePublicSurfaces(config: Pick<WidgetConfig, "profileId" | "publicSurfaces">): ReadonlySet<PublicSurface> {
  const configured = normalizePublicSurfaces(config.publicSurfaces);
  return new Set(configured.length > 0 ? configured : profilePublicSurfaces(config.profileId));
}

export function isWhatsAppAvailable(config: Pick<WidgetConfig, "whatsappEnabled" | "whatsappPhone">): boolean {
  return config.whatsappEnabled && config.whatsappPhone.trim() !== "";
}

export function isRequestTypeAvailable(
  config: Pick<WidgetConfig, "requestsEnabled" | "profileId" | "publicSurfaces">,
  requestType: WidgetRequestType
): boolean {
  if (!config.requestsEnabled) return false;
  const surfaces = resolvePublicSurfaces(config);
  if (requestType === "pension_reservation") return surfaces.has("accommodation");
  if (requestType === "restaurant_reservation") return surfaces.has("food_service");
  return true;
}

export function buildInfoSuggestions(config: Pick<WidgetConfig, "profileId" | "publicSurfaces">): string[] {
  const surfaces = resolvePublicSurfaces(config);
  const suggestions: string[] = [];
  if (surfaces.has("accommodation")) {
    suggestions.push(ui("Oda fiyatları"), ui("Oda müsaitliği"), ui("Kahvaltı saatleri"));
  }
  if (surfaces.has("food_service")) {
    suggestions.push(ui("Masa var mı?"), ui("Menü hakkında bilgi"), ui("Çocuklar için uygun mu?"));
  }
  if (surfaces.has("catalog")) {
    suggestions.push(ui("Ürün stokta mı?"), ui("Ürün fiyatı"), ui("Çalışma saatleri"));
  }
  if (surfaces.has("directions")) {
    suggestions.push(ui("Konum ve yol tarifi"));
  }
  if (suggestions.length === 0) {
    suggestions.push(ui("Çalışma saatleri"), ui("İletişim"), ui("Konum"));
  }
  return [...new Set(suggestions)].slice(0, 6);
}

export function buildWhatsAppTopics(
  config: Pick<WidgetConfig, "businessName" | "profileId" | "publicSurfaces">
): Array<{ key: string; label: string; message: string }> {
  const surfaces = resolvePublicSurfaces(config);
  const topics: Array<{ key: string; label: string; message: string }> = [];
  if (surfaces.has("accommodation")) {
    topics.push({
      key: "reservation",
      label: ui("Rezervasyon soracağım"),
      message: ui("Merhaba, {0} için oda müsaitliği ve rezervasyon hakkında bilgi almak istiyorum.", {0: config.businessName})
    });
  }
  if (surfaces.has("food_service")) {
    topics.push({
      key: "table",
      label: ui("Masa soracağım"),
      message: ui("Merhaba, {0} için masa müsaitliği hakkında bilgi almak istiyorum.", {0: config.businessName})
    });
  }
  if (surfaces.has("menu")) {
    topics.push({
      key: "menu",
      label: ui("Menü hakkında soracağım"),
      message: ui("Merhaba, {0} menüsü hakkında bilgi almak istiyorum.", {0: config.businessName})
    });
  }
  if (surfaces.has("catalog")) {
    topics.push({
      key: "product",
      label: ui("Ürün / stok soracağım"),
      message: ui("Merhaba, {0} için ürün ve stok bilgisi almak istiyorum.", {0: config.businessName})
    });
  }
  topics.push({ key: "custom", label: ui("Kendi mesajımı yazacağım"), message: "" });
  return topics;
}

function profilePublicSurfaces(profileId: BusinessProfileId | ""): PublicSurface[] {
  if (profileId === "pension_restaurant") return ["accommodation", "food_service", "menu", "qr_menu", "directions"];
  if (profileId === "pension") return ["accommodation", "directions"];
  if (profileId === "restaurant") return ["food_service", "menu", "qr_menu", "directions"];
  if (profileId === "market") return ["catalog", "directions"];
  return [];
}
