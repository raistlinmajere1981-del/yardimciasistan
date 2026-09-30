import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/ibm-plex-sans/wght.css";
import App from "./App";
import "./styles/index.css";
import { applyUiPreferences, readUiPreferences } from "./ui-preferences";
import { serializeRendererError, writeRendererDiagnostic } from "./app/diagnostics-client";
import { RootErrorBoundary } from "./components/app/RootErrorBoundary";

applyUiPreferences(readUiPreferences());

window.addEventListener("error", (event) => {
  writeRendererDiagnostic({
    level: "ERROR",
    scope: "renderer",
    event: "renderer.window-error",
    message: event.message || "Renderer pencere hatası.",
    meta: {
      filename: event.filename || "",
      line: event.lineno || 0,
      column: event.colno || 0
    },
    error: serializeRendererError(event.error ?? event.message)
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const error = serializeRendererError(event.reason);
  writeRendererDiagnostic({
    level: "ERROR",
    scope: "renderer",
    event: "renderer.unhandled-rejection",
    message: error.message || "Renderer içinde işlenmeyen Promise reddi.",
    error
  });
});

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    root.unmount();
  });
}
