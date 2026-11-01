import { Bot, DatabaseBackup, LockKeyhole, Smartphone, Wifi } from "lucide-react";
import { useMemo } from "react";
import type { DesktopDashboardData, DesktopSetupData } from "../../../electron/database";
import type { AutomaticSyncStatus } from "../../../electron/sync-coordinator";
import { projectConnectionStatus } from "../../app/connection-status";
import { useNetworkSignal } from "../../app/network-signal";
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
  const networkSignal = useNetworkSignal();
  const items = useMemo<HealthItem[]>(() => {
    const connection = projectConnectionStatus({
      setup, syncStatus, networkSignal, androidEnabled: features.android, devices: data.androidDevices
    });
    const activeDevices = connection.approvedAndroidDevices;
    const pendingDevices = connection.pendingAndroidDevices;

    const items: HealthItem[] = [
      { key: "web", label: "Web bağlantısı", value: connection.web.label, detail: connection.web.detail, tone: connection.web.tone, icon: Wifi },
      { key: "network", label: "Ağ sinyali", value: connection.network.label, detail: connection.network.detail, tone: connection.network.tone, icon: Wifi }
    ];
    if (features.android) {
      items.push({
        key: "android",
        label: "Yerel ağ Companion",
        value: connection.companion.label,
        detail: `${connection.companion.detail} ${activeDevices} onaylı cihaz${pendingDevices > 0 ? ` · ${pendingDevices} onay bekliyor` : ""}. Cihaz kayıtları anlık bağlantı kanıtı değildir.`,
        tone: pendingDevices > 0 ? "warning" : connection.companion.tone,
        icon: Smartphone
      });
    }
    if (aiEnabled) {
      items.push({
        key: "ai",
        label: "AI",
        value: setup.aiApiKeyConfigured ? "Yapılandırıldı" : "Anahtar gerekli",
        detail: setup.aiApiKeyConfigured
          ? `${setup.aiService || "AI"} · ${setup.aiModel || "model seçili"}. Servis erişimi burada doğrulanmadı.`
          : "AI açık ancak servis anahtarı henüz tamamlanmamış.",
        tone: setup?.aiApiKeyConfigured ? "info" : "warning",
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
  }, [aiEnabled, data.androidDevices, data.backupPath, features.android, networkSignal, setup, syncStatus]);

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

function compactPath(value: string) {
  if (value.length <= 54) return value;
  return `…${value.slice(-52)}`;
}
