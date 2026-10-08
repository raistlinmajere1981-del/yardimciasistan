import { Component, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { ActionButton } from "../ui/ActionButton";

interface MessageModeErrorBoundaryProps {
  onReturnToSafe: () => void;
  children?: ReactNode;
}

interface MessageModeErrorBoundaryState {
  hasError: boolean;
}

// WhatsApp web görünümündeki bir işleme hatası kök ağacı söküp
// pencereyi tema arka planıyla boş bırakmamalı; bu sınır hatayı
// mesaj alanının içinde tutup güvenli moda dönüş sunar.
export class MessageModeErrorBoundary extends Component<MessageModeErrorBoundaryProps, MessageModeErrorBoundaryState> {
  override state: MessageModeErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MessageModeErrorBoundaryState {
    return { hasError: true };
  }

  private handleReturn = () => {
    this.setState({ hasError: false });
    this.props.onReturnToSafe();
  };

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section className="panel whatsapp-live-panel" aria-label="WhatsApp ekranı kurtarma">
        <div className="empty-state">
          <strong>WhatsApp ekranı açılamadı.</strong>
          <p>Beklenmedik bir görüntüleme sorunu oldu. Güvenli moda dönüp kaldığınız yerden devam edebilirsiniz.</p>
          <ActionButton variant="secondary" size="sm" type="button" onClick={this.handleReturn}>
            <ShieldCheck size={15} aria-hidden="true" />
            Güvenli Moda Dön
          </ActionButton>
        </div>
      </section>
    );
  }
}
