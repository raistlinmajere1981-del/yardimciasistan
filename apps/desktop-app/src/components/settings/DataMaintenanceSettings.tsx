import { FolderOpen, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { DesktopBackupListItem } from "../../../electron/data-maintenance";

type MaintenanceState = "idle" | "loading" | "success" | "error";
type MaintenanceAction = "load" | "backup" | "open-root" | "open-item" | "restore" | "delete" | "reset" | null;

export function DataMaintenanceSettings() {
  const [state, setState] = useState<MaintenanceState>("idle");
  const [action, setAction] = useState<MaintenanceAction>("load");
  const [activeBackupId, setActiveBackupId] = useState("");
  const [backups, setBackups] = useState<DesktopBackupListItem[]>([]);
  const [message, setMessage] = useState("Yedekler okunuyor...");

  const busy = action !== null;

  useEffect(() => {
    void loadBackups();
  }, []);

  async function loadBackups() {
    const bridge = window.yardimciDesktop;
    if (!bridge?.listLocalBackups) {
      setAction(null);
      setState("error");
      setMessage("Yedek yönetimi hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setAction("load");
    try {
      const result = await bridge.listLocalBackups();
      setBackups(result.backups);
      if (!result.ok) {
        setState("error");
        setMessage(result.message);
        return;
      }
      setState("idle");
      setMessage("");
    } catch {
      setState("error");
      setMessage("Yedek listesi okunamadı. Uygulamayı yeniden başlatıp tekrar deneyin.");
    } finally {
      setAction(null);
    }
  }

  async function createBackup() {
    if (busy) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.createManualBackup) {
      setState("error");
      setMessage("Yedekleme hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setAction("backup");
    setActiveBackupId("");
    setState("loading");
    setMessage("Yerel kayıtlar ve kalıcı görseller yedekleniyor...");
    try {
      const result = await bridge.createManualBackup();
      if (!result.ok) {
        setState("error");
        setMessage(result.message);
        return;
      }
      setBackups(result.backups);
      setState("success");
      setMessage(result.message);
    } catch {
      setState("error");
      setMessage("Yedek oluşturulamadı. Uygulamayı yeniden başlatıp tekrar deneyin.");
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
      setState(result.ok ? "success" : "error");
      setMessage(result.message);
    } catch {
      setState("error");
      setMessage("Yedek klasörü açılamadı.");
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
      setState(result.ok ? "success" : "error");
      setMessage(result.message);
    } catch {
      setState("error");
      setMessage("Yedek klasörü açılamadı.");
    } finally {
      setAction(null);
      setActiveBackupId("");
    }
  }

  async function restoreBackup(backupId: string) {
    if (busy) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.restoreLocalBackup) {
      setState("error");
      setMessage("Geri yükleme hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setAction("restore");
    setActiveBackupId(backupId);
    setState("loading");
    setMessage("Geri yükleme onayı bekleniyor...");
    try {
      const result = await bridge.restoreLocalBackup(backupId);
      if (!result.ok) {
        setState(result.cancelled ? "idle" : "error");
        setMessage(result.message);
        return;
      }
      setState("success");
      setMessage(result.message);
    } catch {
      setState("error");
      setMessage("Geri yükleme başlatılamadı. Uygulamayı yeniden başlatıp tekrar deneyin.");
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
    setState("loading");
    setMessage("Yedek silme onayı bekleniyor...");
    try {
      const result = await bridge.deleteLocalBackup(backupId);
      if (result.backups) setBackups(result.backups);
      if (!result.ok) {
        setState(result.cancelled ? "idle" : "error");
        setMessage(result.message);
        return;
      }
      setState("success");
      setMessage(result.message);
    } catch {
      setState("error");
      setMessage("Yedek silinemedi.");
    } finally {
      setAction(null);
      setActiveBackupId("");
    }
  }

  async function resetLocalData() {
    if (busy) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.resetLocalData) {
      setState("error");
      setMessage("Veri sıfırlama hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setAction("reset");
    setActiveBackupId("");
    setState("loading");
    setMessage("Sıfırlama onayı bekleniyor...");
    try {
      const result = await bridge.resetLocalData();
      if (!result.ok) {
        setState(result.cancelled ? "idle" : "error");
        setMessage(result.message);
        return;
      }
      setState("success");
      setMessage(result.message);
    } catch {
      setState("error");
      setMessage("Veriler sıfırlanamadı. Uygulamayı yeniden başlatıp tekrar deneyin.");
    } finally {
      setAction(null);
    }
  }

  return (
    <div className="settings-application-subsection settings-data-maintenance-section backup-manager settings-panel">
      <div className="settings-panel-header backup-manager-title">
        <div>
          <h3>Veri ve Yedekleme</h3>
          <p>Yerel verileri yedekleyin, geri yükleyin veya sıfırlayın.</p>
        </div>
        {backups.length > 0 && <span className="backup-count">{backups.length} yedek</span>}
      </div>
      <div className="settings-panel-body">
      <div className="form-actions backup-manager-toolbar">
        <button className="setup-secondary action-button action-button-secondary" type="button" onClick={() => void createBackup()} disabled={busy}>
          <Save size={16} aria-hidden="true" />
          {action === "backup" ? "Yedekleniyor" : "Yedek Al"}
        </button>
        <button className="setup-secondary action-button action-button-secondary" type="button" onClick={() => void openBackupDirectory()} disabled={busy}>
          <FolderOpen size={16} aria-hidden="true" />
          {action === "open-root" ? "Açılıyor" : "Yedek Klasörünü Aç"}
        </button>
        <button className="setup-secondary password-remove-button action-button action-button-danger" type="button" onClick={() => void resetLocalData()} disabled={busy}>
          <Trash2 size={16} aria-hidden="true" />
          {action === "reset" ? "Sıfırlanıyor" : "Verileri Sıfırla"}
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

      {message && (
        <p className={`menu-status sync-${state}`} role="status" aria-live="polite">
          {message}
        </p>
      )}
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
