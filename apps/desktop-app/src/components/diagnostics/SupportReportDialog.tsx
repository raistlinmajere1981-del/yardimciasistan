import { useEffect, useState, type FormEvent } from "react";
import { ImagePlus, Send, Trash2 } from "lucide-react";
import type { DesktopSupportReportDraft } from "../../../electron/diagnostics-contract";
import { ActionButton } from "../ui/ActionButton";
import { FormDialog } from "../ui/FormDialog";

interface SupportReportDialogProps {
  onClose: () => void;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function SupportReportDialog({ onClose }: SupportReportDialogProps) {
  const [draft, setDraft] = useState<DesktopSupportReportDraft | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("Rapor bilgileri hazırlanıyor...");
  const [busy, setBusy] = useState(false);
  const [reportId, setReportId] = useState("");

  useEffect(() => {
    let active = true;
    void window.yardimciDesktop?.getSupportReportDraft()
      .then((next) => {
        if (!active) return;
        setDraft(next);
        setMessage(next.sessionCount > 0 ? "Rapor gönderime hazır." : "Gönderilecek log oturumu bulunamadı.");
      })
      .catch(() => {
        if (!active) return;
        setMessage("Hata raporu bilgileri hazırlanamadı.");
      });
    return () => { active = false; };
  }, []);

  async function attachScreenshot() {
    const bridge = window.yardimciDesktop;
    if (!bridge?.addClipboardScreenshot || busy) return;
    setBusy(true);
    setReportId("");
    try {
      const result = await bridge.addClipboardScreenshot();
      setDraft(result.draft);
      setMessage(result.message);
    } catch {
      setMessage("Panodaki ekran görüntüsü okunamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function removeScreenshot() {
    const bridge = window.yardimciDesktop;
    if (!bridge?.clearSupportScreenshot || busy) return;
    setBusy(true);
    try {
      const result = await bridge.clearSupportScreenshot();
      setDraft(result.draft);
      setMessage(result.message);
    } catch {
      setMessage("Ekran görüntüsü rapordan çıkarılamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const bridge = window.yardimciDesktop;
    if (!bridge?.sendSupportReport || busy || !draft?.sessionCount) return;
    setBusy(true);
    setReportId("");
    setMessage("Hata raporu gönderiliyor...");
    try {
      const result = await bridge.sendSupportReport({ note });
      setMessage(result.message);
      if (result.ok && result.reportId) {
        setReportId(result.reportId);
        setDraft((current) => current ? { ...current, screenshot: null } : current);
      }
    } catch {
      setMessage("Hata raporu gönderilemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      title="Hata Bildir"
      onSubmit={submit}
      onClose={() => { if (!busy) onClose(); }}
      closeBlocked={busy}
      footer={
        <div className="action-row">
          <ActionButton type="button" variant="secondary" disabled={busy} onClick={onClose}>Kapat</ActionButton>
          <ActionButton type="submit" variant="primary" disabled={busy || !draft?.sessionCount}>
            <Send size={16} aria-hidden="true" />
            {busy ? "Gönderiliyor..." : "Gönder"}
          </ActionButton>
        </div>
      }
    >
      <div className="support-report-dialog">
        <div className="support-report-summary">
          <strong>Tanılama paketi</strong>
          <p>
            Son {draft?.sessionCount ?? 0} uygulama oturumu · {formatBytes(draft?.totalLogBytes ?? 0)}
          </p>
          <p className="muted">
            Veritabanı ve ayar dosyaları gönderilmez. Loglardaki telefon, e-posta, kimlik numarası,
            IP ve kullanıcı dizini gibi bilgiler gönderimden önce gizlenir.
          </p>
        </div>

        <div className="support-report-screenshot">
          <div className="card__header">
            <div>
              <strong>Ekran görüntüsü</strong>
              <p>Print Screen ile aldığınız görüntüyü panodan rapora ekleyin.</p>
            </div>
            <div className="action-row">
              <ActionButton type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void attachScreenshot()}>
                <ImagePlus size={15} aria-hidden="true" />
                Panodaki Görüntüyü Ekle
              </ActionButton>
              {draft?.screenshot && (
                <ActionButton type="button" variant="danger" size="sm" disabled={busy} onClick={() => void removeScreenshot()}>
                  <Trash2 size={15} aria-hidden="true" />
                  Kaldır
                </ActionButton>
              )}
            </div>
          </div>
          {draft?.screenshot ? (
            <>
              {draft.screenshot.previewDataUrl
                ? <img className="support-report-preview" src={draft.screenshot.previewDataUrl} alt="Hata raporuna eklenecek ekran görüntüsü" />
                : <div className="empty-state">Ekran görüntüsü rapora eklendi.</div>}
              <p className="muted">
                {draft.screenshot.width}×{draft.screenshot.height} · {formatBytes(draft.screenshot.sizeBytes)}
                {" · "}Ekran görüntüsünün görsel içeriği olduğu gibi gönderilir.
              </p>
            </>
          ) : (
            <div className="empty-state">Henüz ekran görüntüsü eklenmedi. Logları tek başına da gönderebilirsiniz.</div>
          )}
        </div>

        <label className="form-field">
          <span>Ne yaparken oldu? <small>İsteğe bağlı</small></span>
          <textarea
            value={note}
            maxLength={2000}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Örn. Web eşitlemeyi açtıktan sonra oda kaydı güncellenmedi."
          />
        </label>

        <div className={reportId ? "status-message is-success" : "status-message"} role="status" aria-live="polite">
          {message}
          {reportId && <strong> Takip kodu: {reportId}</strong>}
        </div>
      </div>
    </FormDialog>
  );
}
