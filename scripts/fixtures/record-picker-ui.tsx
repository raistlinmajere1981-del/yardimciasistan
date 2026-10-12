import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { DesktopCustomer } from "../../apps/desktop-app/electron/database";
import type { BusinessCapabilitySnapshot } from "../../apps/desktop-app/electron/business-capability-store";
import type { CatalogProduct } from "@yardimci-asistan/shared";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import { useMarketController } from "../../apps/desktop-app/src/app/use-market-controller";
import { PageViewStateProvider } from "../../apps/desktop-app/src/app/page-view-state";
import { MarketPage } from "../../apps/desktop-app/src/pages/MarketPage";
import { MarketInventoryWorkspace } from "../../apps/desktop-app/src/components/market/MarketInventoryWorkspace";
import { CustomerPicker } from "../../apps/desktop-app/src/components/customers/CustomerPicker";
import { FormDialog } from "../../apps/desktop-app/src/components/ui/FormDialog";
import type { MarketView } from "../../apps/desktop-app/src/components/workspace/workspace-intent";
import "../../apps/desktop-app/src/styles/index.css";

const control = window as typeof window & {
  __pickerInitial: { customers: DesktopCustomer[]; snapshot: BusinessCapabilitySnapshot };
  __pickerView: (view: MarketView) => void;
  __pickerNested: () => void;
  __pickerBusy: (busy: boolean) => void;
  __pickerLargeCustomers: (customers: DesktopCustomer[]) => void;
};
function Harness() {
  const [view, setView] = useState<MarketView>("inventory");
  const [nested, setNested] = useState(false), [busy, setBusy] = useState(false);
  const [largeCustomers, setLargeCustomers] = useState<DesktopCustomer[]>([]), [customerId, setCustomerId] = useState("");
  const controller = useMarketController({ businessCapabilities: control.__pickerInitial.snapshot, active: true });
  // This smoke stress-tests the 10k+ catalog through picker queries, not the separate
  // Quick Sale catalog rendering/pricing workload while selecting a customer.
  const pickerProducts = useMemo(() => view === "quickSale" ? controller.products.slice(0, 40) : controller.products,
    [view, controller.products]);
  control.__pickerView = setView;
  control.__pickerNested = () => setNested(true);
  control.__pickerBusy = setBusy;
  control.__pickerLargeCustomers = setLargeCustomers;
  return <BusinessCapabilityRuntimeProvider value={{ snapshot: control.__pickerInitial.snapshot }}>
    <main style={{ height: "100dvh", padding: 16 }}>
      {largeCustomers.length ? <CustomerPicker customers={largeCustomers} value={customerId} onChange={setCustomerId} disabled={busy} showDebt={false} />
        : <MarketPage customers={control.__pickerInitial.customers} controller={{ ...controller, products: pickerProducts, dataState: busy ? "loading" : controller.dataState }} activeView={view} onViewChange={setView} />}
      {nested && <FormDialog title="Stok görevi" onClose={() => setNested(false)} footer={<button type="button" onClick={() => setNested(false)}>Görevi kapat</button>} onSubmit={event => event.preventDefault()}>
        <MarketInventoryWorkspace products={controller.products as CatalogProduct[]} busy={false} onStateChange={controller.handleStateChange} />
      </FormDialog>}
    </main>
  </BusinessCapabilityRuntimeProvider>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><PageViewStateProvider><Harness /></PageViewStateProvider></StrictMode>);
