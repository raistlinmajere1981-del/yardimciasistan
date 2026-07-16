import {
  BedDouble,
  Home,
  Menu as MenuIcon,
  MessageCircle,
  Settings,
  Users,
  UtensilsCrossed,
  type LucideIcon
} from "lucide-react";
import type { DesktopSetupData } from "../../electron/database";

export type DesktopPage = "dashboard" | "customerWork" | "pension" | "restaurant" | "menu" | "messages" | "settings";

export interface NavigationItem {
  id: DesktopPage;
  label: string;
  icon: LucideIcon;
}

const baseItems: NavigationItem[] = [
  { id: "dashboard", label: "Ana Ekran", icon: Home },
  { id: "customerWork", label: "Müşteri İşleri", icon: Users }
];

export function buildNavigation(setup: DesktopSetupData): NavigationItem[] {
  const items = [...baseItems];

  if (setup.modules.rooms) {
    items.push({ id: "pension", label: "Pansiyon", icon: BedDouble });
  }

  if (setup.modules.tables) {
    items.push({ id: "restaurant", label: "Restoran", icon: UtensilsCrossed });
  }

  if (setup.modules.qrMenu) {
    items.push({ id: "menu", label: "Menü", icon: MenuIcon });
  }

  if (setup.modules.whatsapp || setup.aiEnabled) {
    items.push({ id: "messages", label: "Mesajlar", icon: MessageCircle });
  }

  items.push({ id: "settings", label: "Ayarlar", icon: Settings });
  return items;
}

export function getPageMeta(page: DesktopPage) {
  const meta: Record<DesktopPage, { title: string }> = {
    dashboard: { title: "Bugün ne var?" },
    customerWork: { title: "Müşteri İşleri" },
    pension: { title: "Pansiyon" },
    restaurant: { title: "Restoran" },
    menu: { title: "Menü" },
    messages: { title: "Mesajlar" },
    settings: { title: "Ayarlar" }
  };

  return meta[page];
}
