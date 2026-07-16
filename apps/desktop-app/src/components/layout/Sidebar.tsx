import type { DesktopPage, NavigationItem } from "../../app/navigation";

interface SidebarProps {
  items: NavigationItem[];
  activePage: DesktopPage;
  businessName?: string;
  onNavigate: (page: DesktopPage) => void;
}

export function Sidebar({ items, activePage, businessName, onNavigate }: SidebarProps) {
  const primaryItems = items.filter((item) => item.id !== "settings");
  const settingsItem = items.find((item) => item.id === "settings");

  function renderItem(item: NavigationItem) {
    const Icon = item.icon;
    return (
      <button
        className={activePage === item.id ? "nav-item is-active" : "nav-item"}
        type="button"
        onClick={() => onNavigate(item.id)}
        aria-current={activePage === item.id ? "page" : undefined}
        key={item.id}
      >
        <Icon size={17} aria-hidden="true" />
        <span>{item.label}</span>
      </button>
    );
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-symbol" src="./assets/yardimci-asistan-symbol.png" alt="" aria-hidden="true" />
        <div>
          <strong>Yardımcı Asistan</strong>
          <small title={businessName}>{businessName || "İşletme Paneli"}</small>
        </div>
      </div>

      <nav className="sidebar-primary-nav" aria-label="Masaüstü menü">
        {primaryItems.map(renderItem)}
      </nav>

      {settingsItem && (
        <nav className="sidebar-footer-nav" aria-label="Uygulama ayarları">
          {renderItem(settingsItem)}
        </nav>
      )}
    </aside>
  );
}
