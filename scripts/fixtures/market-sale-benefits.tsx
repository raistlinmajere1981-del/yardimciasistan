import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { CatalogProduct } from "@yardimci-asistan/shared";
import type { DesktopCustomer } from "../../apps/desktop-app/electron/database";
import { useMarketQuickSaleSession } from "../../apps/desktop-app/src/app/use-market-quick-sale-session";
import { MarketQuickSaleWorkspace } from "../../apps/desktop-app/src/components/market/MarketQuickSaleWorkspace";
import { WorkspaceNavigationProvider } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import "../../apps/desktop-app/src/styles/index.css";

const control = window as typeof window & { __benefitsProduct: CatalogProduct; __benefitsCustomer: DesktopCustomer };
function Harness() {
  const [visible, setVisible] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState("");
  const [business, setBusiness] = useState("business-1");
  const [printing, setPrinting] = useState(true);
  const session = useMarketQuickSaleSession({ customerCreditEnabled: false, customerSelectionEnabled: true, benefitsEnabled: enabled });
  return <BusinessCapabilityRuntimeProvider value={{ snapshot: { businessId: business, profileId: "market", capabilities: [], enabledCapabilities: printing ? [C.SALES, C.PRINTING] : [C.SALES] } }}><WorkspaceNavigationProvider definitions={[]} page="market">
    <nav><span role="status" data-testid="topbar-status">{status}</span>
      <button onClick={() => setVisible(value => !value)}>Görünümü değiştir</button>
      <button onClick={() => setEnabled(value => !value)}>Yeteneği değiştir</button>
      <button onClick={() => session.addProduct(control.__benefitsProduct)}>Ürün ekle</button>
      <button onClick={() => setPrinting(value => !value)}>Baskı yetkisini değiştir</button>
      <button onClick={() => setBusiness(value => value === "business-1" ? "business-2" : "business-1")}>İşletmeyi değiştir</button>
    </nav>
    {visible && <main style={{ height: "calc(100vh - 50px)" }}><div className="market-workspace market-workspace--quickSale" style={{ height: "100%" }}><MarketQuickSaleWorkspace
      customers={[control.__benefitsCustomer, { ...control.__benefitsCustomer, id: "c2", fullName: "İkinci Müşteri" }]}
      categories={[]} session={session} customerSelectionEnabled ordersEnabled barcodeEnabled={false} busy={false}
      onSaleCompleted={() => undefined} onStateChange={(_tone, message) => setStatus(message)} /></div></main>}
  </WorkspaceNavigationProvider></BusinessCapabilityRuntimeProvider>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
