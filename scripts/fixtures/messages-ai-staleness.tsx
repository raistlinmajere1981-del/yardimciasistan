import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { DesktopDashboardData } from "../../apps/desktop-app/electron/database";
import { useMessagingController } from "../../apps/desktop-app/src/app/use-messaging-controller";

type MessagingController = ReturnType<typeof useMessagingController>;

const control = window as typeof window & {
  __m8eInitial: { dashboard: DesktopDashboardData };
  __m8eController?: MessagingController;
  __m8eDashboard?: DesktopDashboardData;
  __m8eFlags?: { aiEnabled: boolean; customersEnabled: boolean; whatsappEnabled: boolean; customerCreditEnabled: boolean };
  __m8eSetFlags?: (patch: Partial<{ aiEnabled: boolean; customersEnabled: boolean; whatsappEnabled: boolean; customerCreditEnabled: boolean }>) => void;
};

function Harness() {
  const [dashboardData, setDashboardData] = useState(control.__m8eInitial.dashboard);
  const [syncState, setSyncState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [flags, setFlags] = useState({
    aiEnabled: true,
    customersEnabled: true,
    whatsappEnabled: true,
    customerCreditEnabled: true
  });

  const controller = useMessagingController({
    dashboardData,
    setDashboardData,
    setSyncState,
    setStatusMessage,
    messagesActive: true,
    aiEnabled: flags.aiEnabled,
    customersEnabled: flags.customersEnabled,
    whatsappEnabled: flags.whatsappEnabled,
    customerCreditEnabled: flags.customerCreditEnabled,
    onOpenMessages: () => undefined
  });

  control.__m8eController = controller;
  control.__m8eDashboard = dashboardData;
  control.__m8eFlags = flags;
  control.__m8eSetFlags = (patch) => setFlags((current) => ({ ...current, ...patch }));

  return (
    <main>
      <p data-testid="sync-state">{syncState}</p>
      <p data-testid="status-message">{statusMessage}</p>
      <p data-testid="selected-whatsapp">{controller.selectedWhatsAppRequestId}</p>
      <p data-testid="workspace-request">{controller.aiWorkspaceRequestId}</p>
      <p data-testid="workspace-mode">{controller.aiWorkspaceMode}</p>
      <p data-testid="workspace-content">{controller.aiWorkspaceContent}</p>
      <p data-testid="workspace-state">{controller.aiWorkspaceState}</p>
      <p data-testid="reply-state">{controller.aiState}</p>
      <p data-testid="birthday-preparing">{controller.birthdayPreparingId}</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
