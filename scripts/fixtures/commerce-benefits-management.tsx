import { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES as C, expandBusinessCapabilities, type BenefitsManagementBridge, type BusinessCapability } from "@yardimci-asistan/shared";
import { MarketingPage } from "../../apps/desktop-app/src/pages/MarketingPage";
import { CustomerPointsPanel } from "../../apps/desktop-app/src/components/customers/CustomerPointsPanel";
import { PageViewStateProvider } from "../../apps/desktop-app/src/app/page-view-state";
import { WebAvailabilityProvider } from "../../apps/desktop-app/src/app/web-availability";
import { buildNavigation, getPageMeta } from "../../apps/desktop-app/src/app/navigation";
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
  const [benefits, setBenefits] = useState(true), [studio, setStudio] = useState(false), [message, setMessage] = useState(""), [away, setAway] = useState(false);
  fixture.__setBenefitsCapabilities = (b, s) => { setBenefits(b); setStudio(s); };
  const capabilities: BusinessCapability[] = expandBusinessCapabilities([C.SALES, ...(benefits ? [C.COMMERCE_BENEFITS] : []), ...(studio ? [C.MARKETING_STUDIO] : [])]);
  const snapshot = { businessId: "b1", profileId: "market", capabilities: [], enabledCapabilities: capabilities };
  const navigation = buildNavigation(snapshot), marketing = navigation.find(item => item.id === "marketing");
  const guard = useRef<PageLeaveGuard | null>(null);
  const register = useCallback((next: PageLeaveGuard) => { guard.current = next; return () => { if (guard.current === next) guard.current = null; }; }, []);
  function leave() { const next = () => setAway(true); if (!guard.current || guard.current("dashboard", next)) next(); }
  return <div className="desktop-shell"><nav aria-label="Ana gezinme">{navigation.map(item => <span key={item.id} data-nav-id={item.id}>{item.label}</span>)}</nav><main className="content">
    <header className="page-header"><h1>{marketing ? getPageMeta("marketing", snapshot).title : "Ana Ekran"}</h1><p role="status">{message}</p><button onClick={leave}>Fixture sayfa değiştir</button></header>
    {!away && marketing ? <MarketingPage enabled={studio} benefitsEnabled={benefits} onMessage={setMessage} registerPageLeaveGuard={register} /> : <p>Diğer sayfa</p>}
    {!away && benefits && <CustomerPointsPanel customerId="c1" />}
  </main></div>;
}
createRoot(document.getElementById("root")!).render(<PageViewStateProvider><WebAvailabilityProvider available={false}><Fixture /></WebAvailabilityProvider></PageViewStateProvider>);
