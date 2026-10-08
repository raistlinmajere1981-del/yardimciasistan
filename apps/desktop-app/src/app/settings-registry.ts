import { BUSINESS_CAPABILITIES as C, isBusinessServiceAvailable, type BusinessCapability } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import { matchesCapabilityCondition, type CapabilityCondition } from "./capability-condition";

export type SettingsCategoryId = "business" | "operations" | "services" | "application";
export type StagedSettingsCategoryId = "business" | "services";
export interface SettingsCategoryDefinition { id: SettingsCategoryId; title: string; description: string }
export const settingsCategories: readonly SettingsCategoryDefinition[] = [
  { id: "business", title: "İşletme", description: "İşletme kimliği, sektör ve müşteriye açık bilgiler." },
  { id: "operations", title: "İşletme Düzeni", description: "Oda ve masa düzeni; müşteriye açık detaylar ve medya." },
  { id: "services", title: "Servisler", description: "Bağlantılar, eşitleme ve yardımcı servisler." },
  { id: "application", title: "Uygulama", description: "Görünüm tercihleri, güvenlik ve bakım işlemleri." }
];
export interface SettingsSectionDefinition {
  id: string;
  category: SettingsCategoryId;
  title: string;
  keywords: string;
  persistence: "staged" | "action" | "resource";
  condition?: CapabilityCondition;
  visible?: (capabilities: readonly BusinessCapability[], initialized: boolean) => boolean;
}

export function visibleSettingsCategories(initialized: boolean, snapshot?: BusinessCapabilitySnapshot | null) {
  return settingsCategories.filter(category => {
    if (!initialized) return category.id === "business";
    return category.id !== "operations" || settingsSections.some(section =>
      section.category === category.id
      && isSettingsSectionVisible(section, snapshot?.enabledCapabilities ?? [], initialized, snapshot)
    );
  });
}
export const layoutSettingsDefinition = {
  id: "settings-operations",
  category: "operations",
  title: "Masa yönetimi",
  keywords: "masa kategorileri salon bahçe kapasite sigara manzara detay medya fotoğraf video işletme düzeni",
  persistence: "resource",
  condition: { allOf: [C.FOOD_TABLES] },
  visible: (_, initialized) => initialized
} satisfies SettingsSectionDefinition;

export const roomSettingsDefinition = {
  id: "settings-rooms", category: "operations", title: "Oda Yönetimi",
  keywords: "oda adı varsayılan gecelik fiyat kapasite yatak detay medya fotoğraf video panorama",
  persistence: "resource", condition: { allOf: [C.ACCOMMODATION_ROOMS] },
  visible: (_, initialized) => initialized
} satisfies SettingsSectionDefinition;

export const dealerPortalDefinition = {
  id: "settings-dealer-portal", category: "services", title: "Bayi Web Erişimi",
  keywords: "bayi wholesale portal davet web erişimi", persistence: "staged",
  visible: (caps: readonly BusinessCapability[]) => isBusinessServiceAvailable("dealerPortal", caps)
} as const satisfies SettingsSectionDefinition;

export const onlineSalesDeliveryDefinition = {
  id: "settings-online-delivery", category: "services", title: "Teslimat ve Gönderim",
  keywords: "online satış bayi web sipariş işletmeden teslim pickup kargo shipping teslimat aras sağlayıcı bağlantı müşteri kodu şifre",
  persistence: "staged", visible: (caps: readonly BusinessCapability[]) => isBusinessServiceAvailable("delivery", caps)
} as const satisfies SettingsSectionDefinition;

export const whatsappCloudDefinition = {
  id: "settings-whatsapp-business", category: "services", title: "WhatsApp Business",
  keywords: "meta cloud business waba token şablon mesaj bağlantı", persistence: "staged",
  visible: (caps: readonly BusinessCapability[]) => isBusinessServiceAvailable("whatsappCloud", caps)
} as const satisfies SettingsSectionDefinition;

export const smsProviderDefinition = {
  id: "settings-marketing-sms", category: "services", title: "SMS / İleti Merkezi",
  keywords: "sms ileti merkezi api key hash başlık sender iys pazarlama bağlantı", persistence: "staged",
  visible: (caps: readonly BusinessCapability[]) => isBusinessServiceAvailable("sms", caps)
} as const satisfies SettingsSectionDefinition;
export const instagramProviderDefinition = {
  id: "settings-marketing-instagram", category: "services", title: "Instagram",
  keywords: "instagram profesyonel business creator token hesap yayın bağlantı", persistence: "staged",
  visible: (caps: readonly BusinessCapability[]) => isBusinessServiceAvailable("instagram", caps)
} as const satisfies SettingsSectionDefinition;

export const settingsSections: readonly SettingsSectionDefinition[] = [
  smsProviderDefinition, instagramProviderDefinition,
  { id: "settings-business", category: "business", title: "İşletme", keywords: "firma adı sektör tipi telefon whatsapp e-posta adres", persistence: "staged" },
  { id: "settings-options", category: "business", title: "Ek özellikler", keywords: "yetenek talepler oda masa rezervasyonları qr menü stok veresiye müşteri hesabı satın alma tedarikçi etiket", persistence: "staged" },
  { id: "settings-public-profile", category: "business", title: "Müşteriye Açık Bilgiler", keywords: "public profile harita gösterimi manuel google maps embed konum açıklama özellikler giriş çıkış kahvaltı dil ödeme", persistence: "resource", visible: (_, initialized) => initialized },
  { id: "settings-social-links", category: "business", title: "Sosyal Medya", keywords: "facebook instagram youtube tiktok x sosyal medya profil bağlantı link", persistence: "resource", visible: (_, initialized) => initialized },
  { id: "settings-google-reviews", category: "business", title: "Google Yorumları", keywords: "google places yorum değerlendirme puan place id api anahtarı", persistence: "resource", visible: (caps, initialized) => initialized && isBusinessServiceAvailable("googleReviews", caps) },
  layoutSettingsDefinition,
  onlineSalesDeliveryDefinition,
  dealerPortalDefinition,
  whatsappCloudDefinition,
  roomSettingsDefinition,
  { id: "settings-whatsapp", category: "services", title: "WhatsApp", keywords: "doğum günü mesaj saat otomatik manuel", persistence: "staged", visible: caps => isBusinessServiceAvailable("whatsapp", caps) },
  { id: "settings-android", category: "services", title: "Android", keywords: "companion yerel ağ local network telefon bağlantı", persistence: "staged", visible: caps => isBusinessServiceAvailable("android", caps) },
  { id: "settings-kbs", category: "services", title: "Kimlik Bildirim Sistemi", keywords: "kbs emniyet jandarma kimlik bildirim tesis kodu egmsec konaklayan", persistence: "resource", visible: (caps, initialized) => initialized && isBusinessServiceAvailable("kbs", caps) },
  { id: "settings-devices", category: "services", title: "Telefon Kurulumu", keywords: "android usb cihaz eşleme rol izin görev kur kaldır", persistence: "action", visible: (caps, initialized) => initialized && caps.includes(C.ANDROID) },
  { id: "settings-product-data", category: "services", title: "Ürün Verisi", keywords: "barkod open food facts sağlayıcı görseller otomatik ara", persistence: "staged", visible: caps => isBusinessServiceAvailable("productData", caps) },
  { id: "settings-web", category: "services", title: "Web Modülü", keywords: "eşitleme adres güvenlik anahtarı otomatik", persistence: "staged" },
  { id: "settings-web-test", category: "services", title: "Web Bağlantısını Dene", keywords: "bağlantı test", persistence: "action" },
  { id: "settings-ai", category: "services", title: "AI Yardımcı", keywords: "openai gemini google studio groq openrouter metin görsel üretim modeli otomatik api anahtarı zaman aşımı", persistence: "staged", visible: caps => isBusinessServiceAvailable("ai", caps) },
  { id: "settings-ai-test", category: "services", title: "AI Bağlantısını Dene", keywords: "model test", persistence: "action", visible: caps => isBusinessServiceAvailable("ai", caps) },
  { id: "settings-appearance", category: "application", title: "Görünüm", keywords: "renk düzeni tema sistem koyu açık yoğunluk ölçek vurgu yazı tipi hareket", persistence: "resource" },
  { id: "settings-updates", category: "application", title: "Güncelleme tercihleri", keywords: "sunucu otomatik kontrol", persistence: "resource", visible: (_, initialized) => initialized },
  { id: "settings-update-actions", category: "application", title: "Güncellemeler", keywords: "kontrol indir yeniden başlat", persistence: "action", visible: (_, initialized) => initialized },
  { id: "settings-password", category: "application", title: "Uygulama Şifresi", keywords: "parola güvenlik kilit sıfırla değiştir", persistence: "action" },
  { id: "settings-maintenance", category: "application", title: "Veri ve Yedekleme", keywords: "yedek oluştur geri yükle sil sıfırla", persistence: "action", visible: (_, initialized) => initialized }
];

export function isSettingsSectionVisible(
  section: SettingsSectionDefinition,
  configurationCapabilities: readonly BusinessCapability[],
  initialized: boolean,
  runtimeSnapshot?: BusinessCapabilitySnapshot | null
): boolean {
  if (section.condition && !matchesCapabilityCondition(runtimeSnapshot, section.condition)) return false;
  return !section.visible || section.visible(configurationCapabilities, initialized);
}

export function searchSettings(
  query: string,
  capabilities: readonly BusinessCapability[],
  initialized: boolean,
  runtimeSnapshot?: BusinessCapabilitySnapshot | null
) {
  const terms = query.trim().toLocaleLowerCase("tr-TR").split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return settingsSections.filter(section => {
    if (!isSettingsSectionVisible(section, capabilities, initialized, runtimeSnapshot)) return false;
    const category = settingsCategories.find(item => item.id === section.category)!;
    const text = `${category.title} ${section.title} ${section.keywords}`.toLocaleLowerCase("tr-TR");
    return terms.every(term => text.includes(term));
  });
}
