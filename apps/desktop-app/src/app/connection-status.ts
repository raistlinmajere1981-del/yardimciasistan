import type { DesktopAndroidDevice, DesktopSetupData } from "../../electron/database";
import type { AutomaticSyncStatus } from "../../electron/sync-coordinator";
import { isWebAvailable } from "./web-availability";

export type NetworkSignal = "onlineHint" | "offlineHint" | "unknown";
type WebSyncStatus = "disabled" | "ready" | "waiting" | "syncing" | "unreachable" | "error";
type ConnectionTone = "info" | "muted" | "warning" | "danger";
interface ConnectionSummary {
  label: string;
  detail: string;
  tone: ConnectionTone;
}

interface ConnectionStatusInput {
  // Persisted setup only. Connection tests and Settings drafts are not evidence here.
  setup: Pick<DesktopSetupData, "webModuleUrl" | "syncSecret" | "autoSyncEnabled" | "localNetworkEnabled">;
  syncStatus: AutomaticSyncStatus;
  networkSignal?: NetworkSignal;
  androidEnabled: boolean;
  devices?: ReadonlyArray<Pick<DesktopAndroidDevice, "isActive" | "revokedAt">>;
}

export interface ConnectionStatus {
  webConfigured: boolean;
  webSyncStatus: WebSyncStatus;
  automaticWebSyncEnabled: boolean;
  manualWebSyncAllowed: boolean;
  web: ConnectionSummary;
  webNotice: string | null;
  networkSignal: NetworkSignal;
  network: ConnectionSummary;
  // No listener/reachability evidence is exposed to the renderer yet.
  localCompanion: "off" | "configured";
  companion: ConnectionSummary;
  approvedAndroidDevices: number;
  pendingAndroidDevices: number;
}

/** Read-only presentation; never authorizes operations or gates independent providers. */
export function projectConnectionStatus({
  setup, syncStatus, networkSignal = "unknown", androidEnabled, devices = []
}: ConnectionStatusInput): ConnectionStatus {
  const webConfigured = isWebAvailable(setup);
  const automaticWebSyncEnabled = webConfigured && (setup.autoSyncEnabled ?? syncStatus.enabled);
  const webSyncStatus: WebSyncStatus = !webConfigured ? "disabled"
    : syncStatus.phase === "syncing" ? "syncing"
      : syncStatus.phase === "offline" ? "unreachable"
        : syncStatus.phase === "error" ? "error"
          : syncStatus.pendingJobs > 0 ? "waiting" : "ready";
  const automaticDetail = automaticWebSyncEnabled
    ? "Otomatik Web eşitleme açık."
    : "Otomatik Web eşitleme kapalı; manuel eşitleme ve yayın kullanılabilir.";
  const web: ConnectionSummary = webSyncStatus === "disabled"
    ? { label: "Web kullanılmıyor", detail: "Yerel çalışma etkin. Web adresi ve güvenlik anahtarı kaydedilmemiş veya eksik.", tone: "muted" }
    : webSyncStatus === "unreachable"
      ? { label: "Web sunucusuna erişilemiyor", detail: `Yerel işlemler devam ediyor. Bu durum genel internet erişimini göstermez. ${automaticDetail}`, tone: "warning" }
      : webSyncStatus === "error"
        ? { label: "Web eşitleme hatası", detail: `Web eşitleme tamamlanamadı. Web ayarlarını kontrol edin. ${automaticDetail}`, tone: "danger" }
        : webSyncStatus === "syncing"
          ? { label: "Web eşitleniyor", detail: "Web sunucusuyla eşitleme sürüyor.", tone: "info" }
          : webSyncStatus === "waiting"
            ? { label: "Web eşitleme bekliyor", detail: `${syncStatus.pendingJobs} bekleyen iş. ${automaticDetail}`, tone: "info" }
            : { label: automaticWebSyncEnabled ? "Web eşitlemeye hazır" : "Manuel Web eşitleme",
                detail: `${automaticDetail} ${syncStatus.lastSuccessAt ? "Önceki Web eşitlemesi tamamlandı; güncel erişim garantisi değildir." : "Sunucuya güncel erişim henüz doğrulanmadı."}`, tone: "info" };
  const network: ConnectionSummary = networkSignal === "onlineHint"
    ? { label: "Ağ bağlı olabilir", detail: "Sistem ağ sinyali olumlu; internet veya servis erişimi doğrulanmadı.", tone: "info" }
    : networkSignal === "offlineHint"
      ? { label: "Ağ bağlantısı yok sinyali", detail: "Sistemin ağ sinyali olumsuz. Bu bir ipucudur; internet ve servis erişimi ayrıca doğrulanmadı.", tone: "warning" }
      : { label: "Ağ sinyali bilinmiyor", detail: "İnternet ve servis erişimi doğrulanmadı.", tone: "muted" };
  const localCompanion = androidEnabled && setup.localNetworkEnabled !== false ? "configured" : "off";
  return {
    webConfigured, webSyncStatus, automaticWebSyncEnabled,
    manualWebSyncAllowed: webConfigured && webSyncStatus !== "syncing",
    web, webNotice: webSyncStatus === "unreachable" || webSyncStatus === "error" ? `${web.label}. ${web.detail}` : null,
    networkSignal, network, localCompanion,
    companion: localCompanion === "configured"
      ? { label: "Yapılandırıldı", detail: "Yerel ağ Companion tercihi açık. LAN erişimi ve cihaz bağlantısı doğrulanmadı.", tone: "info" }
      : { label: "Kapalı", detail: androidEnabled ? "Yerel ağ Companion tercihi kapalı." : "Android yetkisi kapalı.", tone: "muted" },
    approvedAndroidDevices: devices.filter(device => device.isActive && !device.revokedAt).length,
    pendingAndroidDevices: devices.filter(device => !device.isActive && !device.revokedAt).length
  };
}
