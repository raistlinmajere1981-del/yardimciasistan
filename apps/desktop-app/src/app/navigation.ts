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
  const meta: Record<DesktopPage, { eyebrow: string; title: string }> = {
    dashboard: { eyebrow: "Günlük Özet", title: "Bugün ne var?" },
    customerWork: { eyebrow: "Müşteri Takibi", title: "Müşteri İşleri" },
    pension: { eyebrow: "Konaklama", title: "Pansiyon" },
    restaurant: { eyebrow: "Servis", title: "Restoran" },
    menu: { eyebrow: "Ürünler", title: "Menü" },
    messages: { eyebrow: "İletişim", title: "Mesajlar" },
    settings: { eyebrow: "İşletme", title: "Ayarlar" }
  };

  return meta[page];
}
