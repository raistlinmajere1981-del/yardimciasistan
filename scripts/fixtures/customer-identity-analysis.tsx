import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { DesktopCustomer, DesktopIdentityImageAnalyzeInput, DesktopIdentityImageAnalyzeResult, SaveCustomerInput } from "../../apps/desktop-app/electron/database";
import { defaultDashboardData } from "../../apps/desktop-app/src/app/bootstrap-defaults";
import { toCustomerForm } from "../../apps/desktop-app/src/app/customer-model";
import { useCustomerController } from "../../apps/desktop-app/src/app/use-customer-controller";
import type { SyncState } from "../../apps/desktop-app/src/app/runtime-state";
import { customerWorkspaceDefinition, workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
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

function Harness({ initialId, reset, page }: { initialId: string; reset: (id?: string) => void; page: "pension" | "customerWork" }) {
  const navigation = useWorkspaceNavigation();
  const [dashboardData, setDashboardData] = useState(data);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedWhatsAppRequestId, setSelectedWhatsAppRequestId] = useState("");
  const { handleAnalyzeIdentityImage: analyze } = useCustomerController({
    dashboardData, setDashboardData, setSyncState, setStatusMessage,
    selectedWhatsAppRequestId, setSelectedWhatsAppRequestId
  });
  const openCustomer = useCallback((id: string, mode: "main" | "create" = "main") => navigation.openWorkspace({
    entityType: "customer", entityId: id, mode, returnContext: page === "pension" ? { page, view: "rooms" } : { page }
  }), [navigation, page]);
  useEffect(() => { if (initialId) openCustomer(initialId); }, [initialId, openCustomer]);
  // Simulate an owner teardown or entity replacement, independently of the UI close guard.
  control.customerIdentity.closeEditor = () => reset();
  control.customerIdentity.openCustomer = id => { reset(id); return true; };
  return <main>
    <p data-testid="identity-global-status">{syncState}: {statusMessage}</p>
    <button type="button" onClick={() => openCustomer("new-customer", "create")}>Müşteri formunu aç</button>
    <WorkspaceHost definition={customerWorkspaceDefinition} context={{
      data: dashboardData, aiEnabled: true, whatsappEnabled: false, reservationsEnabled: false, staysEnabled: true,
      customerCreditEnabled: false, onWhatsApp: () => {}, onSave: save, onAnalyzeIdentity: analyze,
      onDelete: async () => undefined
    }} />
  </main>;
}

function Fixture() {
  const [session, setSession] = useState({ generation: 0, initialId: "" });
  const page = new URLSearchParams(location.search).get("mode") === "quick-create" ? "pension" : "customerWork";
  return <WorkspaceNavigationProvider key={session.generation} page={page} definitions={workspaceDefinitions}>
    <Harness page={page} initialId={session.initialId} reset={(id = "") => setSession(previous => ({ generation: previous.generation + 1, initialId: id }))} />
  </WorkspaceNavigationProvider>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
