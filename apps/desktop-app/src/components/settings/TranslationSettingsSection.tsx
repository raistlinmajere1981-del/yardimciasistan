import { useEffect, useState } from "react";
import type { TranslationSettings } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { ServiceSettingsCard } from "./ServiceSettingsCard";

const empty: TranslationSettings = {enabled:false, sourceLanguage:"tr", targetLanguages:[], automatic:false};
export function useTranslationSettings(enabled: boolean) {
  const [saved, setSaved] = useState(empty), [draft, setDraft] = useState(empty);
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
  return { saved, draft, setDraft, loading, saving, error, dirty:JSON.stringify(saved) !== JSON.stringify(draft),
    discard:() => setDraft(saved), save:async () => {
      setSaving(true); setError("");
      try {
        if (!window.yardimciDesktop?.saveTranslationSettings) throw Error();
        const result = await window.yardimciDesktop.saveTranslationSettings(draft);
        if (!result.ok) { setError(result.message); return {ok:false as const,message:result.message}; }
        setSaved(result.value); setDraft(result.value); return {ok:true as const,changed:true,message:"Çoklu Dil ayarları kaydedildi."};
      } catch { const message = "Dil ayarları kaydedilemedi. Taslak korundu."; setError(message); return {ok:false as const,message}; }
      finally { setSaving(false); }
    }
  };
}
export function TranslationSettingsSection({ controller, disabled, aiAvailable }: { controller: ReturnType<typeof useTranslationSettings>; disabled: boolean; aiAvailable: boolean }) {
  const {draft, setDraft} = controller;
  const [language, setLanguage] = useState("en");
  return <ServiceSettingsCard id="settings-translation" title="Çoklu Dil" enabled={draft.enabled}
    onEnabledChange={enabled => setDraft({...draft,enabled})} disabled={disabled || controller.loading || controller.saving}
    readiness="Test kullanılamıyor">
    {controller.error && <p role="alert">{controller.error}</p>}
    <label className="form-field">Kaynak dil<select value="tr" disabled><option value="tr">Türkçe</option></select></label>
    <div className="form-stack">
      <label className="form-field">Hedef yayın dili kodu<input value={language} onChange={e => setLanguage(e.target.value)} placeholder="en" maxLength={6}/></label>
      <ActionButton variant="secondary" disabled={!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(language) || language === "tr" || draft.targetLanguages.includes(language) || draft.targetLanguages.length >= 16}
        onClick={() => setDraft({...draft,targetLanguages:[...draft.targetLanguages,language]})}>Hedef Dili Ekle</ActionButton>
      <div className="action-row">{draft.targetLanguages.map(l => <ActionButton key={l} variant="secondary" aria-label={`${l} dilini kaldır`}
        onClick={() => setDraft({...draft,targetLanguages:draft.targetLanguages.filter(v => v !== l)})}>{l} ×</ActionButton>)}</div>
    </div>
    <label className="form-check"><input type="checkbox" checked={draft.automatic} disabled={!aiAvailable} onChange={e => setDraft({...draft,automatic:e.target.checked})}/> AI ile otomatik çeviri</label>
  </ServiceSettingsCard>;
}
