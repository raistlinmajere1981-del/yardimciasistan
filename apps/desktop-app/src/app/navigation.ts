import {
  BedDouble,
  Home,
  Menu as MenuIcon,
  MessageCircle,
  Settings,
  Users,
  UtensilsCrossed,
  WalletCards,
  type LucideIcon
} from "lucide-react";
import type { DesktopSetupData } from "../../electron/database";

export type DesktopPage = "dashboard" | "customerWork" | "pension" | "restaurant" | "menu" | "messages" | "reports" | "settings";

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

  items.push({ id: "reports", label: "Kasa", icon: WalletCards });
  items.push({ id: "settings", label: "Ayarlar", icon: Settings });
  return items;
}

export function getPageMeta(page: DesktopPage) {
  const meta: Record<DesktopPage, { eyebrow: string; title: string; description: string }> = {
    dashboard: { eyebrow: "Günlük özet", title: "Bugün ne var?", description: "Yeni talepler, işler ve bekleyen dönüşler." },
    customerWork: { eyebrow: "Müşteri operasyonu", title: "Müşteri İşleri", description: "Talepleri, müşterileri ve bekleyen yanıtları yönetin." },
    pension: { eyebrow: "Konaklama", title: "Pansiyon", description: "Rezervasyonları, odaları ve günlük işleri izleyin." },
    restaurant: { eyebrow: "Servis", title: "Restoran", description: "Masa durumlarını ve servis işlerini takip edin." },
    menu: { eyebrow: "İçerik", title: "Menü", description: "Kategori ve ürünleri düzenleyip web menüsünü yayınlayın." },
    messages: { eyebrow: "Mesaj merkezi", title: "Mesajlar", description: "Hazır yanıtları ve WhatsApp görüşmelerini yönetin." },
    reports: { eyebrow: "Günlük para takibi", title: "Kasa", description: "Bugünün para giriş çıkışını ve bekleyen alacakları takip edin." },
    settings: { eyebrow: "Yapılandırma", title: "Ayarlar", description: "İşletme, görünüm ve bağlantı tercihlerini düzenleyin." }
  };

  return meta[page];
}
