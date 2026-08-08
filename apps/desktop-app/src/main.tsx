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
import { installCashPageUx } from "./cash-page-ux";
import { applyUiPreferences, readUiPreferences } from "./ui-preferences";

applyUiPreferences(readUiPreferences());
installCashPageUx();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
