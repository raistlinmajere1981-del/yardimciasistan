import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/ibm-plex-sans/wght.css";
import App from "./App";
import "./styles.css";
import "./friendly-overrides.css";
import "./room-folio.css";
import "./room-folio-ux.css";
import "./finance-ux.css";
import "./cash-page-ux.css";
import "./friendly-workflow-ux.css";
import "./dashboard-simple-ux.css";
import "./customer-work-ux.css";
import "./room-card-ux.css";
import "./room-management-ux.css";
import "./secondary-pages-ux.css";
import "./menu-image-preview-ux.css";
import { installDesktopUxEnhancements } from "./desktop-ux";
import { applyUiPreferences, readUiPreferences } from "./ui-preferences";

applyUiPreferences(readUiPreferences());

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

const cleanupDesktopUx = installDesktopUxEnhancements();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanupDesktopUx();
    root.unmount();
  });
}
