import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES as C, expandBusinessCapabilities, type BenefitsManagementBridge, type BusinessCapability } from "@yardimci-asistan/shared";
import { AppShell } from "../../apps/desktop-app/src/components/layout/AppShell";
import { BenefitsPage } from "../../apps/desktop-app/src/pages/BenefitsPage";
import { MarketingPage } from "../../apps/desktop-app/src/pages/MarketingPage";
import { CustomerPointsPanel } from "../../apps/desktop-app/src/components/customers/CustomerPointsPanel";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import { PageViewStateProvider } from "../../apps/desktop-app/src/app/page-view-state";
import { WebAvailabilityProvider } from "../../apps/desktop-app/src/app/web-availability";
import { buildNavigation, getPageMeta, type DesktopPage } from "../../apps/desktop-app/src/app/navigation";
import type { PageLeaveGuard } from "../../apps/desktop-app/src/app/page-navigation-guard";
import "../../apps/desktop-app/src/styles/index.css";

const fixture = window as typeof window & {
  __benefitsCall(method: string, args: unknown[]): Promise<unknown>;
  __setBenefitsCapabilities?(benefits: boolean, studio: boolean): void;
};
const call = (method: string, ...args: unknown[]) => fixture.__benefitsCall(method, args);
const methods: (keyof BenefitsManagementBridge)[] = ["getCommerceBenefits", "configureCommerceBenefits", "saveCommerceBenefitsRule", "issueCommerceBenefitsCoupon", "getCommercePointAccount", "adjustCommercePoints", "expireCommercePoints", "getCompanionPointGrantStatus", "grantCompanionPointAccess", "revokeCompanionPointAccess", "getCompanionPointSpendStatus", "grantCompanionPointSpend", "revokeCompanionPointSpend", "listCompanionPointDevices"];
window.yardimciDesktop = {
  ...Object.fromEntries(methods.map(method => [method, (...args: unknown[]) => call(method, ...args)])),
  listCustomers: query => call("listCustomers", query),
  commerce: { listCategories: () => call("listCategories"), listProducts: query => call("listProducts", query) },
  getMarketingStudio: () => call("studio"), getMarketingSchedules: () => call("schedules"),
} as typeof window.yardimciDesktop;
function Fixture() {
  const [benefits, setBenefits] = useState(true), [studio, setStudio] = useState(false), [message, setMessage] = useState(""), [activePage, setActivePage] = useState<DesktopPage>("benefits");
  const [collapsed, setCollapsed] = useState(() => innerWidth < 1100);
  const contentRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = matchMedia("(max-width: 1099px)");
    const change = () => setCollapsed(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  fixture.__setBenefitsCapabilities = (b, s) => { setBenefits(b); setStudio(s); };
  const capabilities: BusinessCapability[] = expandBusinessCapabilities([C.SALES, C.ANDROID, ...(benefits ? [C.COMMERCE_BENEFITS] : []), ...(studio ? [C.MARKETING_STUDIO] : [])]);
  const snapshot = { businessId: "b1", profileId: "market", capabilities: [], enabledCapabilities: capabilities };
  const navigation = buildNavigation(snapshot);
  const guard = useRef<PageLeaveGuard | null>(null);
  const register = useCallback((next: PageLeaveGuard) => { guard.current = next; return () => { if (guard.current === next) guard.current = null; }; }, []);
  const requestPageChange = useCallback((page: DesktopPage) => {
    const next = () => setActivePage(page);
    if (!guard.current || guard.current(page, next)) next();
  }, []);
  const allowed = navigation.some(item => item.id === activePage);
  useEffect(() => { if (!allowed) requestPageChange("dashboard"); }, [allowed, requestPageChange]);
  return <BusinessCapabilityRuntimeProvider value={{ snapshot }}><AppShell contentScroll="workspace" sidebarCollapsed={collapsed} contentRef={contentRef}
    sidebar={<aside id="desktop-sidebar" className={collapsed ? "sidebar is-collapsed" : "sidebar"}><nav className="sidebar-primary-nav" aria-label="Ana gezinme">{navigation.map(item => {
      const Icon = item.icon;
      return <button className="nav-item" aria-label={item.label} type="button" key={item.id} data-nav-id={item.id} aria-current={activePage === item.id ? "page" : undefined} onClick={() => requestPageChange(item.id)}><Icon size={17} aria-hidden="true" /><span>{item.label}</span></button>;
    })}</nav></aside>}
    header={<header className="page-header"><h1>{getPageMeta(activePage, snapshot).title}</h1><p role="status">{message}</p><button onClick={() => requestPageChange("dashboard")}>Fixture sayfa değiştir</button></header>}>
      {activePage === "benefits" ? <BenefitsPage enabled={benefits} onMessage={setMessage} registerPageLeaveGuard={register} />
        : activePage === "marketing" ? <MarketingPage enabled={studio} onMessage={setMessage} registerPageLeaveGuard={register} />
        : <section><p>Diğer sayfa</p>{benefits && <CustomerPointsPanel customerId="c1" />}</section>}
  </AppShell></BusinessCapabilityRuntimeProvider>;
}
createRoot(document.getElementById("root")!).render(<PageViewStateProvider><WebAvailabilityProvider available={false}><Fixture /></WebAvailabilityProvider></PageViewStateProvider>);
