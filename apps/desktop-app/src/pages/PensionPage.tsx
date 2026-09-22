import { type ReactNode } from "react";
import { PensionPageContext, type usePensionPageController, type PensionMode } from "../components/pension/pension-page-state";
import { ActionButton } from "../components/ui/ActionButton";

interface PensionPageProps {
  controller: ReturnType<typeof usePensionPageController>;
  reservationsEnabled: boolean;
  tasksEnabled: boolean;
  reservations: ReactNode;
  rooms: ReactNode;
  tasks: ReactNode;
}

export function PensionPage({ controller, reservationsEnabled, tasksEnabled, reservations, rooms, tasks }: PensionPageProps) {
  const { mode, setMode } = controller;
  const modes: { id: PensionMode; label: string; enabled: boolean }[] = [
    { id: "rooms", label: "Odalar", enabled: true },
    { id: "reservations", label: "Rezervasyonlar", enabled: reservationsEnabled },
    { id: "daily-tasks", label: "Günlük İşler", enabled: tasksEnabled }
  ];
  const activeMode = modes.find(item => item.id === mode && item.enabled)?.id ?? "rooms";
  return <PensionPageContext.Provider value={{ ...controller, mode: activeMode }}>
    <section className="pension-page" aria-label="Pansiyon yönetimi">
      <nav className="page-toolbar" aria-label="Pansiyon görünümü">
        <div className="action-row">{modes.filter(item => item.enabled).map(item =>
          <ActionButton key={item.id} variant={activeMode === item.id ? "primary" : "secondary"}
            aria-pressed={activeMode === item.id} onClick={() => setMode(item.id)}>{item.label}</ActionButton>
        )}</div>
      </nav>
      <div className="pension-workspace-body" role="region" aria-label={modes.find(item => item.id === activeMode)?.label}>
        {activeMode === "rooms" ? rooms : activeMode === "reservations" ? reservations : tasks}
      </div>
    </section>
  </PensionPageContext.Provider>;
}
