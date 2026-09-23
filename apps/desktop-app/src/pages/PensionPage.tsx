import { type ReactNode } from "react";
import { PensionPageContext, type usePensionPageController, type PensionMode } from "../components/pension/pension-page-state";
import { FeatureWorkspacePage } from "../components/workspace/FeatureWorkspacePage";
import { FeatureViewSelector } from "../components/workspace/FeatureViewSelector";

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
    <FeatureWorkspacePage label="Pansiyon yönetimi" bodyLabel={modes.find(item => item.id === activeMode)!.label}
      toolbar={<FeatureViewSelector items={modes.filter(item => item.enabled)} value={activeMode} onChange={setMode} label="Pansiyon görünümü" />}>
      {activeMode === "rooms" ? rooms : activeMode === "reservations" ? reservations : tasks}
    </FeatureWorkspacePage>
  </PensionPageContext.Provider>;
}
