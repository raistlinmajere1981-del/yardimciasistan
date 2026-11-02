import { createRoot } from "react-dom/client";
import type { AutomaticSyncStatus } from "../../apps/desktop-app/electron/sync-coordinator";
import type { DesktopDashboardData, DesktopSetupData } from "../../apps/desktop-app/electron/database";
import { AppShell } from "../../apps/desktop-app/src/components/layout/AppShell";
import { Sidebar } from "../../apps/desktop-app/src/components/layout/Sidebar";
import { PageHeader } from "../../apps/desktop-app/src/components/layout/PageHeader";
import { DashboardPage } from "../../apps/desktop-app/src/pages/DashboardPage";
import "../../apps/desktop-app/src/styles/index.css";

type ActionRecord = { kind: string; id?: string };

const control = window as typeof window & {
  __m8fInitial: {
    dashboard: DesktopDashboardData;
    setup: DesktopSetupData;
    syncStatus: AutomaticSyncStatus;
  };
  __m8fActions?: ActionRecord[];
};

function Harness() {
  const actions = control.__m8fActions ??= [];
  const record = (kind: string, id?: string) => actions.push({ kind, id });

  const sideEnabled = !new URLSearchParams(location.search).has("noSide");
  return (
    <AppShell contentScroll="workspace" sidebar={<Sidebar items={[]} activePage="dashboard" businessName="Dashboard fixture" onNavigate={() => {}} />} header={<PageHeader title="Ana Sayfa" />}>
      <DashboardPage
        data={control.__m8fInitial.dashboard}
        setupData={sideEnabled ? control.__m8fInitial.setup : { ...control.__m8fInitial.setup, webModuleUrl: "", syncSecret: "" }}
        automaticSyncStatus={control.__m8fInitial.syncStatus}
        features={{ rooms: sideEnabled, tables: sideEnabled, whatsapp: sideEnabled, android: sideEnabled }}
        aiEnabled={sideEnabled}
        customersEnabled={sideEnabled}
        requestsEnabled
        tasksEnabled
        calendarEnabled={sideEnabled}
        reservationsEnabled
        availableRoomCount={1}
        onReplyRequest={(request) => record("reply", request.id)}
        onOpenCustomerWork={(request) => record("customer-work", request?.id)}
        onOpenKbs={() => record("kbs")}
        onOpenReservation={(reservation) => record("reservation", reservation.id)}
        onCompleteTask={(taskId) => record("task-complete", taskId)}
        onGenerateDailyAi={() => record("daily-ai")}
        dailyAiState="idle"
        dailyAiMessage=""
        dailyAiContent=""
        dailyAiFallback={false}
        onPrepareBirthday={(customerId) => record("birthday", customerId)}
        formatRequestType={(value) => value}
        formatRequestStatus={(value) => value}
        getRequestStatusTone={() => "neutral"}
        isRequestWaitingForReply={(status) => ["new", "seen", "waiting_owner", "pending", "in_progress"].includes(status)}
        formatTaskDue={(task) => [task.dueDate, task.dueTime].filter(Boolean).join(" ")}
        formatReservationDate={(reservation) => [reservation.startDate, reservation.time].filter(Boolean).join(" ")}
      />
    </AppShell>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
