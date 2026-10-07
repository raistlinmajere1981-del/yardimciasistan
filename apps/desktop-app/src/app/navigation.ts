import {
  CalendarDays,
  Home,
  Megaphone,
  Menu as MenuIcon,
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

export type DesktopPage = "dashboard" | "customerWork" | "calendar" | "pension" | "restaurant" | "market" | "menu" | "marketing" | "reports" | "settings";

/** Customer-work subview id; a view state, not a DesktopPage route. */
export type CustomerWorkTab = "requests" | "customers" | "kbs" | "prepared";

export interface NavigationItem {
  id: DesktopPage;
  label: string;
  icon: LucideIcon;
}

export interface NavigationPresentation {
  label: string;
  title: string;
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
  contentScroll: "workspace",
  presentation: { label: "Ana Ekran", title: "Bugün ne var?" }
} satisfies NavigationContribution;

const customerWorkContribution = {
  pageId: "customerWork",
  icon: Users,
  order: 10,
  condition: { allOf: [C.CUSTOMERS] },
  contentScroll: "workspace",
  presentation: { label: "Müşteri İşleri", title: "Müşteri İşleri" }
} satisfies NavigationContribution;

const calendarContribution = {
  pageId: "calendar",
  icon: CalendarDays,
  order: 75,
  condition: { anyOf: [C.CALENDAR, C.MARKETING_STUDIO] },
  contentScroll: "workspace",
  presentation: { label: "Takvim", title: "Takvim" }
} satisfies NavigationContribution;

const marketContribution = {
  pageId: "market",
  icon: Store,
  order: 50,
  // Catalog, sales and inventory are shared foundations (also supplied by
  // hospitality). Only retail/dealer/channel surfaces grant workspace entry.
  condition: { anyOf: [
    { allOf: [C.CATALOG, C.ORDERS, C.WHOLESALE] },
    { allOf: [C.CATALOG, C.RETAIL_BARCODE] },
    { allOf: [C.CATALOG, C.RETAIL_PURCHASING] },
    { allOf: [C.CATALOG, C.RETAIL_SUPPLIERS] },
    { allOf: [C.CATALOG, C.RETAIL_LABELS] },
    { allOf: [C.CATALOG, C.ORDERS, C.ONLINE_SALES] }
  ] },
  contentScroll: "workspace",
  presentation: { label: "Satış", title: "Satış" }
} satisfies NavigationContribution;

const menuContribution = {
  pageId: "menu",
  icon: MenuIcon,
  order: 60,
  condition: { allOf: [C.FOOD_MENU] },
  contentScroll: "workspace",
  presentation: { label: "Menü", title: "Menü" }
} satisfies NavigationContribution;

const reportsContribution = {
  pageId: "reports",
  icon: WalletCards,
  order: 80,
  condition: { anyOf: [C.FINANCE, C.REPORTS] },
  contentScroll: "workspace",
  presentation: (capabilities) => {
    const financeEnabled = runtimeHasCapability(capabilities, C.FINANCE);
    return { label: financeEnabled ? "Kasa" : "Raporlar", title: financeEnabled ? "Kasa" : "Raporlar" };
  }
} satisfies NavigationContribution;

const settingsContribution = {
  pageId: "settings",
  icon: Settings,
  order: 90,
  contentScroll: "workspace",
  presentation: { label: "Ayarlar", title: "Ayarlar" }
} satisfies NavigationContribution;

const navigationContributions = [
  dashboardContribution,
  customerWorkContribution,
  calendarContribution,
  pensionNavigationContribution,
  restaurantNavigationContribution,
  marketContribution,
  {
    pageId: "marketing", icon: Megaphone, order: 64, contentScroll: "workspace",
    condition: { allOf: [C.MARKETING_STUDIO] },
    presentation: {label: "Pazarlama", title: "Pazarlama"}
  },
  menuContribution,
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
  return [...contributions]
    .filter((contribution) => matchesCapabilityCondition(capabilities, contribution.condition))
    .sort((left, right) => left.order - right.order)
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
    title: presentation.title
  };
}

export function getPageContentScroll(page: DesktopPage): "page" | "workspace" {
  return navigationContributions.find((item) => item.pageId === page)?.contentScroll ?? "page";
}
