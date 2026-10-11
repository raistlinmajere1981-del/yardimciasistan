import { createRoot } from "react-dom/client";
import { useState } from "react";
import { defaultDashboardData } from "../../apps/desktop-app/src/app/bootstrap-defaults";
import { useKbsNotificationController } from "../../apps/desktop-app/src/app/use-kbs-notification-controller";
import { KbsAutomationWorkspace } from "../../apps/desktop-app/src/components/customers/KbsAutomationWorkspace";
import { CustomerMessagingPreferences } from "../../apps/desktop-app/src/components/customers/CustomerMessagingPreferences";
import { BusinessTemplateMessagePanel } from "../../apps/desktop-app/src/components/customers/BusinessTemplateMessagePanel";
import { CustomerCreditPanel } from "../../apps/desktop-app/src/components/customers/CustomerCreditPanel";
import { DiagnosticsViewer } from "../../apps/desktop-app/src/components/diagnostics/DiagnosticsViewer";
import { WorkspaceNavigationProvider } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { MarketingPage } from "../../apps/desktop-app/src/pages/MarketingPage";
import "../../apps/desktop-app/src/styles/index.css";

const params = new URLSearchParams(location.search);
const mode = params.get("mode");
const fixture = window.uiFixture = { calls: [], fail: !params.has("success"), delay: false, finish: () => {}, notify: () => {}, requestSession: () => {} };
const wait = async () => { if (fixture.delay) await new Promise<void>(resolve => { fixture.finish = resolve; }); };
const account = {
  customer: { id: "customer-1", fullName: "Fixture Customer", phone: "+905550001001", email: "", notes: "", tags: [], createdAt: "", updatedAt: "", deletedAt: "" },
  balances: [{ currency: "TRY", amountMinor: 10000 }], entries: []
};
const session = { sessionId: "fixture-session", current: true, startedAt: "2026-10-07T00:00:00.000Z", endedAt: "", appVersion: "2.0.2", electronVersion: "43", nodeVersion: "24", platform: "linux", arch: "x64", packaged: false, eventCount: 1, warnCount: 0, errorCount: 1 };
const event = { timestamp: "2026-10-07T00:00:00.000Z", sequence: 1, level: "ERROR", process: "main", scope: "fixture", event: "fixture.failed", message: "Fixture failure" };
window.yardimciDesktop = {
  registerKbsWebview: () => {}, unregisterKbsWebview: () => {},
  inspectEgmKbsSession: async () => {
    fixture.calls.push("inspect"); await wait();
    if (fixture.fail && params.get("failure") !== "login") throw new Error("Fixture inspect rejection");
    return { state: params.get("failure") === "login" ? "login_required" : params.get("failure") === "otp" ? "otp_required" : "authenticated", message: "Fixture authenticated" };
  },
  prepareStoredEgmKbsLogin: async () => {
    fixture.calls.push("login"); await wait();
    if (fixture.fail) throw new Error("Fixture login rejection");
    return { message: "Fixture login prepared" };
  },
  getBusinessMessagingConfiguration: async () => {
    fixture.calls.push("configuration"); await wait();
    if (fixture.fail) throw new Error("Fixture configuration rejection");
    return { enabled: params.get("enabled") !== "false", configured: params.get("configured") === "true" };
  },
  getSmsConfiguration: async () => ({enabled: params.get("sms") === "true"}),
  getCustomerMessagingPreference: async (_customer, channel) => ({ok:true,value:{status:channel === "whatsapp" ? "unknown" : "opted_out"}}),
  saveCustomerMessagingPreference: async (input) => ({ok:true,value:{status:input.status}}),
  onBusinessMessagingChanged: listener => { fixture.notify = listener; return () => {}; },
  listBusinessMessagingTemplates: async () => ({ ok: true, value: params.has("template") ? [{ name: "fixture_template", language: "tr", category: "UTILITY", status: "APPROVED", supported: true, components: [{ type: "body", text: "Merhaba {{1}}", parameters: ["1"] }] }] : [] }),
  listDiagnosticSessions: async () => [session],
  readDiagnosticSession: async () => { fixture.calls.push("diagnostics"); await wait(); return { session, events: [event], hasMore: false }; },
  getSupportReportDraft: async () => ({ sessionCount: 1, totalLogBytes: 256, screenshot: null }),
  sendKbsNotification: async id => { fixture.calls.push(`send:${id}`); return { ok: true, state: "sent", message: "Fixture notification sent", dashboardData: defaultDashboardData }; },
  commerce: {
    getCustomerCreditAccount: async () => { fixture.calls.push("credit-read"); await wait(); return account; },
    prepareCustomerCreditWhatsApp: async () => { fixture.calls.push("credit-share"); await wait(); return { status: "ready", account, action: { ok: true, mode: "manual_copy", message: "Fixture credit draft" } }; }
  }
};
if (mode === "business") fixture.delay = true;
if (params.has("missing-bridge")) {
  delete window.yardimciDesktop.getBusinessMessagingConfiguration;
  delete window.yardimciDesktop.onBusinessMessagingChanged;
}
const noop = () => {};
function KbsFixture() {
  const [request, setRequest] = useState(params.has("retry") ? 1 : 0);
  fixture.requestSession = () => setRequest(current => current + 1);
  const controller = useKbsNotificationController({ setDashboardData: noop, setSyncState: noop, setStatusMessage: noop });
  return <KbsAutomationWorkspace data={{ ...defaultDashboardData, kbsOverview: { ...defaultDashboardData.kbsOverview, enabled: true, configured: true } }} controller={controller}
    egmSessionRequest={request} sessionRetryNotificationId={params.has("retry") ? "notification-1" : ""} onSessionRetryConsumed={() => fixture.calls.push("retry-consumed")} />;
}
const content = mode === "kbs"
  ? <KbsFixture />
  : mode === "business" ? <BusinessTemplateMessagePanel customerId="customer-1" disabled={false} onBusyChange={noop} />
  : mode === "preferences" ? <CustomerMessagingPreferences customerId="customer-1" disabled={false} onBusyChange={noop} />
  : mode === "marketing" ? <MarketingPage enabled={false} />
  : mode === "diagnostics" ? <DiagnosticsViewer onClose={noop} />
  : <CustomerCreditPanel customerId="customer-1" whatsappEnabled />;
createRoot(document.getElementById("root")!).render(<WorkspaceNavigationProvider page="customerWork" definitions={[]}>{content}</WorkspaceNavigationProvider>);
