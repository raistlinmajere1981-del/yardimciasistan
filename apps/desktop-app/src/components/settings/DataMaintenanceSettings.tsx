import { useConfirmDialog } from "../ui/useConfirmDialog";
import { FolderOpen, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { DesktopBackupListItem } from "../../../electron/data-maintenance";
import { reportAppStatus } from "../../app/runtime-state";

type MaintenanceAction = "load" | "backup" | "open-root" | "open-item" | "restore" | "delete" | "reset" | null;

export function DataMaintenanceSettings({ initialized = true }: { initialized?: boolean }) {
  const { confirm, confirmDialog } = useConfirmDialog();
  useEffect(() => window.yardimciDesktop?.onDataMaintenanceConfirmation?.(
    (request) => confirm({ ...request, tone: "danger" })
  ), [confirm]);
  const [action, setAction] = useState<MaintenanceAction>("load");
  const [activeBackupId, setActiveBackupId] = useState("");
  const [backups, setBackups] = useState<DesktopBackupListItem[]>([]);

  const busy = action !== null;

  useEffect(() => {
    if (initialized) void loadBackups();
    else setAction(null);
  }, [initialized]);

  async function loadBackups() {
    const bridge = window.yardimciDesktop;
    if (!bridge?.listLocalBackups) {
      setAction(null);
      reportAppStatus("error", "Yedek yönetimi hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setAction("load");
    try {
      const result = await bridge.listLocalBackups();
      setBackups(result.backups);
      if (!result.ok) {
        reportAppStatus("error", result.message);
        return;
      }
    } catch {
      reportAppStatus("error", "Yedek listesi okunamadı. Uygulamayı yeniden başlatıp tekrar deneyin.");
    } finally {
      setAction(null);
    }
  }

  async function createBackup() {
    if (busy) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.createManualBackup) {
      reportAppStatus("error", "Yedekleme hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setAction("backup");
    setActiveBackupId("");
    try {
      const result = await bridge.createManualBackup();
      if (!result.ok) {
        reportAppStatus("error", result.message);
        return;
      }
      setBackups(result.backups);
      reportAppStatus("success", result.message);
    } catch {
      reportAppStatus("error", "Yedek oluşturulamadı. Uygulamayı yeniden başlatıp tekrar deneyin.");
    } finally {
      setAction(null);
    }
  }

  async function openBackupDirectory() {
    if (busy) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.openLocalBackupDirectory) return;
    setAction("open-root");
    setActiveBackupId("");
    try {
      const result = await bridge.openLocalBackupDirectory();
      reportAppStatus(result.ok ? "success" : "error", result.message);
    } catch {
      reportAppStatus("error", "Yedek klasörü açılamadı.");
    } finally {
      setAction(null);
    }
  }

  async function openBackupItem(backupId: string) {
    if (busy) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.openLocalBackupItemDirectory) return;
    setAction("open-item");
    setActiveBackupId(backupId);
    try {
      const result = await bridge.openLocalBackupItemDirectory(backupId);
      reportAppStatus(result.ok ? "success" : "error", result.message);
    } catch {
      reportAppStatus("error", "Yedek klasörü açılamadı.");
    } finally {
      setAction(null);
      setActiveBackupId("");
    }
  }

  async function restoreBackup(backupId: string) {
    if (busy) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.restoreLocalBackup) {
      reportAppStatus("error", "Geri yükleme hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setAction("restore");
    setActiveBackupId(backupId);
    try {
      const result = await bridge.restoreLocalBackup(backupId);
      if (!result.ok) {
        if (!result.cancelled) reportAppStatus("error", result.message);
        return;
      }
      reportAppStatus("success", result.message);
    } catch {
      reportAppStatus("error", "Geri yükleme başlatılamadı. Uygulamayı yeniden başlatıp tekrar deneyin.");
    } finally {
      setAction(null);
      setActiveBackupId("");
    }
  }

  async function deleteBackup(backupId: string) {
    if (busy) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.deleteLocalBackup) return;
    setAction("delete");
    setActiveBackupId(backupId);
    try {
      const result = await bridge.deleteLocalBackup(backupId);
      if (result.backups) setBackups(result.backups);
      if (!result.ok) {
        if (!result.cancelled) reportAppStatus("error", result.message);
        return;
      }
      reportAppStatus("success", result.message);
    } catch {
      reportAppStatus("error", "Yedek silinemedi.");
    } finally {
      setAction(null);
      setActiveBackupId("");
    }
  }

  async function resetLocalData() {
    if (busy) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.resetLocalData) {
      reportAppStatus("error", "Veri sıfırlama hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setAction("reset");
    setActiveBackupId("");
    try {
      const result = await bridge.resetLocalData();
      if (!result.ok) {
        if (!result.cancelled) reportAppStatus("error", result.message);
        return;
      }
      reportAppStatus("success", result.message);
    } catch {
      reportAppStatus("error", "Veriler sıfırlanamadı. Uygulamayı yeniden başlatıp tekrar deneyin.");
    } finally {
      setAction(null);
    }
  }

  return (
    <div className="settings-application-subsection settings-data-maintenance-section backup-manager settings-panel">
      {confirmDialog}
      <div className="settings-panel-header backup-manager-title">
        <div>
          <h3>Veri ve Yedekleme</h3>
          <p>Yerel verileri yedekleyin, geri yükleyin veya temiz başlangıç için tamamen sıfırlayın.</p>
        </div>
        {backups.length > 0 && <span className="backup-count">{backups.length} yedek</span>}
      </div>
      <div className="settings-panel-body">
      <div className="form-actions backup-manager-toolbar">
        <button className="setup-secondary action-button action-button-secondary" type="button" onClick={() => void createBackup()} disabled={busy || !initialized}>
          <Save size={16} aria-hidden="true" />
          {action === "backup" ? "Yedekleniyor" : "Yedek Al"}
        </button>
        <button className="setup-secondary action-button action-button-secondary" type="button" onClick={() => void openBackupDirectory()} disabled={busy || !initialized}>
          <FolderOpen size={16} aria-hidden="true" />
          {action === "open-root" ? "Açılıyor" : "Yedek Klasörünü Aç"}
        </button>
        <button className="setup-secondary password-remove-button action-button action-button-danger" type="button" onClick={() => void resetLocalData()} disabled={busy}>
          <Trash2 size={16} aria-hidden="true" />
          {action === "reset" ? "Sıfırlanıyor" : "Tüm Verileri Sıfırla"}
        </button>
      </div>


      <div className="backup-list-heading">
        <strong>Mevcut Yedekler</strong>
      </div>

      <div className="backup-list" aria-busy={action === "load"}>
        {action === "load" && backups.length === 0 && <p className="backup-empty">Yedekler okunuyor...</p>}
        {action !== "load" && backups.length === 0 && <p className="backup-empty">Henüz kayıtlı yedek yok.</p>}
        {backups.map((backup) => {
          const rowBusy = activeBackupId === backup.id;
          return (
            <div className="backup-row" key={backup.id}>
              <div className="backup-row-main">
                <div className="backup-row-title">
                  <strong>{formatBackupDate(backup.createdAt)}</strong>
                  <span className={`backup-kind is-${backup.kind}`}>{backupKindLabel(backup.kind)}</span>
                </div>
                <div className="backup-row-meta">
                  <span>{formatBytes(backup.sizeBytes)}</span>
                  <span>{backup.imageCount > 0 ? `${backup.imageCount} menü görseli` : "Menü görseli yok"}</span>
                  <span>{backup.assetFileCount > 0 ? `${backup.assetFileCount} ürün/asset görseli` : "Ürün görseli yok"}</span>
                </div>
              </div>
              <div className="form-actions backup-row-actions">
                <button className="action-button action-button-ghost action-button-sm" type="button" onClick={() => void openBackupItem(backup.id)} disabled={busy}>
                  <FolderOpen size={15} aria-hidden="true" />
                  {rowBusy && action === "open-item" ? "Açılıyor" : "Klasörü Aç"}
                </button>
                <button className="action-button action-button-secondary action-button-sm backup-restore-button" type="button" onClick={() => void restoreBackup(backup.id)} disabled={busy}>
                  <RotateCcw size={15} aria-hidden="true" />
                  {rowBusy && action === "restore" ? "Hazırlanıyor" : "Geri Yükle"}
                </button>
                <button className="action-button action-button-danger action-button-sm backup-delete-button" type="button" onClick={() => void deleteBackup(backup.id)} disabled={busy} aria-label={`${formatBackupDate(backup.createdAt)} yedeğini sil`}>
                  <Trash2 size={15} aria-hidden="true" />
                  {rowBusy && action === "delete" ? "Siliniyor" : "Sil"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

function formatBackupDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function backupKindLabel(kind: DesktopBackupListItem["kind"]) {
  if (kind === "safety") return "Güvenlik";
  return "Manuel";
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 KB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;
}
