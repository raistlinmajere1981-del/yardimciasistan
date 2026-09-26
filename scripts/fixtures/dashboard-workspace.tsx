import { createRoot } from "react-dom/client";
import type { AutomaticSyncStatus } from "../../apps/desktop-app/electron/sync-coordinator";
import type { DesktopDashboardData, DesktopSetupData } from "../../apps/desktop-app/electron/database";
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

  return (
    <DashboardPage
      data={control.__m8fInitial.dashboard}
      setupData={control.__m8fInitial.setup}
      automaticSyncStatus={control.__m8fInitial.syncStatus}
      features={{ rooms: true, tables: true, whatsapp: true, android: true }}
      aiEnabled
      customersEnabled
      requestsEnabled
      tasksEnabled
      calendarEnabled
      reservationsEnabled
      availableRoomCount={1}
      onReplyRequest={(request) => record("reply", request.id)}
      onOpenCustomerWork={(request) => record("customer-work", request?.id)}
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
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
