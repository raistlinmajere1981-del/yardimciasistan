/** Known website pages; paths are resolved by the host, never accepted in publications. */
export const WEBSITE_PAGES = [
  { id: "home", label: "Ana Sayfa", path: "/", availability: "always", userVisible: true, order: 0, fixed: true },
  { id: "rooms", label: "Odalar", path: "/odalar/", availability: "rooms", userVisible: true, order: 10 },
  { id: "restaurant", label: "Restoran", path: "/restoran/", availability: "restaurant", userVisible: true, order: 20 },
  { id: "qr_menu", label: "QR Menü", path: "/qr-menu/", availability: "qr_menu", userVisible: true, order: 30 },
  { id: "store", label: "Mağaza", path: "/yardimci-asistan/magaza/", availability: "store", userVisible: true, order: 40 },
  { id: "announcements", label: "Kampanyalar", path: "/duyurular/", availability: "announcements", userVisible: true, order: 50 },
  { id: "reviews", label: "Yorumlar", path: "/yorumlar/", availability: "reviews", userVisible: true, order: 60 },
  { id: "contact", label: "İletişim", path: "/iletisim/", availability: "always", userVisible: true, order: 70 },
  { id: "installation", label: "Kurulum", path: "/kurulum/", availability: "always", userVisible: true, order: 80, demoOnly: true },
  { id: "guide", label: "Kullanım Kılavuzu", path: "/kullanim-kilavuzu/", availability: "always", userVisible: true, order: 90, demoOnly: true }
] as const;
export type WebsitePageId = typeof WEBSITE_PAGES[number]["id"];
export interface WebsiteNavigationItem { pageId: WebsitePageId; visible: boolean; order: number }
export interface WebsiteNavigationPublication { revision: number; items: WebsiteNavigationItem[] }
export function defaultWebsiteNavigation(): WebsiteNavigationItem[] {
  return WEBSITE_PAGES.map(page => ({ pageId: page.id, visible: page.userVisible, order: page.order }));
}
/** Strict input validation at the settings and publication boundaries. Missing known pages retain defaults. */
export function normalizeWebsiteNavigation(input: unknown): WebsiteNavigationItem[] {
  if (!Array.isArray(input) || input.length > WEBSITE_PAGES.length) throw new Error("Website menüsü geçersiz.");
  const seen = new Set<string>();
  const items = input.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Website menüsü geçersiz.");
    const value = item as Record<string, unknown>;
    if (Object.keys(value).some(key => !["pageId", "visible", "order"].includes(key))
      || !WEBSITE_PAGES.some(page => page.id === value.pageId) || seen.has(String(value.pageId))
      || typeof value.visible !== "boolean" || !Number.isSafeInteger(value.order) || Number(value.order) < 0 || Number(value.order) > 1000) {
      throw new Error("Website menüsü geçersiz.");
    }
    seen.add(String(value.pageId));
    return { pageId: value.pageId as WebsitePageId, visible: value.visible, order: Number(value.order) };
  });
  return defaultWebsiteNavigation().map(defaultItem => items.find(item => item.pageId === defaultItem.pageId) ?? defaultItem);
}
