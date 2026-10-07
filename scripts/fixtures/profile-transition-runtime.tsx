import { useState } from "react";
import { createRoot } from "react-dom/client";
import { getBusinessProfile, type BusinessCapability } from "@yardimci-asistan/shared";
import { useDesktopSync } from "../../apps/desktop-app/src/app/use-desktop-sync";
import { buildNavigation } from "../../apps/desktop-app/src/app/navigation";
import { defaultDashboardData, defaultSetupData } from "../../apps/desktop-app/src/app/bootstrap-defaults";
import type { BusinessCapabilitySnapshot } from "../../apps/desktop-app/electron/business-capability-store";
import type { SyncState } from "../../apps/desktop-app/src/app/runtime-state";

const snapshot = (profileId: string): BusinessCapabilitySnapshot => ({ businessId: "fixture", profileId,
  enabledCapabilities: getBusinessProfile(profileId).defaultCapabilities, capabilities: [] });
let current = snapshot("pension");
let holdRead = false;
let pendingRead: (() => void) | undefined;
let finishSave: (() => void) | undefined;
let failRefresh = false;
Object.assign(window, {
  yardimciDesktop: {
    getBusinessCapabilitySnapshot: async () => {
      if (failRefresh) throw new Error("Injected refresh failure");
      const captured = structuredClone(current);
      if (holdRead) { holdRead = false; await new Promise<void>(resolve => { pendingRead = resolve; }); }
      return captured;
    },
    setBusinessCapability: async (capability: BusinessCapability, enabled: boolean) => {
      current = { ...current, enabledCapabilities: current.enabledCapabilities.filter(candidate => candidate !== capability) };
      if (enabled) current.enabledCapabilities.push(capability);
      return structuredClone(current);
    },
    getBootstrapData: async () => ({ setup: { ...defaultSetupData, profileId: "pension" }, syncSettings: {} }),
    getDashboardData: async () => defaultDashboardData
  },
  holdCapabilityRead: () => { holdRead = true; },
  releaseCapabilityRead: () => { pendingRead?.(); pendingRead = undefined; },
  finishProfileSave: () => { finishSave?.(); finishSave = undefined; },
  failCapabilityRefresh: () => { failRefresh = true; }
});

function Fixture() {
  const [, setSyncState] = useState<SyncState>("idle");
  const [, setStatusMessage] = useState("");
  const sync = useDesktopSync({ accessPhase: "unlocked", setSyncState, setStatusMessage, onBootstrapSetup: () => undefined });
  Object.assign(window, {
    readCapabilities: sync.loadBusinessCapabilities,
    changeRuntimeCapability: sync.setRuntimeBusinessCapability,
    saveProfile: (profileId: string, fail = false) => sync.saveSetupWithCapabilityRefresh(async () => {
      await new Promise<void>(resolve => { finishSave = resolve; });
      if (fail) return { ok: false, message: "Injected save failure" };
      current = snapshot(profileId);
      return { ok: true, message: "Saved", setupData: { ...defaultSetupData, profileId }, dashboardData: defaultDashboardData };
    })
  });
  return <>
    <output aria-label="Runtime profile">{sync.businessCapabilities?.profileId ?? "unavailable"}</output>
    <output aria-label="Runtime navigation">{buildNavigation(sync.businessCapabilities).map(item => item.id).join(",")}</output>
  </>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
