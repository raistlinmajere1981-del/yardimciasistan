import { RotateCcw, Save, Trash2 } from "lucide-react";
import { useState } from "react";

type MaintenanceState = "idle" | "loading" | "success" | "error";
type MaintenanceAction = "backup" | "restore" | "reset" | null;

export function DataMaintenanceSettings() {
  const [state, setState] = useState<MaintenanceState>("idle");
  const [action, setAction] = useState<MaintenanceAction>(null);
  const [message, setMessage] = useState(
    "Manuel yedek alabilir, daha önceki bir yedeğe dönebilir veya bu bilgisayardaki verileri sıfırlayabilirsiniz."
  );

  const busy = state === "loading";

  async function createBackup() {
    if (busy) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.createManualBackup) {
      setState("error");
      setMessage("Yedekleme hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setAction("backup");
    setState("loading");
    setMessage("Yerel kayıtların yedeği oluşturuluyor...");
    try {
      const result = await bridge.createManualBackup();
      if (!result.ok) {
        setState("error");
        setMessage(result.message);
        return;
      }
      setState("success");
      setMessage(`${result.message} ${result.backupFileName}`);
    } catch {
      setState("error");
      setMessage("Yedek oluşturulamadı. Uygulamayı yeniden başlatıp tekrar deneyin.");
    } finally {
      setAction(null);
    }
  }

  async function restoreBackup() {
    if (busy) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.restoreLocalBackup) {
      setState("error");
      setMessage("Geri yükleme hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setAction("restore");
    setState("loading");
    setMessage("Geri yüklenecek yedek seçiliyor...");
    try {
      const result = await bridge.restoreLocalBackup();
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
    <div className="setup-section settings-data-maintenance-section" style={{ gridColumn: "1 / -1" }}>
      <div className="setup-section-title">
        <p>Yerel Veri</p>
        <h2>Yedekleme ve Kurtarma</h2>
      </div>
      <p className="setup-section-description">
        Yedekler bu bilgisayardaki yedek klasöründe tutulur. Geri yükleme ve veri sıfırlama işlemleri başlamadan önce mevcut kayıtların ayrıca otomatik güvenlik yedeği alınır.
      </p>
      <div className="settings-action-row">
        <button className="setup-secondary" type="button" onClick={() => void createBackup()} disabled={busy}>
          <Save size={16} aria-hidden="true" />
          {action === "backup" ? "Yedekleniyor" : "Yedek Al"}
        </button>
        <button className="setup-secondary" type="button" onClick={() => void restoreBackup()} disabled={busy}>
          <RotateCcw size={16} aria-hidden="true" />
          {action === "restore" ? "Yedek Seçiliyor" : "Yedekten Geri Yükle"}
        </button>
        <button className="setup-secondary password-remove-button" type="button" onClick={() => void resetLocalData()} disabled={busy}>
          <Trash2 size={16} aria-hidden="true" />
          {action === "reset" ? "Sıfırlanıyor" : "Verileri Sıfırla"}
        </button>
      </div>
      <p className={`menu-status sync-${state}`} role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
