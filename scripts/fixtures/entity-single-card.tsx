import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES as C, type CatalogCategory, type CatalogProduct } from "@yardimci-asistan/shared";
import type { DesktopDashboardData, SaveCustomerInput } from "../../apps/desktop-app/electron/database";
import type { DesktopPage } from "../../apps/desktop-app/src/app/navigation";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import { customerWorkspaceDefinition, productWorkspaceDefinition, roomWorkspaceDefinition, tableWorkspaceDefinition, workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { HospitalityWorkspaceHost, WorkspaceHost, WorkspaceNavigationProvider, useWorkspaceNavigation } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { MarketProductsWorkspace } from "../../apps/desktop-app/src/components/market/MarketProductsWorkspace";
import { CustomersWorkspace } from "../../apps/desktop-app/src/components/customers/CustomersWorkspace";
import "../../apps/desktop-app/src/styles/index.css";

const control = window as typeof window & {
  __cards: { data: DesktopDashboardData; products: CatalogProduct[]; categories: CatalogCategory[] };
};
function App() {
  const [page, setPage] = useState<DesktopPage>("market");
  return <WorkspaceNavigationProvider definitions={workspaceDefinitions} page={page} onReturnPage={setPage}>
    <Harness page={page} setPage={setPage} />
  </WorkspaceNavigationProvider>;
}
function Harness({ page, setPage }: { page: DesktopPage; setPage: (page: DesktopPage) => void }) {
  const navigation = useWorkspaceNavigation();
  const [data, setData] = useState(control.__cards.data);
  const [products, setProducts] = useState(control.__cards.products);
  const saveCustomer = async (input: SaveCustomerInput) => {
    const result = await window.yardimciDesktop!.saveCustomer(input);
    if (result.ok) setData(previous => ({ ...previous, customers: result.dashboardData.customers, revision: previous.revision + 1 }));
    return result;
  };
  const onProductSaved = (saved: CatalogProduct) => setProducts(current => [...current.filter(item => item.id !== saved.id), saved]);
  const analyze = async () => ({ ok: false as const, message: "fixture" });
  const capabilities = [C.CUSTOMERS, C.WHOLESALE, C.INVENTORY, C.ONLINE_SALES];
  return <BusinessCapabilityRuntimeProvider value={{ snapshot: { businessId: "fixture", profileId: "market", capabilities: [], enabledCapabilities: capabilities } }}>
    <main style={{ height: "100dvh", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <nav><button onClick={() => setPage("market")}>Ürün listesi</button><button onClick={() => setPage("customerWork")}>Müşteri listesi</button>
        <button onClick={() => { setPage("pension"); navigation.openWorkspace({ entityType: "room", entityId: data.rooms[0]!.id }); }}>Odayı aç</button>
        <button onClick={() => { setPage("restaurant"); navigation.openWorkspace({ entityType: "table", entityId: data.tables[0]!.id }); }}>Masayı aç</button>
      </nav>
      {page === "market" && <MarketProductsWorkspace products={products} categories={control.__cards.categories} busy={false} onReload={async () => {}} onProductSaved={onProductSaved} onStateChange={() => {}} />}
      {page === "customerWork" && <CustomersWorkspace customers={data.customers} stays={[]} reservations={[]} notifications={[]} kbsOverview={data.kbsOverview} aiEnabled={false} wholesaleEnabled onSave={saveCustomer} onAnalyzeIdentity={analyze} onDelete={() => {}} onSendKbs={() => {}} />}
      <HospitalityWorkspaceHost page="pension" activePage={page} definition={roomWorkspaceDefinition} context={{ data, onDashboard: setData, staysEnabled: true, reservationsEnabled: false, folioEnabled: false, menuEnabled: false, customersEnabled: true, aiEnabled: false, onSaveCustomer: saveCustomer, onAnalyzeIdentity: analyze }} />
      <HospitalityWorkspaceHost page="restaurant" activePage={page} definition={tableWorkspaceDefinition} context={{ data, onDashboardDataChanged: setData, ordersEnabled: false, menuEnabled: false, customersEnabled: true, reservationsEnabled: false, roomFolioTransferEnabled: false, aiEnabled: false, onSaveCustomer: saveCustomer, onAnalyzeIdentity: analyze, onSaveReservation: async () => ({ ok: false, message: "fixture" }), onUpdateTableStatus: async () => ({ ok: false, message: "fixture" }) }} />
      <WorkspaceHost definition={productWorkspaceDefinition} context={{ products, categories: control.__cards.categories, inventoryEnabled: true, productDataEnabled: true, wholesaleEnabled: true, onlineSalesEnabled: true, busy: false, onReload: async () => {}, onProductSaved, onStateChange: () => {} }} />
      <WorkspaceHost definition={customerWorkspaceDefinition} context={{ data, aiEnabled: false, whatsappEnabled: false, reservationsEnabled: false, staysEnabled: false, customerCreditEnabled: false, wholesaleEnabled: true, onWhatsApp: () => {}, onSave: saveCustomer, onAnalyzeIdentity: analyze, onDelete: async () => undefined }} />
    </main>
  </BusinessCapabilityRuntimeProvider>;
}
createRoot(document.getElementById("root")!).render(<App />);
