import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { CatalogProduct } from "@yardimci-asistan/shared";
import { productWorkspaceDefinition, workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { WorkspaceHost, WorkspaceNavigationProvider, useWorkspaceNavigation } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { isWebAvailable, WebAvailabilityProvider } from "../../apps/desktop-app/src/app/web-availability";
import "../../apps/desktop-app/src/styles/index.css";
const control = window as typeof window & { __product: CatalogProduct; __setup: { webModuleUrl: string; syncSecret: string } };
function Harness() {
  const navigation = useWorkspaceNavigation();
  const [products, setProducts] = useState([control.__product]);
  const [enabled, setEnabled] = useState(true);
  const [message, setMessage] = useState("");
  return <WebAvailabilityProvider available={isWebAvailable(control.__setup)}>
    <button onClick={() => navigation.openWorkspace({ entityType: "product", entityId: control.__product.id, mode: "details" })}>Ürünü Aç</button>
    <button onClick={() => navigation.openWorkspace({ entityType: "product", entityId: "new-product", mode: "create" })}>Yeni Ürün</button>
    <button onClick={() => setEnabled(current => !current)}>Online Satış Değiştir</button>
    <p role="status">{message}</p>
    <WorkspaceHost definition={productWorkspaceDefinition} context={{
      products, categories: [], inventoryEnabled: true, productDataEnabled: true, onlineSalesEnabled: enabled,
      busy: false, onReload: async () => {}, onProductSaved: (saved: CatalogProduct) => { control.__product = saved; setProducts(current => [...current.filter(p => p.id !== saved.id), saved]); }, onStateChange: (_state, text) => setMessage(text)
    }} />
  </WebAvailabilityProvider>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><WorkspaceNavigationProvider definitions={workspaceDefinitions} page="market"><Harness /></WorkspaceNavigationProvider></StrictMode>);
