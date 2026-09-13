import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/ibm-plex-sans/wght.css";
import App from "./App";
import "./styles/index.css";
import { applyUiPreferences, readUiPreferences } from "./ui-preferences";

applyUiPreferences(readUiPreferences());

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    root.unmount();
  });
}
