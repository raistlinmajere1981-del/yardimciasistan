import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { serializeRendererError, writeRendererDiagnostic } from "../../app/diagnostics-client";
import { ActionButton } from "../ui/ActionButton";

interface RootErrorBoundaryProps {
  children: ReactNode;
}

interface RootErrorBoundaryState {
  failed: boolean;
}

export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  override state: RootErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    writeRendererDiagnostic({
      level: "ERROR",
      scope: "renderer",
      event: "renderer.react-boundary",
      message: "React kök ağacında yakalanmamış bir görüntüleme hatası oluştu.",
      meta: {
        componentStack: info.componentStack || ""
      },
      error: serializeRendererError(error)
    });
  }

  override render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="app-error-boundary" role="alert">
        <section className="panel empty-state">
          <TriangleAlert size={32} aria-hidden="true" />
          <strong>Uygulama ekranı beklenmedik bir hatayla durdu.</strong>
          <p>Hata tanılama kayıtlarına eklendi. Uygulamayı yeniden yükleyip devam edebilirsiniz.</p>
          <ActionButton type="button" variant="primary" onClick={() => window.location.reload()}>
            <RefreshCw size={16} aria-hidden="true" />
            Uygulamayı Yeniden Yükle
          </ActionButton>
        </section>
      </main>
    );
  }
}
