import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { DesktopDashboardData } from "../../apps/desktop-app/electron/database";
import { useCalendarPageController } from "../../apps/desktop-app/src/components/calendar/calendar-page-state";
import { OperationCalendarPage } from "../../apps/desktop-app/src/pages/OperationCalendarPage";
import "../../apps/desktop-app/src/styles/index.css";

const control = window as typeof window & {
  __m8gInitial: { dashboard: DesktopDashboardData };
  __m8gActions?: Array<{ kind: string; id: string }>;
};

function Harness() {
  const controller = useCalendarPageController();
  const [visible, setVisible] = useState(true);
  const actions = control.__m8gActions ??= [];

  return (
    <main>
      <button type="button" onClick={() => setVisible((current) => !current)}>
        {visible ? "Takvimi Gizle" : "Takvimi Göster"}
      </button>
      {visible ? (
        <OperationCalendarPage
          controller={controller}
          data={control.__m8gInitial.dashboard}
          accommodationReservationsEnabled
          foodReservationsEnabled
          tasksEnabled
          onOpenReservation={(reservation) => actions.push({ kind: "reservation", id: reservation.id })}
          onCompleteTask={(taskId) => actions.push({ kind: "task", id: taskId })}
        />
      ) : (
        <p data-testid="outside-calendar">Takvim sunumu kapalı.</p>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
