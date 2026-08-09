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
import { installCashPageUx } from "./cash-page-ux";
import { installCustomerWorkEnhancements } from "./customer-work-enhancements";
import { installMenuEditorUx } from "./menu-editor-ux";
import { installMenuImagePreviewUx } from "./menu-image-preview-ux";
import { installRoomCardUx } from "./room-card-ux";
import { installRoomManagementUx } from "./room-management-ux";
import { applyUiPreferences, readUiPreferences } from "./ui-preferences";

applyUiPreferences(readUiPreferences());
installCashPageUx();
installCustomerWorkEnhancements();
installMenuEditorUx();
installMenuImagePreviewUx();
installRoomCardUx();
installRoomManagementUx();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
