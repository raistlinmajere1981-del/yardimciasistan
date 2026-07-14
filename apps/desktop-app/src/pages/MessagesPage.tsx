import { MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";

type MessageMode = "safe" | "web";

interface MessagesPageProps {
  safeMode: ReactNode;
  webMode: ReactNode;
  aiTools: ReactNode;
  aiEnabled: boolean;
  whatsappEnabled: boolean;
  aiOpen: boolean;
  onAiOpenChange: (open: boolean) => void;
}

export function MessagesPage({ safeMode, webMode, aiTools, aiEnabled, whatsappEnabled, aiOpen, onAiOpenChange }: MessagesPageProps) {
  const [mode, setMode] = useState<MessageMode>("safe");

  return (
    <section className="combined-page messages-page" aria-label="Mesajlar">
      <div className="message-mode-switch" role="tablist" aria-label="Mesaj gönderme modu">
        {whatsappEnabled && <button className={mode === "safe" ? "is-active" : ""} type="button" role="tab" aria-selected={mode === "safe"} onClick={() => setMode("safe")}>
          <ShieldCheck size={18} aria-hidden="true" />
          <span><strong>Güvenli Mod</strong><small>Mesajı kontrol et, kopyala veya bağlantıyı aç</small></span>
        </button>}
        {whatsappEnabled && <button className={mode === "web" ? "is-active" : ""} type="button" role="tab" aria-selected={mode === "web"} onClick={() => setMode("web")}>
          <MessageCircle size={18} aria-hidden="true" />
          <span><strong>WhatsApp Web Modu</strong><small>İsteğe bağlı gelişmiş gönderim alanı</small></span>
        </button>}
        {aiEnabled && (
          <button className="ai-tools-toggle" type="button" onClick={() => onAiOpenChange(!aiOpen)}>
            <Sparkles size={18} aria-hidden="true" />
            {aiOpen ? "AI Araçlarını Kapat" : "AI Araçları"}
          </button>
        )}
      </div>

      {whatsappEnabled && mode === "web" && (
        <p className="optional-mode-note">WhatsApp Web modu isteğe bağlıdır. Bağlantı koparsa güvenli moddan mesajı kopyalayıp gönderebilirsiniz.</p>
      )}

      {whatsappEnabled && (mode === "safe" ? safeMode : webMode)}
      {aiEnabled && aiOpen && <div className="messages-ai-tools">{aiTools}</div>}
    </section>
  );
}
