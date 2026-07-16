import { MessageCircle, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";

type MessageMode = "safe" | "web";

interface MessagesPageProps {
  safeMode: ReactNode;
  webMode: ReactNode;
  aiTools: ReactNode;
  aiEnabled: boolean;
  whatsappEnabled: boolean;
  aiOpen: boolean;
}

export function MessagesPage({ safeMode, webMode, aiTools, aiEnabled, whatsappEnabled, aiOpen }: MessagesPageProps) {
  const [mode, setMode] = useState<MessageMode>("safe");
  const [webModeActivated, setWebModeActivated] = useState(false);

  const selectMode = (nextMode: MessageMode) => {
    setMode(nextMode);
    if (nextMode === "web") {
      setWebModeActivated(true);
    }
  };

  return (
    <section className="combined-page messages-page" aria-label="Mesajlar">
      {whatsappEnabled && <div className="message-mode-switch" role="tablist" aria-label="Mesaj gönderme modu">
        {whatsappEnabled && <button className={mode === "safe" ? "is-active" : ""} type="button" role="tab" aria-selected={mode === "safe"} onClick={() => selectMode("safe")}>
          <ShieldCheck size={18} aria-hidden="true" />
          <span><strong>Güvenli Mod</strong><small>Mesajı kontrol et, kopyala veya bağlantıyı aç</small></span>
        </button>}
        {whatsappEnabled && <button className={mode === "web" ? "is-active" : ""} type="button" role="tab" aria-selected={mode === "web"} onClick={() => selectMode("web")}>
          <MessageCircle size={18} aria-hidden="true" />
          <span><strong>WhatsApp Web Modu</strong><small>İsteğe bağlı gelişmiş gönderim alanı</small></span>
        </button>}
      </div>}

      {whatsappEnabled && <div className={mode === "safe" ? "message-mode-content" : "message-mode-content is-hidden"}>{safeMode}</div>}
      {whatsappEnabled && webModeActivated && <div className={mode === "web" ? "message-mode-content" : "message-mode-content is-hidden"}>{webMode}</div>}
      {aiEnabled && aiOpen && <div className="messages-ai-tools">{aiTools}</div>}
    </section>
  );
}
