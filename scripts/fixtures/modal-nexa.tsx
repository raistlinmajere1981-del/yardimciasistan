import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "../../apps/desktop-app/src/components/layout/AppShell";
import { NexaHabitat } from "../../apps/desktop-app/src/components/layout/NexaHabitat";
import { FormDialog } from "../../apps/desktop-app/src/components/ui/FormDialog";
import { desktopNexa } from "../../apps/desktop-app/src/app/nexa-activity";
import { applyUiPreferences, readUiPreferences } from "../../apps/desktop-app/src/ui-preferences";
import "../../apps/desktop-app/src/styles/index.css";

function Fixture() {
  const [open, setOpen] = useState(false), [collapsed, setCollapsed] = useState(false), [clicks, setClicks] = useState(0);
  const [navCount, setNavCount] = useState(1);
  Object.assign(window, { nexaFixture: {
    collapsed: setCollapsed, navCount: setNavCount,
    speech: (on: boolean) => { desktopNexa.setActive(true); if (on) desktopNexa.begin(); else desktopNexa.reset(); },
    appearance: (scale: number, scheme: "light" | "dark") => applyUiPreferences({ ...readUiPreferences(), scale, scheme, motion: "reduced" })
  } });
  return <AppShell sidebarCollapsed={collapsed} sidebar={<aside id="desktop-sidebar" className={`sidebar${collapsed ? " is-collapsed" : ""}`}>
    <div className="brand">Nexa</div>
    <nav className="sidebar-primary-nav">{Array.from({ length: navCount }, (_, i) =>
      <button key={i} className="nav-item" onClick={() => setClicks(value => value + 1)}>Menü {i}</button>)}</nav>
    <NexaHabitat collapsed={collapsed} />
    <nav className="sidebar-footer-nav"><button className="nav-item" onClick={() => setClicks(value => value + 1)}>Ayarlar</button></nav>
  </aside>}
    header={<header className="page-header"><h1>Nexa modal testi</h1></header>}>
    <button id="open-modal" onClick={() => setOpen(true)}>Pencereyi aç</button><output id="click-count">{clicks}</output>
    {open && <FormDialog title="Nexa test penceresi" dismissOnBackdrop onClose={() => setOpen(false)} onSubmit={event => event.preventDefault()}
      footer={<button onClick={() => setOpen(false)}>Kapat</button>}><input aria-label="Test alanı" /></FormDialog>}
  </AppShell>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
