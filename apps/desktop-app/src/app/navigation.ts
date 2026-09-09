import {
  BedDouble,
  CalendarDays,
  Home,
  Menu as MenuIcon,
  MessageCircle,
  Settings,
  Store,
  Users,
  UtensilsCrossed,
  WalletCards,
  type LucideIcon
} from "lucide-react";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import { runtimeHasCapability } from "./capabilities";

export type DesktopPage = "dashboard" | "customerWork" | "calendar" | "pension" | "restaurant" | "market" | "menu" | "messages" | "reports" | "settings";

export interface NavigationItem {
  id: DesktopPage;
  label: string;
  icon: LucideIcon;
}

const baseItems: NavigationItem[] = [
  { id: "dashboard", label: "Ana Ekran", icon: Home }
];

function hasRetailWorkspaceCapability(
  capabilities: BusinessCapabilitySnapshot | null | undefined
): boolean {
  const C = BUSINESS_CAPABILITIES;
  return [C.RETAIL_BARCODE, C.RETAIL_PURCHASING, C.RETAIL_SUPPLIERS, C.RETAIL_LABELS]
    .some((capability) => runtimeHasCapability(capabilities, capability));
}

export function buildNavigation(capabilities: BusinessCapabilitySnapshot | null | undefined): NavigationItem[] {
  const items = [...baseItems];
  const C = BUSINESS_CAPABILITIES;
  const customersEnabled = runtimeHasCapability(capabilities, C.CUSTOMERS);

  if (customersEnabled) {
    items.push({ id: "customerWork", label: "Müşteri İşleri", icon: Users });
  }

  if (runtimeHasCapability(capabilities, C.CALENDAR)) {
    items.push({ id: "calendar", label: "Takvim", icon: CalendarDays });
  }

  if (runtimeHasCapability(capabilities, C.ACCOMMODATION_ROOMS)) {
    items.push({ id: "pension", label: "Pansiyon", icon: BedDouble });
  }

  if (runtimeHasCapability(capabilities, C.FOOD_TABLES)) {
    items.push({ id: "restaurant", label: "Restoran", icon: UtensilsCrossed });
  }

  if (hasRetailWorkspaceCapability(capabilities)) {
    items.push({ id: "market", label: "Market", icon: Store });
  }

  if (runtimeHasCapability(capabilities, C.FOOD_MENU)) {
    items.push({ id: "menu", label: "Menü", icon: MenuIcon });
  }

  if ((customersEnabled && runtimeHasCapability(capabilities, C.WHATSAPP))
      || runtimeHasCapability(capabilities, C.AI)) {
    items.push({ id: "messages", label: "Mesajlar", icon: MessageCircle });
  }

  const financeEnabled = runtimeHasCapability(capabilities, C.FINANCE);
  const reportsEnabled = runtimeHasCapability(capabilities, C.REPORTS);
  if (financeEnabled || reportsEnabled) {
    items.push({ id: "reports", label: financeEnabled ? "Kasa" : "Raporlar", icon: WalletCards });
  }
  items.push({ id: "settings", label: "Ayarlar", icon: Settings });
  return items;
}

export function getPageMeta(page: DesktopPage, capabilities?: BusinessCapabilitySnapshot | null) {
  const customersEnabled = runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.CUSTOMERS);
  const tasksEnabled = runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.TASKS);
  const aiEnabled = runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.AI);
  const reservationsEnabled = runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS)
    || runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.FOOD_RESERVATIONS);
  const whatsappEnabled = customersEnabled
    && runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.WHATSAPP);
  const qrMenuEnabled = runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.QR_MENU);
  const accommodationFolioEnabled = runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO);
  const accommodationReservationsEnabled = runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS);
  const foodReservationsEnabled = runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.FOOD_RESERVATIONS);
  const foodOrdersEnabled = runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.FOOD_ORDERS);
  const financeEnabled = runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.FINANCE);
  const reportsEnabled = runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.REPORTS);
  const dashboardTopics = [
    customersEnabled ? "yeni talepler" : "",
    tasksEnabled ? "günlük işler" : "",
    reservationsEnabled ? "bekleyen rezervasyonlar" : ""
  ].filter(Boolean);
  const restaurantTopics = [
    "masa durumlarını",
    foodReservationsEnabled ? "rezervasyonları" : "",
    foodOrdersEnabled ? "siparişleri" : "",
    tasksEnabled ? "servis işlerini" : ""
  ].filter(Boolean);
  const marketTopics = [
    runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.CATALOG) ? "ürünleri" : "",
    runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.INVENTORY) ? "stokları" : "",
    runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.SALES) ? "satışları" : "",
    runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.RETAIL_PURCHASING)
      || runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.RETAIL_SUPPLIERS) ? "tedariki" : "",
    runtimeHasCapability(capabilities, BUSINESS_CAPABILITIES.RETAIL_LABELS) ? "etiketleri" : ""
  ].filter(Boolean);
  const meta: Record<DesktopPage, { eyebrow: string; title: string; description: string }> = {
    dashboard: { eyebrow: "Günlük özet", title: "Bugün ne var?", description: dashboardTopics.length > 0 ? `${dashboardTopics.join(", ")} ve işletme durumunuz.` : "Etkin işletme operasyonlarının özeti." },
    customerWork: { eyebrow: "Müşteri operasyonu", title: "Müşteri İşleri", description: "Talepleri, müşterileri ve bekleyen yanıtları yönetin." },
    calendar: { eyebrow: "Operasyon planı", title: "Takvim", description: reservationsEnabled && tasksEnabled ? "Etkin rezervasyon alanlarını ve günlük işleri gün veya hafta bazında görün." : reservationsEnabled ? "Etkin rezervasyon alanlarını gün veya hafta bazında görün." : tasksEnabled ? "Günlük işleri gün veya hafta bazında görün." : "Etkin takvim alanlarını gün veya hafta bazında görün." },
    pension: { eyebrow: "Konaklama", title: "Pansiyon", description: accommodationReservationsEnabled && tasksEnabled ? "Rezervasyonları, odaları ve günlük işleri izleyin." : accommodationReservationsEnabled ? "Rezervasyonları ve odaları izleyin." : tasksEnabled ? "Odaları ve günlük işleri izleyin." : "Odaların güncel durumunu izleyin." },
    restaurant: { eyebrow: "Servis", title: "Restoran", description: `${restaurantTopics.join(", ")} takip edin.` },
    market: { eyebrow: "Perakende operasyonu", title: "Market", description: marketTopics.length > 0 ? `${marketTopics.join(", ")} tek çalışma alanında yönetin.` : "Etkin perakende araçlarını tek çalışma alanında yönetin." },
    menu: { eyebrow: "İçerik", title: "Menü", description: qrMenuEnabled ? "Kategori ve ürünleri düzenleyip web menüsünü yayınlayın." : "Kategori ve ürünleri yerel menünüz için düzenleyin." },
    messages: {
      eyebrow: "Mesaj merkezi",
      title: "Mesajlar",
      description: whatsappEnabled
        ? "Hazır yanıtları ve WhatsApp görüşmelerini yönetin."
        : aiEnabled && customersEnabled
          ? "AI ile müşteri yanıtları ve günlük değerlendirmeler hazırlayın."
          : "AI ile günlük işletme değerlendirmeleri hazırlayın."
    },
    reports: {
      eyebrow: financeEnabled ? "Günlük para takibi" : "İşletme analizi",
      title: financeEnabled ? "Kasa" : "Raporlar",
      description: financeEnabled && reportsEnabled
        ? (accommodationFolioEnabled
            ? "Para giriş çıkışını, bekleyen oda alacaklarını ve işletme raporlarını takip edin."
            : "Para giriş çıkışını ve işletme raporlarını takip edin.")
        : financeEnabled
          ? (accommodationFolioEnabled
              ? "Bugünün para giriş çıkışını ve bekleyen oda alacaklarını takip edin."
              : "Bugünün para giriş çıkışını takip edin.")
          : "İşletme operasyonlarının dönemsel sonuçlarını takip edin."
    },
    settings: { eyebrow: "Yapılandırma", title: "Ayarlar", description: "İşletme, görünüm ve bağlantı tercihlerini düzenleyin." }
  };

  return meta[page];
}
