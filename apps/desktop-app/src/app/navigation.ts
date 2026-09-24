import {
  CalendarDays,
  Home,
  Menu as MenuIcon,
  MessageCircle,
  Settings,
  Store,
  Users,
  WalletCards,
  type LucideIcon
} from "lucide-react";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import { pensionNavigationContribution } from "../components/pension/pension-navigation";
import { restaurantNavigationContribution } from "../components/restaurant/restaurant-navigation";
import { runtimeHasCapability } from "./capabilities";
import { matchesCapabilityCondition, type CapabilityCondition } from "./capability-condition";

export type DesktopPage = "dashboard" | "customerWork" | "calendar" | "pension" | "restaurant" | "market" | "menu" | "messages" | "reports" | "settings";

export interface NavigationItem {
  id: DesktopPage;
  label: string;
  icon: LucideIcon;
}

export interface NavigationPresentation {
  label: string;
  eyebrow: string;
  title: string;
  description: string;
}

export interface NavigationContribution {
  pageId: DesktopPage;
  icon: LucideIcon;
  order: number;
  condition?: CapabilityCondition;
  presentation: NavigationPresentation | ((capabilities: BusinessCapabilitySnapshot | null | undefined) => NavigationPresentation);
  contentScroll: "page" | "workspace";
}

const dashboardContribution = {
  pageId: "dashboard",
  icon: Home,
  order: 0,
  contentScroll: "page",
  presentation: (capabilities) => {
    const topics = [
      runtimeHasCapability(capabilities, C.REQUESTS) ? "yeni talepler" : "",
      runtimeHasCapability(capabilities, C.TASKS) ? "günlük işler" : "",
      runtimeHasCapability(capabilities, C.ACCOMMODATION_RESERVATIONS)
        || runtimeHasCapability(capabilities, C.FOOD_RESERVATIONS) ? "bekleyen rezervasyonlar" : ""
    ].filter(Boolean);
    return {
      label: "Ana Ekran",
      eyebrow: "Günlük özet",
      title: "Bugün ne var?",
      description: topics.length > 0 ? `${topics.join(", ")} ve işletme durumunuz.` : "Etkin işletme operasyonlarının özeti."
    };
  }
} satisfies NavigationContribution;

const customerWorkContribution = {
  pageId: "customerWork",
  icon: Users,
  order: 10,
  condition: { allOf: [C.CUSTOMERS] },
  contentScroll: "workspace",
  presentation: (capabilities) => ({
    label: "Müşteri İşleri",
    eyebrow: "Müşteri operasyonu",
    title: "Müşteri İşleri",
    description: runtimeHasCapability(capabilities, C.REQUESTS)
      ? "Talepleri ve müşteri kayıtlarını yönetin."
      : "Müşteri kayıtlarını yönetin."
  })
} satisfies NavigationContribution;

const calendarContribution = {
  pageId: "calendar",
  icon: CalendarDays,
  order: 20,
  condition: { allOf: [C.CALENDAR] },
  contentScroll: "page",
  presentation: (capabilities) => {
    const reservationsEnabled = runtimeHasCapability(capabilities, C.ACCOMMODATION_RESERVATIONS)
      || runtimeHasCapability(capabilities, C.FOOD_RESERVATIONS);
    const tasksEnabled = runtimeHasCapability(capabilities, C.TASKS);
    return {
      label: "Takvim",
      eyebrow: "Operasyon planı",
      title: "Takvim",
      description: reservationsEnabled && tasksEnabled
        ? "Etkin rezervasyon alanlarını ve günlük işleri gün veya hafta bazında görün."
        : reservationsEnabled
          ? "Etkin rezervasyon alanlarını gün veya hafta bazında görün."
          : tasksEnabled
            ? "Günlük işleri gün veya hafta bazında görün."
            : "Etkin takvim alanlarını gün veya hafta bazında görün."
    };
  }
} satisfies NavigationContribution;

const marketContribution = {
  pageId: "market",
  icon: Store,
  order: 50,
  condition: { anyOf: [C.RETAIL_BARCODE, C.RETAIL_PURCHASING, C.RETAIL_SUPPLIERS, C.RETAIL_LABELS] },
  contentScroll: "page",
  presentation: (capabilities) => {
    const topics = [
      runtimeHasCapability(capabilities, C.CATALOG) ? "ürünleri" : "",
      runtimeHasCapability(capabilities, C.INVENTORY) ? "stokları" : "",
      runtimeHasCapability(capabilities, C.SALES) ? "satışları" : "",
      runtimeHasCapability(capabilities, C.RETAIL_PURCHASING)
        || runtimeHasCapability(capabilities, C.RETAIL_SUPPLIERS) ? "tedariki" : "",
      runtimeHasCapability(capabilities, C.RETAIL_LABELS) ? "etiketleri" : ""
    ].filter(Boolean);
    return {
      label: "Market",
      eyebrow: "Perakende operasyonu",
      title: "Market",
      description: topics.length > 0 ? `${topics.join(", ")} tek çalışma alanında yönetin.` : "Etkin perakende araçlarını tek çalışma alanında yönetin."
    };
  }
} satisfies NavigationContribution;

const menuContribution = {
  pageId: "menu",
  icon: MenuIcon,
  order: 60,
  condition: { allOf: [C.FOOD_MENU] },
  contentScroll: "workspace",
  presentation: (capabilities) => ({
    label: "Menü",
    eyebrow: "İçerik",
    title: "Menü",
    description: runtimeHasCapability(capabilities, C.QR_MENU)
      ? "Kategori ve ürünleri düzenleyip web menüsünü yayınlayın."
      : "Kategori ve ürünleri yerel menünüz için düzenleyin."
  })
} satisfies NavigationContribution;

const messagesContribution = {
  pageId: "messages",
  icon: MessageCircle,
  order: 70,
  condition: { anyOf: [C.AI, { allOf: [C.CUSTOMERS, C.WHATSAPP] }] },
  contentScroll: "page",
  presentation: (capabilities) => {
    const customersEnabled = runtimeHasCapability(capabilities, C.CUSTOMERS);
    const whatsappEnabled = customersEnabled && runtimeHasCapability(capabilities, C.WHATSAPP);
    const aiEnabled = runtimeHasCapability(capabilities, C.AI);
    return {
      label: "Mesajlar",
      eyebrow: "Mesaj merkezi",
      title: "Mesajlar",
      description: whatsappEnabled
        ? "Hazır yanıtları ve WhatsApp görüşmelerini yönetin."
        : aiEnabled && customersEnabled
          ? "AI ile müşteri yanıtları ve günlük değerlendirmeler hazırlayın."
          : "AI ile günlük işletme değerlendirmeleri hazırlayın."
    };
  }
} satisfies NavigationContribution;

const reportsContribution = {
  pageId: "reports",
  icon: WalletCards,
  order: 80,
  condition: { anyOf: [C.FINANCE, C.REPORTS] },
  contentScroll: "page",
  presentation: (capabilities) => {
    const financeEnabled = runtimeHasCapability(capabilities, C.FINANCE);
    const reportsEnabled = runtimeHasCapability(capabilities, C.REPORTS);
    const accommodationFolioEnabled = runtimeHasCapability(capabilities, C.ACCOMMODATION_FOLIO);
    return {
      label: financeEnabled ? "Kasa" : "Raporlar",
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
    };
  }
} satisfies NavigationContribution;

const settingsContribution = {
  pageId: "settings",
  icon: Settings,
  order: 90,
  contentScroll: "workspace",
  presentation: {
    label: "Ayarlar",
    eyebrow: "Yapılandırma",
    title: "Ayarlar",
    description: "İşletme, görünüm ve bağlantı tercihlerini düzenleyin."
  }
} satisfies NavigationContribution;

export const navigationContributions = [
  dashboardContribution,
  customerWorkContribution,
  calendarContribution,
  pensionNavigationContribution,
  restaurantNavigationContribution,
  marketContribution,
  menuContribution,
  messagesContribution,
  reportsContribution,
  settingsContribution
] as const satisfies readonly NavigationContribution[];

function resolvePresentation(
  contribution: NavigationContribution,
  capabilities: BusinessCapabilitySnapshot | null | undefined
): NavigationPresentation {
  return typeof contribution.presentation === "function"
    ? contribution.presentation(capabilities)
    : contribution.presentation;
}

export function buildNavigationFromContributions(
  capabilities: BusinessCapabilitySnapshot | null | undefined,
  contributions: readonly NavigationContribution[]
): NavigationItem[] {
  return contributions
    .filter((contribution) => matchesCapabilityCondition(capabilities, contribution.condition))
    .toSorted((left, right) => left.order - right.order)
    .map((contribution) => {
      const presentation = resolvePresentation(contribution, capabilities);
      return { id: contribution.pageId, label: presentation.label, icon: contribution.icon };
    });
}

export function buildNavigation(capabilities: BusinessCapabilitySnapshot | null | undefined): NavigationItem[] {
  return buildNavigationFromContributions(capabilities, navigationContributions);
}

export function getPageMeta(page: DesktopPage, capabilities?: BusinessCapabilitySnapshot | null) {
  const contribution = navigationContributions.find((item) => item.pageId === page);
  if (!contribution) throw new Error(`Navigation contribution is missing for ${page}.`);
  const presentation = resolvePresentation(contribution, capabilities);
  return {
    eyebrow: presentation.eyebrow,
    title: presentation.title,
    description: presentation.description
  };
}

export function getPageContentScroll(page: DesktopPage): "page" | "workspace" {
  return navigationContributions.find((item) => item.pageId === page)?.contentScroll ?? "page";
}
