import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { CatalogProduct } from "@yardimci-asistan/shared";
import { productWorkspaceDefinition, workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { WorkspaceHost, WorkspaceNavigationProvider, useWorkspaceNavigation } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import "../../apps/desktop-app/src/styles/index.css";
const control = window as typeof window & { __product: CatalogProduct };
function Harness() {
  const navigation = useWorkspaceNavigation();
  const [products, setProducts] = useState([control.__product]);
  const [enabled, setEnabled] = useState(true);
  return <>
    <button onClick={() => navigation.openWorkspace({ entityType: "product", entityId: control.__product.id, mode: "details" })}>Ürünü Aç</button>
    <button onClick={() => navigation.openWorkspace({ entityType: "product", entityId: "new-product", mode: "create" })}>Yeni Ürün</button>
    <button onClick={() => setEnabled(current => !current)}>Online Satış Değiştir</button>
    <WorkspaceHost definition={productWorkspaceDefinition} context={{
      products, categories: [], inventoryEnabled: false, productDataEnabled: false, onlineSalesEnabled: enabled,
      busy: false, onReload: async () => {}, onProductSaved: (saved: CatalogProduct) => setProducts(current => [...current.filter(p => p.id !== saved.id), saved]), onStateChange: () => {}
    }} />
  </>;
}
createRoot(document.getElementById("root")!).render(<WorkspaceNavigationProvider definitions={workspaceDefinitions} page="market"><Harness /></WorkspaceNavigationProvider>);
