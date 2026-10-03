import { MessageCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { MessageModeErrorBoundary } from "../messages/MessageModeErrorBoundary";
import { SegmentedControl } from "../ui/SegmentedControl";

type MessageMode = "safe" | "web";
interface CustomerMessagesWorkspaceProps {
  safeMode: (onOpenWeb: () => void) => ReactNode;
  webMode: (onReturnToSafe: () => void) => ReactNode;
  whatsappEnabled: boolean;
  prewarmWebview?: boolean;
  active: boolean;
}

export function CustomerMessagesWorkspace({
  safeMode,
  webMode,
  whatsappEnabled,
  prewarmWebview = false,
  active
}: CustomerMessagesWorkspaceProps) {
  const [mode, setMode] = useState<MessageMode>("safe");
  const [webModeActivated, setWebModeActivated] = useState(prewarmWebview);

  useEffect(() => {
    if (prewarmWebview) setWebModeActivated(true);
  }, [prewarmWebview]);

  useEffect(() => {
    if (whatsappEnabled) return;
    setMode("safe");
  }, [whatsappEnabled]);

  const selectMode = (nextMode: MessageMode) => {
    setMode(nextMode);
    if (nextMode === "web") {
      setWebModeActivated(true);
    }
  };

  return (
    <section className={`combined-page customer-messages-workspace${mode === "web" ? " customer-messages-workspace--web" : ""}`} aria-label="Hazır Mesajlar">
      {whatsappEnabled && (
        <div className="page-toolbar message-toolbar">
          <div className="page-toolbar__start">
            <SegmentedControl
              className="message-mode-switch"
              value={mode}
              ariaLabel="Hazır mesaj çalışma şekli"
              onChange={selectMode}
              options={[
                { id: "safe", label: "Hazır Mesaj", icon: <ShieldCheck size={16} aria-hidden="true" /> },
                { id: "web", label: "WhatsApp", icon: <MessageCircle size={16} aria-hidden="true" /> }
              ]}
            />
            <p className="message-mode-intro">
              <strong>{mode === "safe" ? "Hazırlanmış mesajları kontrol edin." : "WhatsApp burada açılır."}</strong>
              <span>{mode === "safe" ? "Göndermeden önce son kontrol sizde kalır." : "Gönderme işlemini yine siz tamamlarsınız."}</span>
            </p>
          </div>
        </div>
      )}

      {whatsappEnabled && (
        <div className={mode === "safe" ? "message-mode-content" : "message-mode-content is-hidden"}>
          {safeMode(() => selectMode("web"))}
        </div>
      )}
      {whatsappEnabled && webModeActivated && (
        <>
          <div className={mode === "web" ? "message-mode-content" : "message-mode-content is-hidden"}>
            <MessageModeErrorBoundary onReturnToSafe={() => selectMode("safe")}>
              {webMode(() => selectMode("safe"))}
            </MessageModeErrorBoundary>
          </div>
        </>
      )}
    </section>
  );
}
