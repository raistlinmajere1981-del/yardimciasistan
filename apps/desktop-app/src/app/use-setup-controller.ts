import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DesktopDashboardData, DesktopSetupData, SaveInitialSetupInput, DesktopSetupSaveResult } from "../../electron/database";
import { defaultSetupData } from "./bootstrap-defaults";

interface UseSetupControllerOptions {
  onInitialSetupRequired?: () => void;
  onInitialSetupReady?: () => void;
}

// App owner holds only canonical setup. Editable drafts belong to Settings lifetime.
export function useSetupController({ onInitialSetupRequired, onInitialSetupReady }: UseSetupControllerOptions = {}) {
  const [setupData, setSetupData] = useState<DesktopSetupData>(defaultSetupData);
  const saveInFlight = useRef(false);
  function applyBootstrapSetup(next: DesktopSetupData, firstApplicationLoad: boolean) {
    setSetupData(next);
    if (firstApplicationLoad) {
      if (next.setupRequired) onInitialSetupRequired?.();
      else onInitialSetupReady?.();
    }
  }
  async function saveSetup(input: SaveInitialSetupInput, setDashboardData: Dispatch<SetStateAction<DesktopDashboardData>>): Promise<DesktopSetupSaveResult> {
    const bridge = window.yardimciDesktop;
    if (!bridge) return { ok: false, message: "Ayarlar kaydedilemedi. Masaüstü uygulamasını yeniden başlatın." };
    if (saveInFlight.current) return { ok: false, message: "Ayarlar kaydediliyor." };
    saveInFlight.current = true;
    try {
      const result = await bridge.saveInitialSetup(input);
      if (result.ok) {
        setSetupData(result.setupData);
        setDashboardData(result.dashboardData);
      }
      return result;
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Ayarlar kaydedilemedi." };
    } finally {
      saveInFlight.current = false;
    }
  }
  function setPasswordConfigured(configured: boolean) {
    setSetupData(current => ({ ...current, appPasswordConfigured: configured }));
  }
  return { setupData, applyBootstrapSetup, saveSetup, setPasswordConfigured };
}
