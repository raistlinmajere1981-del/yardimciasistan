import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { AndroidPermissionGroups } from "@yardimci-asistan/sync-core";
import type { DesktopAndroidDevice, DesktopDashboardData } from "../../electron/database";
import type { DesktopAndroidInstallationSnapshot } from "../../electron/android-installation-service";
import type { SyncState } from "./runtime-state";

interface UseDeviceControllerOptions {
  setDashboardData: Dispatch<SetStateAction<DesktopDashboardData>>;
  androidEnabled: boolean;
}

export function useDeviceController({ setDashboardData, androidEnabled }: UseDeviceControllerOptions) {
  const [backupState, setBackupState] = useState<SyncState>("idle");
  const [backupMessage, setBackupMessage] = useState("Yerel yedek bekliyor.");
  const [androidDeviceState, setAndroidDeviceState] = useState<SyncState>("idle");
  const [androidDeviceMessage, setAndroidDeviceMessage] = useState("Telefon rolleri ve görev alanları masaüstünden yönetilir.");
  const [androidInstallState, setAndroidInstallState] = useState<SyncState>("idle");
  const [androidInstallMessage, setAndroidInstallMessage] = useState("USB Android cihazları aranıyor...");
  const [androidInstallSnapshot, setAndroidInstallSnapshot] = useState<DesktopAndroidInstallationSnapshot | null>(null);
  const refreshAndroidInstallDevices = useCallback(async () => {
    if (!androidEnabled) {
      setAndroidInstallSnapshot(null);
      setAndroidInstallState("idle");
      setAndroidInstallMessage("Android bağlantısı kapalı.");
      return;
    }
    if (!window.yardimciDesktop?.listAndroidInstallDevices) {
      setAndroidInstallState("error");
      setAndroidInstallMessage("Android kurulum aracı hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }
    setAndroidInstallState("loading");
    setAndroidInstallMessage("USB Android cihazları aranıyor...");
    try {
      const snapshot = await window.yardimciDesktop.listAndroidInstallDevices();
      setAndroidInstallSnapshot(snapshot);
      setAndroidInstallState(snapshot.ok ? "success" : "error");
      setAndroidInstallMessage(snapshot.message);
    } catch {
      setAndroidInstallState("error");
      setAndroidInstallMessage("USB Android cihazları okunamadı.");
    }
  }, [androidEnabled]);

  async function handleInstallAndroidApp(serial: string) {
    if (!androidEnabled) {
      setAndroidInstallSnapshot(null);
      setAndroidInstallState("idle");
      setAndroidInstallMessage("Android bağlantısını kullanmak için önce Android servisini açıp ayarları kaydedin.");
      return;
    }
    if (!window.yardimciDesktop?.installAndroidApp) {
      setAndroidInstallState("error");
      setAndroidInstallMessage("Android kurulum aracı hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }
    setAndroidInstallState("loading");
    setAndroidInstallMessage("Android uygulaması telefona kuruluyor...");
    try {
      const result = await window.yardimciDesktop.installAndroidApp(serial);
      setAndroidInstallState(result.ok ? "success" : "error");
      setAndroidInstallMessage(result.message);
      await refreshAndroidInstallDevices();
      if (result.ok) {
        setAndroidInstallState("success");
        setAndroidInstallMessage(result.message);
      }
    } catch {
      setAndroidInstallState("error");
      setAndroidInstallMessage("Android uygulaması kurulamadı.");
    }
  }

  useEffect(() => {
    if (!androidEnabled) {
      setAndroidInstallSnapshot(null);
      setAndroidInstallState("idle");
      setAndroidInstallMessage("Android bağlantısı kapalı.");
      return;
    }
    void refreshAndroidInstallDevices();
  }, [androidEnabled, refreshAndroidInstallDevices]);

  async function runAndroidDeviceMutation(
    pendingMessage: string,
    operation: () => ReturnType<NonNullable<typeof window.yardimciDesktop>["setAndroidDeviceRole"]>
  ) {
    if (!androidEnabled) {
      setAndroidDeviceState("idle");
      setAndroidDeviceMessage("Android bağlantısını kullanmak için önce Android servisini açıp ayarları kaydedin.");
      return;
    }
    setAndroidDeviceState("loading");
    setAndroidDeviceMessage(pendingMessage);
    try {
      const result = await operation();
      setDashboardData((current) => ({ ...current, androidDevices: result.devices }));
      setAndroidDeviceState(result.ok ? "success" : "error");
      setAndroidDeviceMessage(result.message);
    } catch {
      setAndroidDeviceState("error");
      setAndroidDeviceMessage("Telefon ayarı güncellenemedi. Uygulamayı yeniden başlatın.");
    }
  }

  function handleSetAndroidDeviceRole(deviceId: string, role: "admin" | "staff") {
    if (!window.yardimciDesktop) {
      setAndroidDeviceState("error");
      setAndroidDeviceMessage("Telefon yönetimi hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }
    void runAndroidDeviceMutation(
      role === "admin" ? "Telefon yönetici yapılıyor..." : "Telefon personel yapılıyor...",
      () => window.yardimciDesktop!.setAndroidDeviceRole(deviceId, role)
    );
  }

  function handleSetAndroidDevicePermissionGroups(deviceId: string, groups: AndroidPermissionGroups) {
    if (!window.yardimciDesktop) {
      setAndroidDeviceState("error");
      setAndroidDeviceMessage("Telefon yönetimi hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }
    void runAndroidDeviceMutation(
      "Telefon görev alanları güncelleniyor...",
      () => window.yardimciDesktop!.setAndroidDevicePermissionGroups(deviceId, groups)
    );
  }

  function handleSetAndroidDeviceActive(deviceId: string, active: boolean) {
    if (!window.yardimciDesktop) return;
    void runAndroidDeviceMutation(
      active ? "Telefon yeniden aktif ediliyor..." : "Telefon pasifleştiriliyor...",
      () => window.yardimciDesktop!.setAndroidDeviceActive(deviceId, active)
    );
  }

  function handleResetAndroidDevicePermissions(deviceId: string) {
    if (!window.yardimciDesktop) return;
    void runAndroidDeviceMutation(
      "Telefon yetkileri sıfırlanıyor...",
      () => window.yardimciDesktop!.resetAndroidDevicePermissions(deviceId)
    );
  }

  function handleRevokeAndroidDevice(device: DesktopAndroidDevice) {
    const shortId = compactAndroidDeviceId(device.deviceId);
    const deviceLabel = `${device.deviceName || "Bu telefon"}${shortId ? ` (${shortId})` : ""}`;
    if (!window.yardimciDesktop || !window.confirm(`${deviceLabel} kaldırılsın ve erişimi kapatılsın mı?`)) {
      return;
    }
    void runAndroidDeviceMutation(
      "Telefon erişimi kaldırılıyor...",
      () => window.yardimciDesktop!.revokeAndroidDevice(device.deviceId)
    );
  }

  async function handleCreateManualBackup() {
    setBackupState("loading");
    setBackupMessage("Yerel kayıtların ve menü görsellerinin yedeği oluşturuluyor...");

    if (!window.yardimciDesktop) {
      setBackupState("error");
      setBackupMessage("Yedekleme hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.createManualBackup();
    if (!result.ok) {
      setBackupState("error");
      setBackupMessage(result.message);
      return;
    }

    setBackupState("success");
    setBackupMessage(`${result.message} ${result.backup.folderName}`);
  }

  return {
    backupState,
    backupMessage,
    androidDeviceState,
    androidDeviceMessage,
    androidInstallState,
    androidInstallMessage,
    androidInstallSnapshot,
    refreshAndroidInstallDevices,
    handleInstallAndroidApp,
    handleSetAndroidDeviceRole,
    handleSetAndroidDevicePermissionGroups,
    handleSetAndroidDeviceActive,
    handleResetAndroidDevicePermissions,
    handleRevokeAndroidDevice,
    handleCreateManualBackup
  };
}

function compactAndroidDeviceId(deviceId: string): string {
  return deviceId.length > 22
    ? `${deviceId.slice(0, 12)}…${deviceId.slice(-6)}`
    : deviceId;
}
