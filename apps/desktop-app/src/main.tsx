import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { applyUiPreferences, readUiPreferences } from "./ui-preferences";

applyUiPreferences(readUiPreferences());

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
