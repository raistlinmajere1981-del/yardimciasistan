import { MessageCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { SegmentedControl } from "../components/ui/SegmentedControl";

type MessageMode = "safe" | "web";

interface MessagesPageProps {
  safeMode: ReactNode;
  webMode: (onReturnToSafe: () => void) => ReactNode;
  aiTools: ReactNode;
  aiEnabled: boolean;
  whatsappEnabled: boolean;
  aiOpen: boolean;
  active: boolean;
}

export function MessagesPage({ safeMode, webMode, aiTools, aiEnabled, whatsappEnabled, aiOpen, active }: MessagesPageProps) {
  const [mode, setMode] = useState<MessageMode>("safe");
  const [webModeActivated, setWebModeActivated] = useState(false);

  useEffect(() => {
    if (active && aiOpen) {
      setMode("safe");
    }
  }, [active, aiOpen]);

  const selectMode = (nextMode: MessageMode) => {
    setMode(nextMode);
    if (nextMode === "web") {
      setWebModeActivated(true);
    }
  };

  return (
    <section className="combined-page messages-page" aria-label="Mesajlar">
      {whatsappEnabled && (
        <SegmentedControl
          className="message-mode-switch"
          value={mode}
          ariaLabel="Mesaj gönderme modu"
          onChange={selectMode}
          options={[
            { id: "safe", label: "Güvenli Mod", icon: <ShieldCheck size={16} aria-hidden="true" /> },
            { id: "web", label: "WhatsApp Web Modu", icon: <MessageCircle size={16} aria-hidden="true" /> }
          ]}
        />
      )}

      {whatsappEnabled && <div className={mode === "safe" ? "message-mode-content" : "message-mode-content is-hidden"}>{safeMode}</div>}
      {whatsappEnabled && webModeActivated && (
        <div className={mode === "web" ? "message-mode-content" : "message-mode-content is-hidden"}>
          {webMode(() => selectMode("safe"))}
        </div>
      )}
      {aiEnabled && aiOpen && mode === "safe" && <div className="messages-ai-tools">{aiTools}</div>}
    </section>
  );
}
