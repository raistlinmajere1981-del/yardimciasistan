import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { CatalogProduct } from "../../packages/shared";
import { productWorkspaceDefinition, workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { WorkspaceHost, WorkspaceNavigationProvider, useWorkspaceNavigation } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import "../../apps/desktop-app/src/styles/index.css";
const control = window as typeof window & { __product: CatalogProduct; __onlineToggle?: (enabled: boolean) => void };
function Harness() {
  const navigation = useWorkspaceNavigation();
  const [enabled, setEnabled] = useState(true);
  useEffect(() => { control.__onlineToggle = setEnabled; return () => { delete control.__onlineToggle; }; }, []);
  return <>
    <button onClick={() => navigation.openWorkspace({ entityType: "product", entityId: control.__product.id, mode: "details" })}>Ürünü Aç</button>
    <WorkspaceHost definition={productWorkspaceDefinition} context={{
      products: [control.__product], categories: [], inventoryEnabled: false, productDataEnabled: false,
      onlineSalesEnabled: enabled, busy: false, onReload: async () => {}, onProductSaved: () => {}, onStateChange: () => {}
    }} />
  </>;
}
createRoot(document.getElementById("root")!).render(<WorkspaceNavigationProvider definitions={workspaceDefinitions} page="market"><Harness /></WorkspaceNavigationProvider>);
