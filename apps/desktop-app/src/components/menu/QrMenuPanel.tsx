import { useMemo, useState } from "react";
import { Copy, Download, ExternalLink, Eye, QrCode, X } from "lucide-react";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import { reportAppStatus } from "../../app/runtime-state";
import { ActionButton } from "../ui/ActionButton";
import { ModalSurface } from "../ui/ModalSurface";
import { createQrSvg, resolveQrMenuPublicUrl } from "./qr-code";

export function QrMenuPanel({ enabled, webModuleUrl, onPreview }: {
  enabled: boolean;
  webModuleUrl: string;
  onPreview: () => void;
}) {
  const capability = useBusinessCapabilityRuntime();
  const [toolsOpen, setToolsOpen] = useState(false);
  const url = useMemo(() => resolveQrMenuPublicUrl(webModuleUrl), [webModuleUrl]);
  const svg = useMemo(() => {
    if (!enabled || !url) return "";
    try {
      return createQrSvg(url);
    } catch {
      return "";
    }
  }, [enabled, url]);
  const busy = capability.state === "loading";

  async function toggle(next: boolean) {
    const snapshot = await capability.setCapability(BUSINESS_CAPABILITIES.QR_MENU, next);
    if (!snapshot) return;
    if (!next) setToolsOpen(false);
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

  return <>
    <section className={`menu-qr-service${enabled ? " is-enabled" : " is-disabled"}`} aria-label="QR Menü">
      <div className="menu-qr-service__header">
        <div className="menu-qr-service__identity">
          <strong>QR Menü</strong>
          <span>{enabled ? "Web QR menüsü etkin" : "Yalnız uygulama içi menü"}</span>
        </div>
        <div className="menu-qr-service__actions">
          <ActionButton variant="secondary" size="sm" onClick={onPreview}>
            <Eye size={16} aria-hidden="true" /> Önizle
          </ActionButton>
          <ActionButton variant="secondary" size="sm" disabled={!enabled || !url} onClick={() => setToolsOpen(true)}>
            <QrCode size={16} aria-hidden="true" /> QR Kod
          </ActionButton>
        </div>
        <label className="menu-qr-service__toggle">
          <input aria-label="QR Menü aktif" type="checkbox" checked={enabled} disabled={busy}
            onChange={(event) => void toggle(event.target.checked)} />
          <span>{enabled ? "Aktif" : "Pasif"}</span>
        </label>
      </div>
    </section>

    {toolsOpen && enabled && <ModalSurface
      labelledBy="qr-menu-tools-title"
      className="qr-menu-tools-modal"
      dismissOnBackdrop
      onClose={() => setToolsOpen(false)}
    >
      <div className="qr-menu-tools">
        <header className="overlay-header">
          <div>
            <strong id="qr-menu-tools-title">QR Menü</strong>
            <span>Bu kod webdeki güncel QR Menü sayfasını açar.</span>
          </div>
          <button className="overlay-close" type="button" data-modal-initial-focus onClick={() => setToolsOpen(false)} aria-label="QR Menü araçlarını kapat">
            <X size={18} aria-hidden="true" />
          </button>
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
