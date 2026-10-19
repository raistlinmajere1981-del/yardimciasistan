import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { DesktopPage, NavigationItem } from "../../app/navigation";
import { NexaHabitat } from "./NexaHabitat";

interface SidebarProps {
  items: NavigationItem[];
  activePage: DesktopPage;
  businessName?: string;
  collapsed?: boolean;
  onNavigate: (page: DesktopPage) => void;
  onToggleCollapsed?: () => void;
}

export function Sidebar({ items, activePage, businessName, collapsed = false, onNavigate, onToggleCollapsed }: SidebarProps) {
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
        aria-label={collapsed ? item.label : undefined}
        title={collapsed ? item.label : undefined}
        key={item.id}
      >
        <Icon size={17} aria-hidden="true" />
        <span>{item.label}</span>
      </button>
    );
  }

  return (
    <aside className={collapsed ? "sidebar is-collapsed" : "sidebar"} id="desktop-sidebar">
      <div className="brand">
        <img className="brand-symbol" src="./assets/yardimci-asistan-symbol.png" alt="" aria-hidden="true" />
        <div className="brand-copy">
          <strong>Yardımcı Asistan</strong>
        </div>
        {onToggleCollapsed && (
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
            aria-controls="desktop-sidebar"
            aria-expanded={!collapsed}
            title={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
          </button>
        )}
        <small className="brand-business-name" title={businessName}>{businessName || "İşletme Paneli"}</small>
      </div>

      <nav className="sidebar-primary-nav" aria-label="Masaüstü menü">
        {primaryItems.map(renderItem)}
      </nav>

      <NexaHabitat collapsed={collapsed} />
      {settingsItem && (
        <nav className="sidebar-footer-nav" aria-label="Uygulama ayarları">
          {renderItem(settingsItem)}
        </nav>
      )}
    </aside>
  );
}
