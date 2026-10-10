import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Copy, Download, ExternalLink, Eye, QrCode, X } from "lucide-react";
import { reportAppStatus } from "../../app/runtime-state";
import { ActionButton } from "../ui/ActionButton";
import { ModalSurface } from "../ui/ModalSurface";
import { createQrSvg, resolveQrMenuPublicUrl } from "./qr-code";

export function QrMenuPanel({ enabled: moduleEnabled, webModuleUrl, onPreview, utilityAction }: {
  enabled: boolean;
  webModuleUrl: string;
  onPreview: () => void;
  utilityAction?: ReactNode;
}) {
  const [webEnabled, setWebEnabled] = useState(true);
  const [publicationLoading, setPublicationLoading] = useState(true);
  const [publicationSaving, setPublicationSaving] = useState(false);
  const [publicationError, setPublicationError] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const url = useMemo(() => resolveQrMenuPublicUrl(webModuleUrl), [webModuleUrl]);
  const visibleOnWeb = moduleEnabled && webEnabled;
  const svg = useMemo(() => {
    if (!visibleOnWeb || !url) return "";
    try {
      return createQrSvg(url);
    } catch {
      return "";
    }
  }, [visibleOnWeb, url]);
  const busy = publicationLoading || publicationSaving;

  useEffect(() => {
    let active = true;
    const bridge = window.yardimciDesktop;
    if (!bridge?.getQrMenuWebPublication) {
      setPublicationLoading(false);
      return () => {
        active = false;
      };
    }

    setPublicationError("");
    setPublicationLoading(true);
    void bridge.getQrMenuWebPublication()
      .then((state) => {
        if (!active) return;
        setWebEnabled(state.enabled !== false);
      })
      .catch(() => {
        if (!active) return;
        const message = "QR Menü web görünürlüğü okunamadı.";
        setPublicationError(message);
        reportAppStatus("error", message);
      })
      .finally(() => {
        if (active) setPublicationLoading(false);
      });

    return () => {
      active = false;
    };
  }, [moduleEnabled]);

  async function toggle(next: boolean) {
    if (!moduleEnabled || publicationSaving) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.setQrMenuWebPublication) {
      reportAppStatus("error", "QR Menü web görünürlüğü değiştirilemedi.");
      return;
    }

    setPublicationError("");
    setPublicationSaving(true);
    try {
      const result = await bridge.setQrMenuWebPublication(next);
      if (!result.ok) {
        const message = result.message || "QR Menü web görünürlüğü değiştirilemedi.";
        setPublicationError(message);
        reportAppStatus("error", message);
        return;
      }
      setWebEnabled(result.enabled);
      if (!result.enabled) setToolsOpen(false);
      reportAppStatus("success", result.message);
    } catch {
      const message = "QR Menü web görünürlüğü değiştirilemedi.";
      setPublicationError(message);
      reportAppStatus("error", message);
    } finally {
      setPublicationSaving(false);
    }
  }

  async function copyUrl() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      reportAppStatus("success", "QR Menü bağlantısı panoya kopyalandı.");
    } catch {
      reportAppStatus("error", "QR Menü bağlantısı panoya kopyalanamadı.");
    }
  }

  function downloadQr() {
    if (!svg) return;
    const href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "qr-menu.svg";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  }

  const statusText = publicationLoading
    ? "Web durumu okunuyor…"
    : publicationSaving
      ? "Web görünürlüğü güncelleniyor…"
      : publicationError
        ? publicationError
        : !moduleEnabled
          ? "QR Menü modülü Ayarlar'dan kapalı"
          : visibleOnWeb
            ? "Web QR menüsü görünür"
            : "Web QR menüsü gizli · yerel menü açık";

  return <>
    <section
      className={`menu-qr-service${visibleOnWeb ? " is-enabled" : " is-disabled"}${publicationError ? " has-error" : ""}`}
      data-surface-role="integration"
      aria-label="QR Menü"
      aria-busy={busy || undefined}
    >
      <div className="menu-qr-service__header">
        <div className="menu-qr-service__identity">
          <strong>QR Menü</strong>
          <span role={publicationError ? "alert" : "status"}>{statusText}</span>
        </div>
        <div className="menu-qr-service__actions">
          {utilityAction}
          <ActionButton variant="secondary" size="sm" onClick={onPreview}>
            <Eye size={16} aria-hidden="true" /> Önizle
          </ActionButton>
          <ActionButton variant="secondary" size="sm" disabled={!visibleOnWeb || !url} onClick={() => setToolsOpen(true)}>
            <QrCode size={16} aria-hidden="true" /> QR Kod
          </ActionButton>
        </div>
        <label className="menu-qr-service__toggle">
          <input
            aria-label="QR Menü webde aktif"
            type="checkbox"
            checked={visibleOnWeb}
            disabled={!moduleEnabled || busy}
            onChange={(event) => void toggle(event.target.checked)}
          />
          <span>{publicationSaving ? "Güncelleniyor…" : visibleOnWeb ? "Webde aktif" : "Webde pasif"}</span>
        </label>
      </div>
    </section>

    {toolsOpen && visibleOnWeb && <ModalSurface
      labelledBy="qr-menu-tools-title"
      className="qr-menu-tools-modal"
      dismissOnBackdrop
      onClose={() => setToolsOpen(false)}
    >
      <div className="qr-menu-tools">
        <header className="workspace-frame__header">
          <div>
            <strong id="qr-menu-tools-title">QR Menü</strong>
            <span>Bu kod webdeki güncel QR Menü sayfasını açar.</span>
          </div>
          <ActionButton variant="ghost" type="button" data-modal-initial-focus onClick={() => setToolsOpen(false)} aria-label="QR Menü araçlarını kapat">
            <X size={18} aria-hidden="true" />
          </ActionButton>
        </header>
        <div className="qr-menu-tools__body">
          {svg
            ? <div className="qr-menu-tools__code" aria-label="QR Menü kodu" dangerouslySetInnerHTML={{ __html: svg }} />
            : <p className="empty-state">QR kodu oluşturmak için geçerli bir web bağlantısı gerekli.</p>}
          <div className="qr-menu-tools__details">
            <label className="form-field form-field--fluid">
              QR Menü bağlantısı
              <input value={url} readOnly />
            </label>
            <div className="action-row">
              <ActionButton variant="secondary" size="sm" disabled={!url} onClick={() => void window.yardimciDesktop?.openExternal(url)}>
                <ExternalLink size={16} aria-hidden="true" /> Sayfayı Aç
              </ActionButton>
              <ActionButton variant="secondary" size="sm" disabled={!url} onClick={() => void copyUrl()}>
                <Copy size={16} aria-hidden="true" /> Bağlantıyı Kopyala
              </ActionButton>
              <ActionButton variant="secondary" size="sm" disabled={!svg} onClick={downloadQr}>
                <Download size={16} aria-hidden="true" /> QR Kodu İndir
              </ActionButton>
            </div>
          </div>
        </div>
      </div>
    </ModalSurface>}
  </>;
}
