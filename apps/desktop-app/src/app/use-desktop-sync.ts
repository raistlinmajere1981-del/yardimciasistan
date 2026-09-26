import { useDashboardSnapshot } from "./use-dashboard-snapshot";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { BusinessCapability } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import type { DesktopDashboardData, DesktopSetupData } from "../../electron/database";
import type { AutomaticSyncStatus } from "../../electron/sync-coordinator";
import { defaultDashboardData } from "./bootstrap-defaults";
import { defaultAutomaticSyncStatus, type AppAccessPhase, type SyncState } from "./runtime-state";

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
  const [businessCapabilityState, setBusinessCapabilityState] = useState<SyncState>("idle");
  const [businessCapabilityMessage, setBusinessCapabilityMessage] = useState("İşletme yetenekleri profil varsayımlarını kullanıyor.");
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
    const snapshot = await bridge.getBusinessCapabilitySnapshot();
    setBusinessCapabilities(snapshot);
    return snapshot;
  }, []);

  const setRuntimeBusinessCapability = useCallback(async (capability: BusinessCapability, enabled: boolean) => {
    const bridge = window.yardimciDesktop;
    if (!bridge?.setBusinessCapability) {
      setBusinessCapabilityState("error");
      setBusinessCapabilityMessage("İşletme yetenekleri değiştirilemiyor. Uygulamayı yeniden başlatın.");
      return undefined;
    }

    setBusinessCapabilityState("loading");
    setBusinessCapabilityMessage(`${capability} ${enabled ? "açılıyor" : "kapatılıyor"}...`);
    try {
      const snapshot = await bridge.setBusinessCapability(capability, enabled);
      setBusinessCapabilities(snapshot);
      setBusinessCapabilityState("success");
      setBusinessCapabilityMessage(`${capability} ${enabled ? "etkinleştirildi" : "kapatıldı"}.`);
      return snapshot;
    } catch (error) {
      setBusinessCapabilityState("error");
      setBusinessCapabilityMessage(error instanceof Error ? error.message : "İşletme yeteneği güncellenemedi.");
      return undefined;
    }
  }, []);

  const clearRuntimeBusinessCapabilityOverride = useCallback(async (capability: BusinessCapability) => {
    const bridge = window.yardimciDesktop;
    if (!bridge?.clearBusinessCapabilityOverride) {
      setBusinessCapabilityState("error");
      setBusinessCapabilityMessage("İşletme yeteneği profil varsayımına döndürülemiyor. Uygulamayı yeniden başlatın.");
      return undefined;
    }

    setBusinessCapabilityState("loading");
    setBusinessCapabilityMessage(`${capability} profil varsayımına döndürülüyor...`);
    try {
      const snapshot = await bridge.clearBusinessCapabilityOverride(capability);
      setBusinessCapabilities(snapshot);
      setBusinessCapabilityState("success");
      setBusinessCapabilityMessage(`${capability} profil varsayımına döndürüldü.`);
      return snapshot;
    } catch (error) {
      setBusinessCapabilityState("error");
      setBusinessCapabilityMessage(error instanceof Error ? error.message : "İşletme yeteneği sıfırlanamadı.");
      return undefined;
    }
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

    void Promise.all([
      bridge.getBootstrapData(),
      loadInitialCapabilitySnapshot()
    ])
      .then(([data, capabilitySnapshot]) => {
        if (!active) return;
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
          message: "Güncelleme durumu okunamadı. Şimdi Eşitle ile yeniden deneyin."
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
  }, [accessPhase, loadBusinessCapabilities, loadDashboardData, setStatusMessage, setSyncState]);

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
          await Promise.all([loadDashboardData(), loadBusinessCapabilities()]);
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
        await Promise.all([loadDashboardData(), loadBusinessCapabilities()]);
      } catch {
        setSyncState("error");
        setStatusMessage("Web talepleri alındı ancak ekran verileri yenilenemedi. Uygulamayı yeniden başlatmayı deneyin.");
        return;
      }
      setSyncState("success");
      setStatusMessage(result.count > 0 ? `${result.count} talep alındı.` : "Yeni talep bulunmuyor.");
    } catch {
      setSyncState("error");
      setStatusMessage("Bağlantı kontrol edilemedi. İnternet ve web modülü ayarlarını kontrol edip yeniden deneyin.");
    }
  }, [loadBusinessCapabilities, loadDashboardData, setStatusMessage, setSyncState]);

  return {
    dashboardData,
    setDashboardData,
    businessCapabilities,
    setBusinessCapabilities,
    businessCapabilityState,
    businessCapabilityMessage,
    loadBusinessCapabilities,
    setRuntimeBusinessCapability,
    clearRuntimeBusinessCapabilityOverride,
    automaticSyncStatus,
    loadDashboardData,
    pullRequests
  };
}
