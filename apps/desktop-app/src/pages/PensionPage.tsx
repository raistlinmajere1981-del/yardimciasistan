import type { ReactNode } from "react";
import { OperationsBoardLayout } from "../components/operations/OperationsBoardLayout";
import { PensionPageContext, type usePensionPageController } from "../components/pension/pension-page-state";
import { FeatureWorkspacePage } from "../components/workspace/FeatureWorkspacePage";

interface PensionPageProps {
  controller: ReturnType<typeof usePensionPageController>;
  reservationsEnabled: boolean;
  tasksEnabled: boolean;
  reservations: ReactNode;
  rooms: ReactNode;
  tasks: ReactNode;
}

export function PensionPage({
  controller,
  reservationsEnabled,
  tasksEnabled,
  reservations,
  rooms,
  tasks
}: PensionPageProps) {
  return (
    <PensionPageContext.Provider value={controller}>
      <FeatureWorkspacePage label="Pansiyon yönetimi" bodyLabel="Pansiyon operasyonları">
        <OperationsBoardLayout
          left={reservationsEnabled ? {
            title: "Rezervasyonlar",
            ariaLabel: "Pansiyon rezervasyonları",
            content: reservations
          } : null}
          center={{
            title: "Odalar",
            ariaLabel: "Odalar paneli",
            content: rooms
          }}
          right={tasksEnabled ? {
            title: "Günlük İşler",
            ariaLabel: "Pansiyon günlük işleri",
            content: tasks
          } : null}
        />
      </FeatureWorkspacePage>
    </PensionPageContext.Provider>
  );
}
