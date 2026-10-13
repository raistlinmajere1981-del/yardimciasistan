import { useEffect, useRef, useState } from "react";
import type { MarketingAiCapability, MarketingChannel } from "@yardimci-asistan/shared";
import { Sparkles } from "lucide-react";
import { ActionButton } from "../ui/ActionButton";
import { observeNexaAi } from "../../app/nexa-activity";
import { resultValue } from "./share-draft";
import { ReadAloudButton, SpeechTextField } from "../speech/SpeechTextField";

export function MarketingTextAssistant({text, channel, capabilities, onApply, onBusy}: {
  text: string; channel?: MarketingChannel; capabilities: MarketingAiCapability[];
  onApply: (text: string) => void; onBusy: (busy: boolean) => void;
}) {
  const [instructions, setInstructions] = useState("");
  const [candidate, setCandidate] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  // The parent prevents navigation while busy; generation never publishes or applies automatically.
  async function generate(capability: MarketingAiCapability) {
    if (busy) return;
    setBusy(true); onBusy(true); setError("");
    try {
      const value = resultValue(await observeNexaAi(() => window.yardimciDesktop!.generateMarketingAi({capability, ...(channel === undefined ? {} : { channel }), text, instructions}), "response", () => active.current));
      if (active.current) setCandidate(value.text || "");
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : "Metin oluşturulamadı."); }
    finally { if (active.current) { setBusy(false); onBusy(false); } }
  }
  return <section className="form-stack" aria-label="Metin asistanı">
    <p>Nasıl bir paylaşım istediğinizi anlatın. Sonucu inceleyip metninize uygulayın.</p>
    <SpeechTextField contextKey={channel ?? "master"} label="AI talimatı" value={instructions} maxLength={2000} rows={3} disabled={busy} placeholder="Örneğin: Yaz indirimini kısa ve samimi bir dille duyur." onChange={setInstructions} />
    <div className="marketing-actions">
      <ActionButton busy={busy} disabled={!capabilities.includes(channel ? "channel_adaptation" : "text_generation")} onClick={() => void generate(channel ? "channel_adaptation" : "text_generation")}><Sparkles size={16}/>AI ile metin oluştur</ActionButton>
      <ActionButton variant="secondary" disabled={busy || !text.trim() || !capabilities.includes("rewrite")} onClick={() => void generate("rewrite")}>AI ile yeniden yaz</ActionButton>
    </div>
    <label className="form-field form-field--fluid">AI taslak önizlemesi<textarea aria-label="AI taslak önizlemesi" rows={9} value={candidate} maxLength={12000} disabled={busy} placeholder="Oluşturulan metin burada görünecek. Uygulamadan önce düzenleyebilirsiniz." onChange={e => setCandidate(e.target.value)}/></label>
    <ReadAloudButton key={channel ?? "master"} text={candidate} disabled={busy} />
    <ActionButton disabled={busy || !candidate.trim()} onClick={() => onApply(candidate)}>Metni uygula</ActionButton>
    <p role="status">{error || (capabilities.length ? "AI sonucu siz uygulayana kadar paylaşım metni değişmez." : "AI metin hizmeti şu anda kullanılamıyor.")}</p>
  </section>;
}
