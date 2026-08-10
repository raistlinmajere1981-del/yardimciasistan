import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DesktopDashboardData, DesktopSetupData } from "../../electron/database";
import type { AutomaticSyncStatus } from "../../electron/sync-coordinator";
import { defaultDashboardData } from "./bootstrap-defaults";
import { defaultAutomaticSyncStatus, type AppAccessPhase, type SyncState } from "./runtime-state";

interface UseDesktopSyncOptions {
  accessPhase: AppAccessPhase;
  setSyncState: Dispatch<SetStateAction<SyncState>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
  onBootstrapSetup: (setup: DesktopSetupData, firstApplicationLoad: boolean) => void;
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
  const [dashboardData, setDashboardData] = useState<DesktopDashboardData>(defaultDashboardData);
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

    void bridge.getBootstrapData()
      .then((data) => {
        if (!active) return;
        const firstApplicationLoad = !appDataInitializedRef.current;
        setDashboardData((current) => ({
          ...current,
          databasePath: data.databasePath,
          backupPath: data.backupPath,
          webModuleUrl: data.syncSettings.webModuleUrl
        }));
        onBootstrapSetupRef.current(data.setup, firstApplicationLoad);
        appDataInitializedRef.current = true;
      })
      .catch(() => {
        reportInitialError("Başlangıç ayarları okunamadı. Yerel veriler korunuyor; uygulamayı yeniden başlatmayı deneyin.");
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
          message: "Senkron durumu okunamadı. Şimdi Eşitle ile yeniden deneyin."
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
      unsubscribeDashboard?.();
      unsubscribeSync?.();
    };
  }, [accessPhase, loadDashboardData, setStatusMessage, setSyncState]);

  const pullRequests = useCallback(async () => {
    setSyncState("loading");
    setStatusMessage("Web talepleri kontrol ediliyor...");

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
          await loadDashboardData();
        } catch {
          setSyncState("error");
          setStatusMessage(cycle.ok
            ? "Eşitleme tamamlandı ancak ekran verileri yenilenemedi. Uygulamayı yeniden başlatmayı deneyin."
            : `${cycle.message} Ekran verileri de yenilenemedi.`);
          return;
        }
        setSyncState(cycle.ok ? "success" : "error");
        setStatusMessage(cycle.message);
        return;
      }

      const result = await bridge.pullRequests();
      if (!result.ok) {
        setSyncState("error");
        setStatusMessage(result.message);
        return;
      }

      try {
        await loadDashboardData();
      } catch {
        setSyncState("error");
        setStatusMessage("Web talepleri alındı ancak ekran verileri yenilenemedi. Uygulamayı yeniden başlatmayı deneyin.");
        return;
      }
      setSyncState("success");
      setStatusMessage(result.count > 0 ? `${result.count} talep alındı.` : "Yeni talep bulunmuyor.");
    } catch {
      setSyncState("error");
      setStatusMessage("Senkron bağlantısı kontrol edilemedi. İnternet ve web modülü ayarlarını kontrol edip yeniden deneyin.");
    }
  }, [loadDashboardData, setStatusMessage, setSyncState]);

  return {
    dashboardData,
    setDashboardData,
    automaticSyncStatus,
    loadDashboardData,
    pullRequests
  };
}
