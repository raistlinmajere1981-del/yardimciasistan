import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { DesktopCustomer, DesktopIdentityImageAnalyzeInput, DesktopIdentityImageAnalyzeResult, SaveCustomerInput } from "../../apps/desktop-app/electron/database";
import { defaultDashboardData } from "../../apps/desktop-app/src/app/bootstrap-defaults";
import { toCustomerForm } from "../../apps/desktop-app/src/app/customer-model";
import { useCustomerController } from "../../apps/desktop-app/src/app/use-customer-controller";
import type { SyncState } from "../../apps/desktop-app/src/app/runtime-state";
import { customerWorkspaceDefinition, workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { CustomerCreateEditor } from "../../apps/desktop-app/src/components/customers/CustomerCreateEditor";
import { WorkspaceFrame } from "../../apps/desktop-app/src/components/workspace/WorkspaceFrame";
import { WorkspaceHost, WorkspaceNavigationProvider, useWorkspaceNavigation } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import "../../apps/desktop-app/src/styles/index.css";

type PendingAnalysis = {
  name: string;
  resolve: (result: DesktopIdentityImageAnalyzeResult) => void;
  reject: (error: Error) => void;
};
type FixtureControl = typeof window & {
  customerIdentity: {
    requests: PendingAnalysis[];
    saves: SaveCustomerInput[];
    openCustomer: (id: string) => boolean;
    closeEditor: () => void;
  };
};
const control = window as FixtureControl;
control.customerIdentity = { requests: [], saves: [], openCustomer: () => false, closeEditor: () => {} };

const customers: DesktopCustomer[] = ["customer-a", "customer-b"].map(id => ({
  ...toCustomerForm(null), id, fullName: id, tags: [], identityType: "", gender: "",
  source: "manual", lastContactAt: "", commercialProfile: null,
  requestCount: 0, reservationCount: 0, stayCount: 0, updatedAt: ""
}));
const data = { ...defaultDashboardData, customers };
Object.assign(control, { yardimciDesktop: {
  analyzeIdentityImage: (input: DesktopIdentityImageAnalyzeInput): Promise<DesktopIdentityImageAnalyzeResult> => new Promise((resolve, reject) => {
    control.customerIdentity.requests.push({ name: input.fileName, resolve, reject });
  })
} });
async function save(input: SaveCustomerInput) {
  control.customerIdentity.saves.push(input);
  return { ok: true as const, message: "Kaydedildi.", savedId: input.id || "created", dashboardData: data };
}

function Harness() {
  const navigation = useWorkspaceNavigation();
  const [open, setOpen] = useState(false);
  const [dashboardData, setDashboardData] = useState(data);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedWhatsAppRequestId, setSelectedWhatsAppRequestId] = useState("");
  const { handleAnalyzeIdentityImage: analyze } = useCustomerController({
    dashboardData, setDashboardData, setSyncState, setStatusMessage,
    selectedWhatsAppRequestId, setSelectedWhatsAppRequestId
  });
  const mode = new URLSearchParams(location.search).get("mode");
  const quickCreate = mode === "quick-create";
  control.customerIdentity.closeEditor = () => setOpen(false);
  control.customerIdentity.openCustomer = id => navigation.openWorkspace({
    entityType: "customer", entityId: id, mode: "main", returnContext: { page: "customerWork" }
  });
  const editor = <CustomerCreateEditor open={open} aiEnabled withinWorkspace={quickCreate}
    onClose={() => setOpen(false)} onSave={save} onCreated={() => {}} onAnalyzeIdentity={analyze} />;
  return <main>
    <p data-testid="identity-global-status">{syncState}: {statusMessage}</p>
    <button type="button" onClick={() => setOpen(true)}>Müşteri formunu aç</button>
    {mode === "workspace" ? <WorkspaceHost definition={customerWorkspaceDefinition} context={{
      data, aiEnabled: true, whatsappEnabled: false, reservationsEnabled: false, staysEnabled: false,
      customerCreditEnabled: false, onWhatsApp: () => {}, onSave: save, onAnalyzeIdentity: analyze,
      onDelete: async () => undefined
    }} /> : quickCreate && open ? <WorkspaceFrame title="Quick-create fixture" presentation="centered" onClose={() => setOpen(false)}>
      {editor}
    </WorkspaceFrame> : editor}
  </main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode>
  <WorkspaceNavigationProvider page="customerWork" definitions={workspaceDefinitions}><Harness /></WorkspaceNavigationProvider>
</StrictMode>);
