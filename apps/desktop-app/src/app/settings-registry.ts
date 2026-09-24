import { BUSINESS_CAPABILITIES as C, getBusinessProfileSelectionCapabilities, type BusinessCapability } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import { matchesCapabilityCondition, type CapabilityCondition } from "./capability-condition";
import type { SetupFormState } from "./setup-model";

export type SettingsCategoryId = "business" | "operations" | "services" | "application";
export type StagedSettingsCategoryId = "business" | "services";
export interface SettingsCategoryDefinition { id: SettingsCategoryId; title: string; description: string }
export const settingsCategories: readonly SettingsCategoryDefinition[] = [
  { id: "business", title: "İşletme", description: "İşletme kimliği, sektör ve müşteriye açık bilgiler." },
  { id: "operations", title: "İşletme Düzeni", description: "Oda ve masa düzeni; bağımsız oda profilleri." },
  { id: "services", title: "Servisler", description: "Bağlantılar, eşitleme ve yardımcı servisler." },
  { id: "application", title: "Uygulama", description: "Anında görünüm tercihleri, güvenlik ve bakım işlemleri." }
];
export interface SettingsSectionDefinition {
  id: string;
  category: SettingsCategoryId;
  title: string;
  keywords: string;
  persistence: "staged" | "immediate" | "action" | "resource";
  condition?: CapabilityCondition;
  visible?: (capabilities: readonly BusinessCapability[], initialized: boolean) => boolean;
}
export const layoutSettingsDefinition = {
  id: "settings-operations",
  category: "operations",
  title: "Masa kategorileri",
  keywords: "masa kategorileri salon bahçe işletme düzeni",
  persistence: "resource",
  visible: (caps: readonly BusinessCapability[]) => caps.includes(C.ACCOMMODATION_ROOMS) || caps.includes(C.FOOD_TABLES)
} satisfies SettingsSectionDefinition;

export const settingsSections: readonly SettingsSectionDefinition[] = [
  { id: "settings-business", category: "business", title: "İşletme", keywords: "firma adı sektör tipi telefon whatsapp e-posta adres", persistence: "staged" },
  { id: "settings-options", category: "business", title: "Ek özellikler", keywords: "yetenek talepler oda masa rezervasyonları qr menü stok veresiye müşteri hesabı satın alma tedarikçi etiket", persistence: "staged" },
  { id: "settings-public-profile", category: "business", title: "Müşteriye Açık Bilgiler", keywords: "public profile harita konum açıklama özellikler giriş çıkış kahvaltı dil ödeme", persistence: "resource", visible: (_, initialized) => initialized },
  layoutSettingsDefinition,
  { id: "settings-rooms", category: "operations", title: "Oda Yönetimi", keywords: "oda adı varsayılan gecelik fiyat kapasite yatak detay", persistence: "resource", visible: (caps, initialized) => initialized && caps.includes(C.ACCOMMODATION_ROOMS) },
  { id: "settings-whatsapp", category: "services", title: "WhatsApp", keywords: "doğum günü mesaj saat otomatik manuel", persistence: "staged" },
  { id: "settings-android", category: "services", title: "Android", keywords: "companion yerel ağ local network telefon bağlantı", persistence: "staged" },
  { id: "settings-devices", category: "services", title: "Telefon Kurulumu", keywords: "android usb cihaz eşleme rol izin görev kur kaldır", persistence: "action", visible: (caps, initialized) => initialized && caps.includes(C.ANDROID) },
  { id: "settings-product-data", category: "services", title: "Ürün Verisi", keywords: "barkod open food facts sağlayıcı görseller otomatik ara", persistence: "staged", visible: caps => caps.includes(C.CATALOG) },
  { id: "settings-web", category: "services", title: "Web Modülü", keywords: "eşitleme adres güvenlik anahtarı otomatik", persistence: "staged" },
  { id: "settings-web-test", category: "services", title: "Web Bağlantısını Dene", keywords: "bağlantı test", persistence: "action" },
  { id: "settings-ai", category: "services", title: "AI Yardımcı", keywords: "openai gemini google studio groq openrouter model api anahtarı zaman aşımı", persistence: "staged" },
  { id: "settings-ai-test", category: "services", title: "AI Bağlantısını Dene", keywords: "model test", persistence: "action" },
  { id: "settings-appearance", category: "application", title: "Görünüm", keywords: "renk düzeni tema sistem koyu açık yoğunluk ölçek vurgu yazı tipi hareket", persistence: "immediate" },
  { id: "settings-updates", category: "application", title: "Güncelleme tercihleri", keywords: "sunucu otomatik kontrol", persistence: "resource", visible: (_, initialized) => initialized },
  { id: "settings-update-actions", category: "application", title: "Güncellemeler", keywords: "kontrol indir yeniden başlat", persistence: "action", visible: (_, initialized) => initialized },
  { id: "settings-password", category: "application", title: "Uygulama Şifresi", keywords: "parola güvenlik kilit sıfırla değiştir", persistence: "action" },
  { id: "settings-maintenance", category: "application", title: "Veri ve Yedekleme", keywords: "yedek oluştur geri yükle sil sıfırla", persistence: "action", visible: (_, initialized) => initialized }
];

export function settingsCapabilities(form: SetupFormState): BusinessCapability[] {
  return [...getBusinessProfileSelectionCapabilities(form.profileId, form.profileOptions),
    ...(form.whatsappEnabled ? [C.WHATSAPP] : []), ...(form.androidEnabled ? [C.ANDROID] : []), ...(form.aiEnabled ? [C.AI] : [])];
}

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
