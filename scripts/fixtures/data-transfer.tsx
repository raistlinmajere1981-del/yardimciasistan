import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import { WorkspaceNavigationProvider, WorkspaceHost } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { workspaceDefinitions, customerWorkspaceDefinition } from "../../apps/desktop-app/src/app/workspace-definitions";
import { CustomersWorkspace } from "../../apps/desktop-app/src/components/customers/CustomersWorkspace";
import { MarketProductsWorkspace } from "../../apps/desktop-app/src/components/market/MarketProductsWorkspace";
import { MenuManager } from "../../apps/desktop-app/src/components/menu/MenuManager";
import { emptyItemForm } from "../../apps/desktop-app/src/components/menu/menu-model";
import type { DesktopDashboardData } from "../../apps/desktop-app/electron/database";
import type { BusinessCapabilitySnapshot } from "../../apps/desktop-app/electron/business-capability-store";
import "../../apps/desktop-app/src/styles/index.css";
const control=window as typeof window & {__transferInitial:{dashboard:DesktopDashboardData;snapshot:BusinessCapabilitySnapshot}};
function Harness(){
  const {snapshot}=control.__transferInitial;
  const [dashboard,setDashboard]=useState(control.__transferInitial.dashboard);
  const [page,setPage]=useState("products");
  const [category,setCategory]=useState(dashboard.menu.categories[0]?.id ?? "");
  return <BusinessCapabilityRuntimeProvider value={{snapshot}}><WorkspaceNavigationProvider definitions={workspaceDefinitions} page="customerWork">
    <main style={{minWidth:0,padding:"var(--space-2)"}}><nav><button onClick={()=>setPage("products")}>Ürünler</button><button onClick={()=>setPage("customers")}>Müşteriler</button><button onClick={()=>setPage("menu")}>Menü</button></nav>
    {page==="menu" ? <MenuManager products={[]} catalogCategories={[]} onCatalogReload={async()=>{}} dashboardData={dashboard}
      qrMenuEnabled={false} inventoryEnabled stockImageImportEnabled={false} itemForm={emptyItemForm(category,0)}
      selectedCategoryId={category} selectedItemId="" menuEditState="idle" menuEditMessage="" onItemFormChange={()=>{}}
      onSelectCategory={value=>setCategory(value.id)} onSelectItem={()=>{}} onNewItem={()=>{}}
      onSaveCategoryForm={async()=>({ok:false,message:"fixture"})} onSaveItem={async()=>undefined}
      onReorderCategories={async()=>({ok:false,message:"fixture"})} onReorderItems={async()=>({ok:false,message:"fixture"})}
      onDeleteCategoryById={async()=>{}} onDashboardDataChanged={setDashboard} onPreview={()=>{}} />
    : page==="products"?<MarketProductsWorkspace categories={[]} busy={false} onReload={async()=>{}} onStateChange={()=>{}}/>:<CustomersWorkspace customers={dashboard.customers} stays={[]} reservations={[]} notifications={[]} kbsOverview={dashboard.kbsOverview} aiEnabled={false} wholesaleEnabled onSave={async()=>({ok:false,message:"fixture"})} onAnalyzeIdentity={async()=>({ok:false,message:"fixture"})} onDelete={()=>{}} onSendKbs={()=>{}}/>}
    <WorkspaceHost definition={customerWorkspaceDefinition} context={{data:dashboard,aiEnabled:false,whatsappEnabled:false,reservationsEnabled:false,staysEnabled:false,customerCreditEnabled:false,wholesaleEnabled:false,onWhatsApp:()=>{},onSave:async()=>({ok:false,message:"fixture"}),onAnalyzeIdentity:async()=>({ok:false,message:"fixture"}),onDelete:()=>{}}}/>
    </main></WorkspaceNavigationProvider></BusinessCapabilityRuntimeProvider>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Harness/></StrictMode>);
