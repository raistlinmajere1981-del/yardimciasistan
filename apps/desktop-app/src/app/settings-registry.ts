import { BUSINESS_CAPABILITIES as C, isBusinessServiceAvailable, type BusinessCapability } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import { matchesCapabilityCondition, type CapabilityCondition } from "./capability-condition";

export type SettingsCategoryId = "business" | "services";
export type StagedSettingsCategoryId = "business" | "services";
export interface SettingsCategoryDefinition { id: SettingsCategoryId; title: string; description: string }
export const settingsCategories: readonly SettingsCategoryDefinition[] = [
  { id: "business", title: "İşletme", description: "İşletme kimliği, sektör ve müşteriye açık bilgiler." },
  { id: "services", title: "Servisler", description: "Bağlantılar, eşitleme ve yardımcı servisler." }
];
export interface SettingsSectionDefinition {
  id: string;
  category: SettingsCategoryId;
  title: string;
  keywords: string;
  persistence: "staged" | "action" | "resource";
  condition?: CapabilityCondition;
  placement?: "global";
  serviceTarget?: string;
  visible?: (capabilities: readonly BusinessCapability[], initialized: boolean) => boolean;
}

export const layoutSettingsDefinition = {
  id: "settings-tables-button",
  category: "business",
  title: "Masa Yönetimi",
  keywords: "masa kategorileri salon bahçe kapasite sigara manzara detay medya fotoğraf video işletme düzeni",
  persistence: "resource",
  condition: { allOf: [C.FOOD_TABLES] },
  visible: (_, initialized) => initialized
} satisfies SettingsSectionDefinition;

export const roomSettingsDefinition = {
  id: "settings-rooms-button", category: "business", title: "Oda Yönetimi",
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
  { id: "settings-speech", category: "services", title: "Metin Seslendirme", keywords: "ses tts konuşma yerel sistem dil hız ton volume", persistence: "resource", visible: (_, initialized) => initialized },
  { id: "settings-dictation", category: "services", title: "Konuşmadan Metne", keywords: "stt masaüstü dikte mikrofon ses model bağlantı testi", persistence: "resource", visible: (_, initialized) => initialized },
  smsProviderDefinition, instagramProviderDefinition,
  { id: "settings-business", category: "business", title: "İşletme Yapısı ve Özellikler", keywords: "sektör tipi", persistence: "staged" },
  { id: "settings-options", category: "business", title: "Ek özellikler", keywords: "yetenek talepler oda masa rezervasyonları qr menü stok veresiye müşteri hesabı satın alma tedarikçi etiket", persistence: "staged" },
  { id: "settings-public-profile", category: "business", title: "İşletme Bilgileri", keywords: "firma adı telefon whatsapp e-posta adres public profile harita gösterimi manuel google maps embed konum açıklama özellikler giriş çıkış kahvaltı dil ödeme", persistence: "resource" },
  { id: "settings-social-links", category: "business", title: "Sosyal Medya", keywords: "facebook instagram youtube tiktok x sosyal medya profil bağlantı link", persistence: "resource", visible: (_, initialized) => initialized },
  { id: "settings-google-reviews", category: "services", title: "Google Yorumları", keywords: "google places yorum değerlendirme puan place id api anahtarı", persistence: "resource", visible: (caps, initialized) => initialized && isBusinessServiceAvailable("googleReviews", caps) },
  layoutSettingsDefinition,
  onlineSalesDeliveryDefinition,
  dealerPortalDefinition,
  whatsappCloudDefinition,
  roomSettingsDefinition,
  { id: "settings-whatsapp", category: "services", title: "WhatsApp", keywords: "doğum günü mesaj saat otomatik manuel", persistence: "staged", visible: caps => isBusinessServiceAvailable("whatsapp", caps) },
  { id: "settings-android", category: "services", title: "Android", keywords: "companion yerel ağ local network telefon bağlantı", persistence: "staged", visible: caps => isBusinessServiceAvailable("android", caps) },
  { id: "settings-kbs", category: "services", title: "Kimlik Bildirim Sistemi", keywords: "kbs emniyet jandarma kimlik bildirim tesis kodu egmsec konaklayan", persistence: "resource", visible: (caps, initialized) => initialized && isBusinessServiceAvailable("kbs", caps) },
  { id: "settings-devices", category: "services", serviceTarget: "settings-android", title: "Telefon Kurulumu", keywords: "android usb cihaz eşleme rol izin görev kur kaldır", persistence: "action", visible: (caps, initialized) => initialized && isBusinessServiceAvailable("android", caps) && caps.includes(C.ANDROID) },
  { id: "settings-product-data", category: "services", title: "Ürün Verisi", keywords: "barkod open food facts sağlayıcı görseller otomatik ara", persistence: "staged", visible: caps => isBusinessServiceAvailable("productData", caps) },
  { id: "settings-web", category: "services", placement: "global", title: "Web Bağlantısı", keywords: "website web modülü eşitleme adres güvenlik anahtarı otomatik bağlantı test dene", persistence: "action" },
  { id: "settings-ai", category: "services", title: "AI Yardımcı", keywords: "openai gemini google studio groq openrouter cloudflare workers account token metin görsel analiz üretim modeli konuşma tanıma stt whisper api anahtarı zaman aşımı", persistence: "staged", visible: caps => isBusinessServiceAvailable("ai", caps) },
  { id: "settings-ai-test", category: "services", serviceTarget: "settings-ai", title: "AI Bağlantısını Dene", keywords: "model test", persistence: "action", visible: caps => isBusinessServiceAvailable("ai", caps) },
  { id: "settings-security-button", category: "business", placement: "global", title: "Uygulama Şifresi", keywords: "parola güvenlik kilit sıfırla değiştir", persistence: "action" },
  { id: "settings-data-button", category: "business", placement: "global", title: "Veri ve Yedekleme", keywords: "yedek oluştur geri yükle sil sıfırla", persistence: "action" }
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
  const normalize = (text: string) => text.toLocaleLowerCase("tr-TR").replaceAll("ı", "i");
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return settingsSections.filter(section => {
    if (!isSettingsSectionVisible(section, capabilities, initialized, runtimeSnapshot)) return false;
    const category = settingsCategories.find(item => item.id === section.category)!;
    const text = normalize(`${category.title} ${section.title} ${section.keywords}`);
    return terms.every(term => text.includes(term));
  });
}
