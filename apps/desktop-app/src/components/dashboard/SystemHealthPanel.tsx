import { Bot, DatabaseBackup, LockKeyhole, Smartphone, Wifi } from "lucide-react";
import { useMemo } from "react";
import type { DesktopDashboardData, DesktopSetupData } from "../../../electron/database";
import type { AutomaticSyncStatus } from "../../../electron/sync-coordinator";
import { Panel } from "../ui/Panel";

interface SystemHealthPanelProps {
  data: DesktopDashboardData;
  setup: DesktopSetupData;
  syncStatus: AutomaticSyncStatus;
  features: {
    android: boolean;
  };
  aiEnabled: boolean;
}

type HealthTone = "success" | "warning" | "danger" | "info" | "muted";

interface HealthItem {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone: HealthTone;
  icon: typeof Wifi;
}

export function SystemHealthPanel({
  data,
  setup,
  syncStatus,
  features,
  aiEnabled
}: SystemHealthPanelProps) {
  const items = useMemo<HealthItem[]>(() => {
    const activeDevices = data.androidDevices.filter((device) => device.isActive && !device.revokedAt).length;
    const pendingDevices = data.androidDevices.filter((device) => !device.isActive && !device.revokedAt).length;
    const webUrl = setup.webModuleUrl || data.webModuleUrl;
    const webItem = buildWebHealth(webUrl, setup.autoSyncEnabled ?? syncStatus.enabled, syncStatus);

    const items: HealthItem[] = [webItem];
    if (features.android) {
      items.push({
        key: "android",
        label: "Android",
        value: pendingDevices > 0 ? `${pendingDevices} onay bekliyor` : `${activeDevices} aktif cihaz`,
        detail: pendingDevices > 0
          ? "Yeni telefon masaüstünden onaylanmadan işletme verisini göremez."
          : activeDevices > 0 ? "Telefon yetkileri masaüstünden yönetiliyor." : "Henüz onaylanmış telefon yok.",
        tone: pendingDevices > 0 ? "warning" : activeDevices > 0 ? "success" : "muted",
        icon: Smartphone
      });
    }
    if (aiEnabled) {
      items.push({
        key: "ai",
        label: "AI",
        value: setup.aiApiKeyConfigured ? "Hazır" : "Anahtar gerekli",
        detail: setup.aiApiKeyConfigured
          ? `${setup.aiService || "AI"} · ${setup.aiModel || "model seçili"}`
          : "AI açık ancak servis anahtarı henüz tamamlanmamış.",
        tone: setup?.aiApiKeyConfigured ? "success" : "warning",
        icon: Bot
      });
    }
    items.push(
      {
        key: "lock",
        label: "Uygulama kilidi",
        value: setup.appPasswordConfigured ? "Etkin" : "Parola yok",
        detail: setup.appPasswordConfigured
          ? "Masaüstü uygulaması parola ile korunuyor."
          : "Pilot kullanımda ortak bilgisayar için uygulama parolası önerilir.",
        tone: setup.appPasswordConfigured ? "success" : "warning",
        icon: LockKeyhole
      },
      {
        key: "backup",
        label: "Yerel yedek",
        value: data.backupPath ? "Klasör hazır" : "Kontrol gerekli",
        detail: data.backupPath ? compactPath(data.backupPath) : "Yedek klasörü bilgisi alınamadı.",
        tone: data.backupPath ? "success" : "warning",
        icon: DatabaseBackup
      }
    );
    return items;
  }, [aiEnabled, data.androidDevices, data.backupPath, data.webModuleUrl, features.android, setup, syncStatus]);

  return (
    <Panel className="system-health-panel" padding="compact" aria-labelledby="system-health-title">
      <div className="system-health-heading">
        <div>
          <p>Sistem sağlığı</p>
          <h2 id="system-health-title">Bağlantılar ve koruma</h2>
        </div>
      </div>
      <div className="system-health-grid">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <article className={`system-health-item tone-${item.tone}`} key={item.key}>
              <span className="system-health-icon" aria-hidden="true"><Icon size={17} /></span>
              <div>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </div>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

function buildWebHealth(webUrl: string, enabled: boolean, status: AutomaticSyncStatus | null): HealthItem {
  if (!webUrl) {
    return {
      key: "web",
      label: "Web bağlantısı",
      value: "Bağlantı yok",
      detail: "Web modülü adresi Ayarlar bölümünden tamamlanmalı.",
      tone: "warning",
      icon: Wifi
    };
  }
  if (!enabled) {
    return {
      key: "web",
      label: "Web bağlantısı",
      value: "Otomatik eşitleme kapalı",
      detail: compactUrl(webUrl),
      tone: "warning",
      icon: Wifi
    };
  }
  if (status?.phase === "offline" || status?.phase === "error") {
    return {
      key: "web",
      label: "Web bağlantısı",
      value: status.phase === "offline" ? "Çevrimdışı" : "Hata",
      detail: status.message || compactUrl(webUrl),
      tone: status.phase === "offline" ? "warning" : "danger",
      icon: Wifi
    };
  }
  return {
    key: "web",
    label: "Web bağlantısı",
    value: "Hazır",
    detail: "Otomatik eşitleme etkin.",
    tone: "success",
    icon: Wifi
  };
}

function compactPath(value: string) {
  if (value.length <= 54) return value;
  return `…${value.slice(-52)}`;
}

function compactUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}
