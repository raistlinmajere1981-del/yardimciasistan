import { useEffect, useRef, useState } from "react";
import type { DocumentKind, DocumentOutputMode, DocumentOutputRuleInput, DocumentOutputSettings, DocumentTrigger } from "@yardimci-asistan/shared";

const keyOf = (rule: DocumentOutputRuleInput) => `${rule.documentKind}:${rule.trigger}:${rule.channel}`;
export function useDocumentOutputSettings(kinds: DocumentKind[], authority: string, active: boolean, businessId: string | undefined, whatsappEnabled: boolean) {
  const [loaded, setLoaded] = useState<{ authority: string; documents: DocumentOutputSettings[] } | null>(null);
  const [staged, setStaged] = useState<Record<string, DocumentOutputRuleInput>>({});
  const [saved, setSaved] = useState<Record<string, DocumentOutputRuleInput>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deniedAuthority, setDeniedAuthority] = useState<string | null>(null);
  const latestAuthority = useRef(authority);
  const authorityGeneration = useRef(0);
  if (latestAuthority.current !== authority) authorityGeneration.current++;
  latestAuthority.current = authority;
  const stagedBusiness = useRef<string | undefined>(undefined);
  const kindsKey = kinds.join(",");
  useEffect(() => {
    let cancelled = false;
    if (!active || !kindsKey) return;
    setError("");
    const bridge = window.yardimciDesktop;
    if (!bridge?.getDocumentOutputSettings || !bridge?.saveDocumentOutputRule) { setError("Belge ayarları bağlantısı kullanılamıyor."); return; }
    void Promise.all(kindsKey.split(",").map(documentKind => bridge.getDocumentOutputSettings({ documentKind: documentKind as DocumentKind })))
      .then(results => {
        if (cancelled) return;
        const documents = results.map(result => { if (!result.ok) throw new Error(result.message); return result.value; });
        setLoaded({ authority, documents });
        setSaved({});
      }).catch(() => { if (!cancelled) setError("Belge ayarları okunamadı. Çalışma alanını kapatıp tekrar açın."); });
    return () => { cancelled = true; };
  }, [active, authority, kindsKey]);
  const tenantChanged = Object.keys(staged).length > 0 && stagedBusiness.current !== undefined && stagedBusiness.current !== businessId;
  const ready = active && loaded?.authority === authority && !tenantChanged && deniedAuthority !== authority;
  const baseline: Record<string, DocumentOutputRuleInput> = {};
  for (const doc of loaded?.documents ?? []) for (const rule of doc.rules) baseline[keyOf(rule)] = rule;
  Object.assign(baseline, saved);
  const dirtyRules = Object.values(staged).filter(rule => rule.mode !== (baseline[keyOf(rule)]?.mode ?? "OFF"));
  const dirty = dirtyRules.length > 0 || (tenantChanged && Object.keys(staged).length > 0);
  const whatsappAvailable = ready && loaded.documents.some(doc => doc.whatsappEnabled) && whatsappEnabled;
  const canSave = ready && dirtyRules.every(rule => kinds.includes(rule.documentKind) && (rule.channel === "print" || whatsappAvailable));
  const mode = (kind: DocumentKind, trigger: DocumentTrigger, channel: "print" | "whatsapp"): DocumentOutputMode => {
    const key = `${kind}:${trigger}:${channel}`;
    return staged[key]?.mode ?? baseline[key]?.mode ?? "OFF";
  };
  const change = (documentKind: DocumentKind, trigger: DocumentTrigger, channel: "print" | "whatsapp", mode: DocumentOutputMode) => {
    if (!ready || saving) return;
    const rule: DocumentOutputRuleInput = { documentKind, trigger, channel, mode, adapter: channel === "print" ? "native_print" : "whatsapp_webview" };
    stagedBusiness.current = businessId;
    setStaged(previous => {
      const next = { ...previous };
      if (mode === (baseline[keyOf(rule)]?.mode ?? "OFF")) delete next[keyOf(rule)];
      else next[keyOf(rule)] = rule;
      return next;
    });
  };
  const save = async () => {
    if (!canSave || saving || !dirty || !window.yardimciDesktop?.saveDocumentOutputRule) return false;
    const started = authority;
    const generation = authorityGeneration.current;
    setSaving(true); setError("");
    try {
      for (const rule of dirtyRules) {
        if (latestAuthority.current !== started || authorityGeneration.current !== generation) throw new Error("Yetki değişti. Ayarlar kaydedilmedi.");
        const result = await window.yardimciDesktop.saveDocumentOutputRule(rule);
        if (!result.ok) {
          if (["DOCUMENT_SESSION_LOCKED", "DOCUMENT_CAPABILITY_DISABLED", "DOCUMENT_OWNER_REQUIRED"].includes(result.code)) setDeniedAuthority(started);
          throw new Error(result.message);
        }
        if (latestAuthority.current !== started || authorityGeneration.current !== generation) throw new Error("Yetki değişti. Kayıt durumunu yeniden kontrol edin.");
        setSaved(previous => ({ ...previous, [keyOf(result.value)]: result.value }));
        setStaged(previous => { const next = { ...previous }; delete next[keyOf(rule)]; return next; });
      }
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ayarların tamamı kaydedilemedi. Değişiklikleri kontrol edip tekrar deneyin."); return false; }
    finally { setSaving(false); }
  };
  return { ready, canSave, saving, dirty, error: tenantChanged ? "İşletme değişti. Önce önceki işletmenin taslağından vazgeçin."
      : deniedAuthority === authority ? "Yetki değişti. Çalışma alanını kapatıp yeniden açın."
        : dirty && ready && !canSave ? "Değiştirilen belge veya kanal artık etkin değil. Vazgeçerek devam edin." : error, mode, change, save,
    whatsappAvailable,
    discard: () => { if (!saving) { stagedBusiness.current = undefined; setStaged({}); setError(""); } } };
}
