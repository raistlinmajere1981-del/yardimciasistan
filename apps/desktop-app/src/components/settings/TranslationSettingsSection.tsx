import { useEffect, useState } from "react";
import { PUBLIC_LANGUAGES, type TranslationSettings } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { ServiceSettingsCard } from "./ServiceSettingsCard";

const empty: TranslationSettings = {enabled:false, sourceLanguage:"tr", targetLanguages:[], automatic:false};
export function useTranslationSettings(enabled: boolean) {
  const [saved, setSaved] = useState(empty), [draft, setDraft] = useState(empty);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!enabled || !window.yardimciDesktop?.getTranslationSettings) { setLoading(false); return; }
    void window.yardimciDesktop.getTranslationSettings().then(result => {
      if (!active) return;
      if (result.ok) { setSaved(result.value); setDraft(result.value); } else setError(result.message);
    }).catch(() => { if (active) setError("Dil ayarları okunamadı. Kilidi ve bağlantıyı kontrol edin."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !saved.enabled || !window.yardimciDesktop?.getTranslationJob) { setStatus(""); return; }
    let active = true;
    const bridge = window.yardimciDesktop;
    const poll = async () => {
      try {
        const result = await bridge.getTranslationJob();
        if (active && result.ok) setStatus(result.value?.message ?? "Eksik çeviriler otomatik hazırlanacak. Türkçe yayın devam ediyor.");
      } catch { if (active) setStatus("Çeviri durumu okunamadı. Oturum kilidini kontrol edin."); }
    };
    void poll(); const timer = setInterval(() => void poll(), 1500);
    return () => { active = false; clearInterval(timer); };
  }, [enabled, saved.enabled]);
  return { status, saved, draft, setDraft, loading, saving, error, dirty:JSON.stringify(saved) !== JSON.stringify(draft),
    discard:() => setDraft(saved), save:async () => {
      setSaving(true); setError("");
      try {
        if (!window.yardimciDesktop?.saveTranslationSettings) throw Error();
        const result = await window.yardimciDesktop.saveTranslationSettings({...draft, automatic:true});
        if (!result.ok) { setError(result.message); return {ok:false as const,message:result.message}; }
        setSaved(result.value); setDraft(result.value); return {ok:true as const,changed:true,message:"Çoklu Dil ayarları kaydedildi."};
      } catch { const message = "Dil ayarları kaydedilemedi. Taslak korundu."; setError(message); return {ok:false as const,message}; }
      finally { setSaving(false); }
    }
  };
}
export function TranslationSettingsSection({ controller, disabled, aiAvailable, blockedReason }: { controller: ReturnType<typeof useTranslationSettings>; disabled: boolean; aiAvailable: boolean; blockedReason?: string | undefined }) {
  const {draft, setDraft} = controller;
  const [language, setLanguage] = useState("");
  const choices = PUBLIC_LANGUAGES.filter(l => l.code !== "tr" && !draft.targetLanguages.includes(l.code));
  return <ServiceSettingsCard id="settings-translation" title="Çoklu Dil" enabled={draft.enabled}
    onEnabledChange={enabled => setDraft({...draft,enabled,automatic:true})} disabled={disabled || controller.loading || controller.saving}
    blockedReason={blockedReason} readiness="Test kullanılamıyor">
    {controller.error && <p role="alert">{controller.error}</p>}
    <label className="form-field">Kaynak dil<select value="tr" disabled><option value="tr">Türkçe</option></select></label>
    <div className="form-stack">
      <label className="form-field">Hedef yayın dili<select value={language} onChange={e => setLanguage(e.target.value)}>
        <option value="">Dil seçin</option>
        {choices.map(l => <option key={l.code} value={l.code}>{l.name} · {l.nativeName}</option>)}
      </select></label>
      <ActionButton variant="secondary" disabled={!choices.some(l => l.code === language) || draft.targetLanguages.length >= 16}
        onClick={() => { setDraft({...draft,automatic:true,targetLanguages:[...draft.targetLanguages,language]}); setLanguage(""); }}>Hedef Dili Ekle</ActionButton>
      <div className="action-row">{draft.targetLanguages.map(l => <ActionButton key={l} variant="secondary" aria-label={`${PUBLIC_LANGUAGES.find(v => v.code === l)?.name ?? l} dilini kaldır`}
        onClick={() => setDraft({...draft,targetLanguages:draft.targetLanguages.filter(v => v !== l)})}>{PUBLIC_LANGUAGES.find(v => v.code === l)?.name ?? l} ×</ActionButton>)}</div>
    </div>
    <p role="status">{!aiAvailable ? "AI etkin değil. Çeviriler hazırlanamadı; Türkçe yayın devam ediyor." : controller.status || "Kaydettiğiniz diller için eksik çeviriler AI ile otomatik ve paketler halinde hazırlanır. İşlemi Dil Yönetimi üzerinden duraklatabilir veya devam ettirebilirsiniz."}</p>
  </ServiceSettingsCard>;
}
