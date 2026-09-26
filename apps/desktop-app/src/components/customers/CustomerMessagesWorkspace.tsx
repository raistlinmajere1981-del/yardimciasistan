import { MessageCircle, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MessageModeErrorBoundary } from "../messages/MessageModeErrorBoundary";
import { ActionButton } from "../ui/ActionButton";
import { SegmentedControl } from "../ui/SegmentedControl";

type MessageMode = "safe" | "web";
type WebTakeoverState = "idle" | "pending" | "ready" | "error";

interface CustomerMessagesWorkspaceProps {
  safeMode: ReactNode;
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
  const [webTakeoverState, setWebTakeoverState] = useState<WebTakeoverState>("idle");
  const [webTakeoverMessage, setWebTakeoverMessage] = useState("");
  const [webTakeoverAttempt, setWebTakeoverAttempt] = useState(0);
  const takeoverSequence = useRef(0);

  useEffect(() => {
    if (prewarmWebview) setWebModeActivated(true);
  }, [prewarmWebview]);

  useEffect(() => {
    if (whatsappEnabled) return;
    takeoverSequence.current += 1;
    setMode("safe");
    setWebTakeoverState("idle");
    setWebTakeoverMessage("");
  }, [whatsappEnabled]);

  useEffect(() => {
    window.yardimciDesktop?.setWhatsAppUserActivity?.(active && mode === "web");
    return () => window.yardimciDesktop?.setWhatsAppUserActivity?.(false);
  }, [active, mode]);

  useEffect(() => {
    if (!active || !whatsappEnabled || mode !== "web" || !webModeActivated) {
      takeoverSequence.current += 1;
      setWebTakeoverState("idle");
      setWebTakeoverMessage("");
      return;
    }

    const bridge = window.yardimciDesktop;
    const request = bridge?.takeoverWhatsAppWebview;
    const sequence = ++takeoverSequence.current;
    setWebTakeoverState("pending");
    setWebTakeoverMessage("WhatsApp Web kullanıcı kontrolüne hazırlanıyor...");

    if (!request) {
      setWebTakeoverState("error");
      setWebTakeoverMessage("WhatsApp Web devralma köprüsü hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    let disposed = false;
    void (async () => {
      let lastMessage = "WhatsApp Web henüz hazır değil.";
      for (let attempt = 0; attempt < 10; attempt += 1) {
        if (disposed || takeoverSequence.current !== sequence) return;
        const result = await request();
        if (disposed || takeoverSequence.current !== sequence) return;
        lastMessage = result.message;
        if (result.ok) {
          setWebTakeoverState("ready");
          setWebTakeoverMessage(result.message);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (disposed || takeoverSequence.current !== sequence) return;
      }
      if (!disposed && takeoverSequence.current === sequence) {
        setWebTakeoverState("error");
        setWebTakeoverMessage(lastMessage);
      }
    })().catch(() => {
      if (!disposed && takeoverSequence.current === sequence) {
        setWebTakeoverState("error");
        setWebTakeoverMessage("WhatsApp Web kullanıcı kontrolüne hazırlanamadı. Yeniden deneyin.");
      }
    });

    return () => {
      disposed = true;
    };
  }, [active, mode, webModeActivated, webTakeoverAttempt, whatsappEnabled]);

  const selectMode = (nextMode: MessageMode) => {
    setMode(nextMode);
    if (nextMode === "web") {
      setWebModeActivated(true);
      setWebTakeoverAttempt((current) => current + 1);
    }
  };

  const webReady = active && mode === "web" && webTakeoverState === "ready";

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

      {whatsappEnabled && <div className={mode === "safe" ? "message-mode-content" : "message-mode-content is-hidden"}>{safeMode}</div>}
      {whatsappEnabled && webModeActivated && (
        <>
          {mode === "web" && !webReady && (
            <div className="message-web-takeover status-message" role={webTakeoverState === "error" ? "alert" : "status"}>
              <span>{webTakeoverMessage || "WhatsApp Web hazırlanıyor..."}</span>
              {webTakeoverState === "error" && (
                <ActionButton variant="secondary" size="sm" type="button" onClick={() => setWebTakeoverAttempt((current) => current + 1)}>
                  Yeniden Dene
                </ActionButton>
              )}
            </div>
          )}
          <div className={webReady ? "message-mode-content" : "message-mode-content is-hidden"}>
            <MessageModeErrorBoundary onReturnToSafe={() => selectMode("safe")}>
              {webMode(() => selectMode("safe"))}
            </MessageModeErrorBoundary>
          </div>
        </>
      )}
    </section>
  );
}
