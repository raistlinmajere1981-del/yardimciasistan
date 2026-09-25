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

type HealthTone = "ok" | "warn" | "danger" | "info" | "muted";

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
        tone: pendingDevices > 0 ? "warn" : activeDevices > 0 ? "ok" : "muted",
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
        tone: setup?.aiApiKeyConfigured ? "ok" : "warn",
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
        tone: setup.appPasswordConfigured ? "ok" : "warn",
        icon: LockKeyhole
      },
      {
        key: "backup",
        label: "Yerel yedek",
        value: data.backupPath ? "Klasör hazır" : "Kontrol gerekli",
        detail: data.backupPath ? compactPath(data.backupPath) : "Yedek klasörü bilgisi alınamadı.",
        tone: data.backupPath ? "ok" : "warn",
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
      tone: "warn",
      icon: Wifi
    };
  }
  if (!enabled) {
    return {
      key: "web",
      label: "Web bağlantısı",
      value: "Otomatik eşitleme kapalı",
      detail: compactUrl(webUrl),
      tone: "warn",
      icon: Wifi
    };
  }
  if (status?.phase === "offline" || status?.phase === "error") {
    return {
      key: "web",
      label: "Web bağlantısı",
      value: status.phase === "offline" ? "Çevrimdışı" : "Hata",
      detail: status.message || compactUrl(webUrl),
      tone: status.phase === "offline" ? "warn" : "danger",
      icon: Wifi
    };
  }
  if (status?.phase === "syncing") {
    return {
      key: "web",
      label: "Web bağlantısı",
      value: "Eşitleniyor",
      detail: status.pendingJobs > 0 ? `${status.pendingJobs} değişiklik sırada.` : compactUrl(webUrl),
      tone: "info",
      icon: Wifi
    };
  }
  if (status?.pendingJobs && status.pendingJobs > 0) {
    return {
      key: "web",
      label: "Web bağlantısı",
      value: `${status.pendingJobs} değişiklik bekliyor`,
      detail: status.lastSuccessAt ? `Son başarılı: ${formatRelativeTime(status.lastSuccessAt)}` : compactUrl(webUrl),
      tone: "info",
      icon: Wifi
    };
  }
  return {
    key: "web",
    label: "Web bağlantısı",
    value: "Hazır",
    detail: status?.lastSuccessAt ? `Son başarılı: ${formatRelativeTime(status.lastSuccessAt)}` : compactUrl(webUrl),
    tone: "ok",
    icon: Wifi
  };
}

function formatRelativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "zaman bilgisi yok";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds} sn önce`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
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
