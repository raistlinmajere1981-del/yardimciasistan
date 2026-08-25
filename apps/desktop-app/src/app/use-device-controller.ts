import { useState, type Dispatch, type SetStateAction } from "react";
import type { AndroidPermissionGroups } from "@yardimci-asistan/sync-core";
import type { DesktopAndroidDevice, DesktopDashboardData } from "../../electron/database";
import type { SyncState } from "./runtime-state";

interface UseDeviceControllerOptions {
  setDashboardData: Dispatch<SetStateAction<DesktopDashboardData>>;
}

export function useDeviceController({ setDashboardData }: UseDeviceControllerOptions) {
  const [backupState, setBackupState] = useState<SyncState>("idle");
  const [backupMessage, setBackupMessage] = useState("Yerel yedek bekliyor.");
  const [androidPublishState, setAndroidPublishState] = useState<SyncState>("idle");
  const [androidPublishMessage, setAndroidPublishMessage] = useState("Android özeti henüz yayınlanmadı.");
  const [androidDeviceState, setAndroidDeviceState] = useState<SyncState>("idle");
  const [androidDeviceMessage, setAndroidDeviceMessage] = useState("Telefon rolleri ve görev alanları masaüstünden yönetilir.");

  async function handlePublishAndroidSnapshot() {
    setAndroidPublishState("loading");
    setAndroidPublishMessage("Android özeti web modülüne gönderiliyor...");

    if (!window.yardimciDesktop) {
      setAndroidPublishState("error");
      setAndroidPublishMessage("Telefon özeti yayınlanamadı. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.pushAndroidSnapshot();
    if (!result.ok) {
      setAndroidPublishState("error");
      setAndroidPublishMessage(result.message);
      return;
    }

    setAndroidPublishState("success");
    setAndroidPublishMessage(`${result.task_count} günlük iş ile Android özeti yayınlandı.`);
  }

  async function runAndroidDeviceMutation(
    pendingMessage: string,
    operation: () => ReturnType<NonNullable<typeof window.yardimciDesktop>["setAndroidDeviceRole"]>
  ) {
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
    setBackupMessage("Yerel kayıtların ve QR menü görsellerinin yedeği oluşturuluyor...");

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
    androidPublishState,
    androidPublishMessage,
    androidDeviceState,
    androidDeviceMessage,
    handlePublishAndroidSnapshot,
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
