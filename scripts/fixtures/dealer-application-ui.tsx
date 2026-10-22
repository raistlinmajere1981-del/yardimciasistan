import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { DesktopDashboardData } from "../../apps/desktop-app/electron/database";
import { WorkspaceNavigationProvider } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { RequestsWorkspace } from "../../apps/desktop-app/src/components/customers/RequestsWorkspace";
import { CustomerHistoryView } from "../../apps/desktop-app/src/components/customers/CustomerHistoryView";
import { initialManualRequestForm } from "../../apps/desktop-app/src/app/request-model";
import "../../apps/desktop-app/src/styles/index.css";
const control = window as typeof window & { __applicationData: DesktopDashboardData; __applicationId: string; __applicationCall: (method: string, args: unknown[]) => Promise<unknown> };
function Harness() {
  const [data, setData] = useState(control.__applicationData);
  const [history, setHistory] = useState(false);
  const request = data.requests.find(item => item.id === control.__applicationId)!;
  return <main style={{ height: "100vh", display: "flex", flexDirection: "column", padding: 16 }}>
    <button onClick={() => setHistory(value => !value)}>{history ? "Taleplere dön" : "Müşteri geçmişi"}</button>
    {history ? <CustomerHistoryView requests={data.requests.filter(item => item.customer_id === request.customer_id)} reservations={[]} stays={[]} reservationsEnabled={false} staysEnabled={false} onOpenStay={() => {}} />
      : <RequestsWorkspace requests={[request]} selectedRequest={request} aiEnabled={false} whatsappEnabled={false} enabledCapabilities={["core.customers", "customer.requests", "commerce.wholesale"]}
        convertingRequestId="" suggestingRequestId="" aiState="idle" aiMessage="" manualRequestForm={initialManualRequestForm} manualRequestState="idle"
        onSelectRequest={() => {}} onManualRequestFormChange={() => {}} onCreateManualRequest={() => Promise.resolve(false)} onWhatsApp={() => {}} onConvert={() => {}} onSuggest={() => {}} onRewrite={() => {}} onOpenReservation={() => {}} onDelete={() => {}}
        onUpdateStatus={(request,status) => { void control.__applicationCall("status", [request.id,status]).then(value => { const result = value as {ok:boolean;dashboardData:DesktopDashboardData}; if(result.ok) setData(result.dashboardData); }); }}
        onApproveDealer={async (id,group) => { const result = await window.yardimciDesktop!.approveDealerApplication(id,group); if(result.ok) setData(result.dashboardData); return result; }} />}
  </main>;
}
createRoot(document.getElementById("root")!).render(<WorkspaceNavigationProvider page="customerWork" definitions={workspaceDefinitions}><Harness /></WorkspaceNavigationProvider>);
