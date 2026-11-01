import { useConfirmDialog } from "../components/ui/useConfirmDialog";
import { useState, type Dispatch, type SetStateAction } from "react";
import type { DesktopAndroidDevice, DesktopDashboardData } from "../../electron/database";
import { reportAppStatus, type SyncState } from "./runtime-state";

interface UseDeviceControllerOptions {
  setDashboardData: Dispatch<SetStateAction<DesktopDashboardData>>;
  androidEnabled: boolean;
}

export function useDeviceController({ setDashboardData, androidEnabled }: UseDeviceControllerOptions) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const [androidDeviceState, setAndroidDeviceState] = useState<SyncState>("idle");
  const [androidDeviceMessage, setAndroidDeviceMessage] = useState("Telefon rolleri ve görev alanları masaüstünden yönetilir.");
  const [backupState, setBackupState] = useState<SyncState>("idle");
  const [backupMessage, setBackupMessage] = useState("Yerel yedek bekliyor.");
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
      setAndroidDeviceMessage("");
      reportAppStatus(result.ok ? "success" : "error", result.message);
    } catch {
      setAndroidDeviceState("error");
      setAndroidDeviceMessage("");
      reportAppStatus("error", "Telefon ayarı güncellenemedi. Uygulamayı yeniden başlatın.");
    }
  }

  function handleSetAndroidDeviceRole(deviceId: string, role: "admin" | "staff") {
    if (!window.yardimciDesktop) {
      setAndroidDeviceState("error");
      setAndroidDeviceMessage("");
      reportAppStatus("error", "Telefon yönetimi hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }
    void runAndroidDeviceMutation(
      role === "admin" ? "Telefon yönetici yapılıyor..." : "Telefon personel yapılıyor...",
      () => window.yardimciDesktop!.setAndroidDeviceRole(deviceId, role)
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

  async function handleRevokeAndroidDevice(device: DesktopAndroidDevice) {
    const shortId = compactAndroidDeviceId(device.deviceId);
    const deviceLabel = `${device.deviceName || "Bu telefon"}${shortId ? ` (${shortId})` : ""}`;
    if (!window.yardimciDesktop || !(await confirm({ title: "Silme onayı", description: `${deviceLabel} kaldırılsın ve erişimi kapatılsın mı?`, tone: "danger", confirmLabel: "Sil" }))) {
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
      setBackupMessage("");
      reportAppStatus("error", "Yedekleme hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.createManualBackup();
    if (!result.ok) {
      setBackupState("error");
      setBackupMessage("");
      reportAppStatus("error", result.message);
      return;
    }

    setBackupState("success");
    setBackupMessage("");
    reportAppStatus("success", `${result.message} ${result.backup.folderName}`);
  }


  return {
    confirmDialog,
    backupState,
    backupMessage,
    androidDeviceState,
    androidDeviceMessage,
    handleSetAndroidDeviceRole,
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
