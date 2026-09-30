import { AlertCircle, CheckCircle2, Info, LoaderCircle, X } from "lucide-react";

export type GlobalMessageTone = "info" | "loading" | "success" | "error";

interface GlobalMessageBarProps {
  tone: GlobalMessageTone;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  dismissible?: boolean;
  onDismiss?: () => void;
}

export function GlobalMessageBar({
  tone,
  message,
  actionLabel,
  onAction,
  dismissible = false,
  onDismiss
}: GlobalMessageBarProps) {
  if (!message.trim()) return null;

  const Icon = tone === "error"
    ? AlertCircle
    : tone === "success"
      ? CheckCircle2
      : tone === "loading"
        ? LoaderCircle
        : Info;

  return (
    <div
      className={`global-message-bar is-${tone}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      <span className="global-message-bar__icon" aria-hidden="true">
        <Icon size={17} />
      </span>
      <span className="global-message-bar__message">{message}</span>
      {(actionLabel && onAction) && (
        <button className="global-message-bar__action" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
      {dismissible && onDismiss && (
        <button
          className="global-message-bar__dismiss"
          type="button"
          aria-label="Mesajı kapat"
          title="Mesajı kapat"
          onClick={onDismiss}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
