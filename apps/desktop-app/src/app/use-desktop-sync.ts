import { useDashboardSnapshot } from "./use-dashboard-snapshot";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import type { DesktopDashboardData, DesktopSetupData } from "../../electron/database";
import type { AutomaticSyncStatus } from "../../electron/sync-coordinator";
import { defaultDashboardData } from "./bootstrap-defaults";
import { defaultAutomaticSyncStatus, type AppAccessPhase, type SyncState } from "./runtime-state";
import type { SettingsSetupSaveResult } from "./settings-save";

interface UseDesktopSyncOptions {
  accessPhase: AppAccessPhase;
  setSyncState: Dispatch<SetStateAction<SyncState>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
  onBootstrapSetup: (
    setup: DesktopSetupData,
    firstApplicationLoad: boolean
  ) => void;
  onDashboardLoaded?: (dashboardData: DesktopDashboardData) => void;
}

export function useDesktopSync({
  accessPhase,
  setSyncState,
  setStatusMessage,
  onBootstrapSetup,
  onDashboardLoaded
}: UseDesktopSyncOptions) {
  const appDataInitializedRef = useRef(false);
  const onBootstrapSetupRef = useRef(onBootstrapSetup);
  const onDashboardLoadedRef = useRef(onDashboardLoaded);
  const [dashboardData, setDashboardData] = useDashboardSnapshot(defaultDashboardData);
  const [businessCapabilities, setBusinessCapabilities] = useState<BusinessCapabilitySnapshot | null>(null);
  const capabilityGeneration = useRef(0);
  const capabilityMutations = useRef(0);
  const setupGeneration = useRef(0);
  const [automaticSyncStatus, setAutomaticSyncStatus] = useState<AutomaticSyncStatus>(defaultAutomaticSyncStatus);

  onBootstrapSetupRef.current = onBootstrapSetup;
  onDashboardLoadedRef.current = onDashboardLoaded;

  const loadDashboardData = useCallback(async () => {
    const bridge = window.yardimciDesktop;
    if (!bridge) {
      return undefined;
    }

    const nextDashboardData = await bridge.getDashboardData();
    setDashboardData(nextDashboardData);
    onDashboardLoadedRef.current?.(nextDashboardData);
    return nextDashboardData;
  }, []);

  const loadBusinessCapabilities = useCallback(async () => {
    const bridge = window.yardimciDesktop;
    if (!bridge?.getBusinessCapabilitySnapshot) {
      return undefined;
    }
    const duringMutation = capabilityMutations.current > 0;
    const generation = duringMutation ? capabilityGeneration.current : ++capabilityGeneration.current;
    const snapshot = await bridge.getBusinessCapabilitySnapshot();
    if (!duringMutation && capabilityMutations.current === 0 && generation === capabilityGeneration.current) setBusinessCapabilities(snapshot);
    return snapshot;
  }, []);

  const saveSetupWithCapabilityRefresh = useCallback(async (
    save: () => Promise<SettingsSetupSaveResult>
  ): Promise<SettingsSetupSaveResult> => {
    const generation = ++capabilityGeneration.current;
    setupGeneration.current += 1;
    capabilityMutations.current += 1;
    try {
      const result = await save();
      if (!result.ok) return result;
      // One canonical refresh after commit. Pre-save reads cannot restore the old
      // profile, including while this save awaits web I/O. Fail closed on refresh failure.
      try {
        const snapshot = await window.yardimciDesktop?.getBusinessCapabilitySnapshot();
        if (!snapshot) throw new Error("İşletme yetenekleri okunamadı.");
        if (generation === capabilityGeneration.current) setBusinessCapabilities(snapshot);
      } catch {
        if (generation === capabilityGeneration.current) setBusinessCapabilities(null);
        return { ...result, refreshWarning: "Ayarlar kaydedildi; işletme yetenekleri yenilenemedi. Sayfayı yeniden açın." };
      }
      return result;
    } finally { capabilityMutations.current -= 1; }
  }, []);

  useEffect(() => {
    if (accessPhase !== "unlocked") {
      return;
    }

    const bridge = window.yardimciDesktop;
    if (!bridge) {
      return;
    }

    let active = true;
    const reportInitialError = (message: string) => {
      if (!active) return;
      setSyncState("error");
      setStatusMessage(message);
    };

    const loadInitialCapabilitySnapshot = async () => {
      try {
        return await loadBusinessCapabilities();
      } catch {
        // main-entry registers capability IPC just after main.ts becomes ready.
        // Keep a single short retry for the very small first-render race.
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (!active) return undefined;
        return loadBusinessCapabilities();
      }
    };

    const initialSetupGeneration = setupGeneration.current;
    void Promise.all([
      bridge.getBootstrapData(),
      loadInitialCapabilitySnapshot()
    ])
      .then(([data, capabilitySnapshot]) => {
        if (!active || initialSetupGeneration !== setupGeneration.current) return;
        if (!capabilitySnapshot) {
          throw new Error("İşletme yetenekleri okunamadı.");
        }
        const firstApplicationLoad = !appDataInitializedRef.current;
        setDashboardData((current) => ({
          ...current,
          databasePath: data.databasePath,
          backupPath: data.backupPath,
          webModuleUrl: data.syncSettings.webModuleUrl
        }));
        onBootstrapSetupRef.current(
          data.setup,
          firstApplicationLoad
        );
        appDataInitializedRef.current = true;
      })
      .catch(() => {
        reportInitialError("Başlangıç ayarları ve işletme yetenekleri birlikte okunamadı. Yerel veriler korunuyor; uygulamayı yeniden başlatmayı deneyin.");
      });

    void loadDashboardData().catch(() => {
      reportInitialError("Yerel işletme verileri okunamadı. Uygulamayı yeniden başlatmayı deneyin.");
    });

    void bridge.getSyncStatus?.()
      .then((status) => {
        if (active) setAutomaticSyncStatus(status);
      })
      .catch(() => {
        if (!active) return;
        setAutomaticSyncStatus((current) => ({
          ...current,
          phase: "error",
          message: "Eşitleme durumu okunamadı. İnternet ve web bağlantısı ayarlarını kontrol edin."
        }));
      });

    const unsubscribeDashboard = bridge.onDashboardDataChanged?.((nextDashboardData) => {
      if (active) setDashboardData(nextDashboardData);
    });
    const unsubscribeSync = bridge.onSyncStatusChanged?.((nextStatus) => {
      if (active) setAutomaticSyncStatus(nextStatus);
    });

    return () => {
      active = false;
      capabilityGeneration.current += 1;
      unsubscribeDashboard?.();
      unsubscribeSync?.();
    };
  }, [accessPhase, loadBusinessCapabilities, loadDashboardData, setStatusMessage, setSyncState]);

  const pullRequests = useCallback(async () => {
    setSyncState("loading");
    setStatusMessage("");

    const bridge = window.yardimciDesktop;
    if (!bridge) {
      setSyncState("error");
      setStatusMessage("Masaüstü uygulaması hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    try {
      if (bridge.runSyncNow) {
        const cycle = await bridge.runSyncNow();
        setAutomaticSyncStatus(cycle.status);
        try {
          await Promise.all([loadDashboardData(), loadBusinessCapabilities()]);
        } catch {
          setSyncState("error");
          setStatusMessage(cycle.ok
            ? "Eşitleme tamamlandı ancak ekran verileri yenilenemedi. Uygulamayı yeniden başlatmayı deneyin."
            : `${cycle.message} Ekran verileri de yenilenemedi.`);
          return;
        }
        if (cycle.ok) {
          setSyncState("idle");
          setStatusMessage("");
        } else {
          setSyncState("error");
          setStatusMessage(cycle.message);
        }
        return;
      }

      const result = await bridge.pullRequests();
      if (!result.ok) {
        setSyncState("error");
        setStatusMessage(result.message);
        return;
      }

      try {
        await Promise.all([loadDashboardData(), loadBusinessCapabilities()]);
      } catch {
        setSyncState("error");
        setStatusMessage("Web talepleri alındı ancak ekran verileri yenilenemedi. Uygulamayı yeniden başlatmayı deneyin.");
        return;
      }
      setSyncState("idle");
      setStatusMessage("");
    } catch {
      setSyncState("error");
      setStatusMessage("Bağlantı kontrol edilemedi. İnternet ve web modülü ayarlarını kontrol edip yeniden deneyin.");
    }
  }, [loadBusinessCapabilities, loadDashboardData, setStatusMessage, setSyncState]);

  return {
    dashboardData,
    setDashboardData,
    businessCapabilities,
    loadBusinessCapabilities,
    saveSetupWithCapabilityRefresh,
    automaticSyncStatus,
    loadDashboardData,
    pullRequests
  };
}
