import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "../../apps/desktop-app/src/components/layout/AppShell";
import { PageHeader } from "../../apps/desktop-app/src/components/layout/PageHeader";
import { GlobalMessageBar } from "../../apps/desktop-app/src/components/layout/GlobalMessageBar";
import { ModalSurface } from "../../apps/desktop-app/src/components/ui/ModalSurface";
import { FormDialog } from "../../apps/desktop-app/src/components/ui/FormDialog";
import { applyUiPreferences, DEFAULT_UI_PREFERENCES } from "../../apps/desktop-app/src/ui-preferences";
import "../../apps/desktop-app/src/styles/index.css";

type Overlay = "gallery" | "layout" | "detail" | "confirm" | null;
const probe = window as unknown as {
  setAppearance: (scheme: "light" | "dark", density: "compact" | "comfortable", scale: number) => void;
};
probe.setAppearance = (scheme, density, scale) =>
  applyUiPreferences({ ...DEFAULT_UI_PREFERENCES, scheme, density, scale, motion: "reduced" });
probe.setAppearance("light", "comfortable", 1);

function Fixture() {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const viewport = useRef<HTMLElement>(null);
  const tools = <div className="page-header-tools">{
    ["Güncelle", "Görünüm", "Bildirim", "Tanılama", "Kilitle"].map(label =>
      <button key={label} className="topbar-control" type="button" aria-label={label}>{label.slice(0, 1)}</button>)
  }</div>;
  const title = overlay === "gallery" ? "Galeri Yönetimi" : overlay === "layout" ? "Oda Yönetimi" :
    overlay === "detail" ? "Oda bilgilerini düzenle" : "Onay";
  return <AppShell contentRef={viewport} contentScroll="workspace"
    sidebar={<aside className="sidebar" id="desktop-sidebar">Menü</aside>}
    header={<PageHeader title="Müşteriler" eyebrow="İşletme" description="Müşteri işlemleri"
      action={tools} noticeLeading={<button type="button" className="sync-status-indicator topbar-control" aria-label="Senkronizasyon">S</button>}
      notice={<GlobalMessageBar tone="info" message={"Güncelleme denetimi: " + "Uzun işlem bilgisi ".repeat(8)} />} />}>
    <button type="button" onClick={() => setOverlay("gallery")}>Galeriyi aç</button>
    <button type="button" onClick={() => setOverlay("layout")}>Oda yönetimini aç</button>
    <button type="button" onClick={() => setOverlay("detail")}>Oda detayını aç</button>
    <button type="button" onClick={() => setOverlay("confirm")}>Onayı aç</button>
    {overlay && (overlay === "detail"
      ? <FormDialog title={title} dialogClassName="settings-layout-details-modal"
          onSubmit={event => event.preventDefault()} onClose={() => setOverlay(null)}
          footer={<button type="button" onClick={() => setOverlay(null)}>Kapat</button>}>
          <div style={{ minHeight: 700 }}>İçerik uzun olsa bile dialogun kendi alanında kaydırılmalı.</div>
        </FormDialog>
      : <ModalSurface labelledBy="responsive-overlay-title" className={
          overlay === "gallery" ? "settings-gallery-overlay" : overlay === "layout" ? "settings-layout-overlay" : "confirm-dialog"
        } onClose={() => setOverlay(null)}>
          <div className="workspace-frame__header">
            <h2 id="responsive-overlay-title">{title}</h2>
            <button type="button" onClick={() => setOverlay(null)}>Kapat</button>
          </div>
          <div className={overlay === "gallery" ? "settings-gallery-body" : "settings-layout-body"}
            style={{ minHeight: overlay === "layout" ? 450 : 0 }}>Örnek içerik</div>
        </ModalSurface>)}
  </AppShell>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
