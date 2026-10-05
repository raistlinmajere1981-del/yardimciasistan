import { observeNexaAi } from "./nexa-activity";
import { useEffect, useRef, useState } from "react";
import type { SyncState } from "./runtime-state";

export function useDashboardAi(aiEnabled: boolean) {
  const [state, setState] = useState<SyncState>("idle");
  const [message, setMessage] = useState("");
  const [content, setContent] = useState("");
  const [fallback, setFallback] = useState(false);
  const generationRef = useRef(0);

  useEffect(() => {
    if (aiEnabled) return;
    generationRef.current += 1;
    setState("idle");
    setMessage("");
    setContent("");
    setFallback(false);
  }, [aiEnabled]);

  async function generateDailyEvaluation() {
    if (!aiEnabled) {
      setState("error");
      setMessage("AI bu işletmede etkin değil.");
      return;
    }

    const bridge = window.yardimciDesktop;
    if (!bridge?.generateDailyBusinessEvaluation) {
      setState("error");
      setMessage("Günlük değerlendirme aracı hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    const generation = ++generationRef.current;
    setState("loading");
    setMessage("Günlük işletme değerlendirmesi hazırlanıyor...");

    try {
      const result = await observeNexaAi(() => bridge.generateDailyBusinessEvaluation(), "response", () => generation === generationRef.current && aiEnabled);
      if (generation !== generationRef.current || !aiEnabled) return;
      if (!result.ok) {
        setState("error");
        setMessage(result.message);
        return;
      }

      setContent(result.content);
      setFallback(result.fallback);
      setState("success");
      setMessage(result.message);
    } catch {
      if (generation !== generationRef.current || !aiEnabled) return;
      setState("error");
      setMessage("Günlük işletme değerlendirmesi hazırlanamadı.");
    }
  }

  return {
    state,
    message,
    content,
    fallback,
    generateDailyEvaluation
  };
}
