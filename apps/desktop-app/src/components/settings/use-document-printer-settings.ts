import { useEffect, useRef, useState } from "react";
import type { DocumentKind, DocumentPrinterSettings } from "@yardimci-asistan/shared";

export function useDocumentPrinterSettings(kinds: DocumentKind[], authority: string, active: boolean, businessId: string | undefined) {
  const [loaded, setLoaded] = useState<{ authority: string; documents: DocumentPrinterSettings[] } | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<DocumentKind, string | null>>>({});
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState<string | null>(null);
  const tenant = useRef<string | undefined>(undefined);
  const latest = useRef(authority);
  const authorityGeneration = useRef(0);
  if (latest.current !== authority) authorityGeneration.current++;
  latest.current = authority;
  const kindsKey = kinds.join(",");
  useEffect(() => {
    let cancelled = false;
    if (!active || !kindsKey) return;
    setLoaded(null);
    const bridge = window.yardimciDesktop;
    if (!bridge?.getDocumentPrinters) { setError("Yazıcı bağlantısı kullanılamıyor."); return; }
    void Promise.all(kindsKey.split(",").map(kind => bridge.getDocumentPrinters({ documentKind: kind as DocumentKind })))
      .then(results => {
        if (cancelled) return;
        const documents = results.map(result => { if (!result.ok) throw Error(result.message); return result.value; });
        setLoaded({ authority, documents }); setError("");
      }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Yazıcılar okunamadı."); });
    return () => { cancelled = true; };
  }, [active, authority, kindsKey, refresh]);
  const dirty = Object.keys(drafts).length > 0;
  const tenantChanged = dirty && tenant.current !== businessId;
  const ready = active && loaded?.authority === authority && !tenantChanged && denied !== authority;
  const baseline = (kind: DocumentKind) => loaded?.authority === authority ? loaded.documents.find(doc => doc.documentKind === kind) : undefined;
  const printerRef = (kind: DocumentKind) => Object.hasOwn(drafts, kind) ? drafts[kind] ?? null : baseline(kind)?.printerRef ?? null;
  const canSave = ready && Object.keys(drafts).every(key => {
    const kind = key as DocumentKind; const ref = printerRef(kind);
    return kinds.includes(kind) && (ref === null || baseline(kind)?.printers.some(printer => printer.name === ref));
  });
  const stage = (kind: DocumentKind, ref: string | null) => {
    if (!ready || saving) return;
    tenant.current = businessId;
    setDrafts(previous => {
      const next = { ...previous };
      if (ref === (baseline(kind)?.printerRef ?? null)) delete next[kind]; else next[kind] = ref;
      return next;
    });
  };
  const save = async () => {
    if (!dirty || !canSave || saving) return false;
    const started = authority;
    const generation = authorityGeneration.current;
    setSaving(true); setError("");
    try {
      for (const [kind, ref] of Object.entries(drafts)) {
        if (latest.current !== started || authorityGeneration.current !== generation) throw Error("Yetki değişti. Kayıt durumunu yeniden kontrol edin.");
        const result = await window.yardimciDesktop!.savePrinterBinding({ documentKind: kind as DocumentKind, printerRef: ref ?? null });
        if (!result.ok) {
          if (["DOCUMENT_SESSION_LOCKED", "DOCUMENT_CAPABILITY_DISABLED", "DOCUMENT_OWNER_REQUIRED"].includes(result.code)) setDenied(started);
          throw Error(result.message);
        }
        if (latest.current !== started || authorityGeneration.current !== generation) throw Error("Yetki değişti. Kayıt durumunu yeniden kontrol edin.");
        setLoaded(previous => previous && ({ ...previous, documents: [...previous.documents.filter(doc => doc.documentKind !== kind), result.value] }));
        setDrafts(previous => { const next = { ...previous }; delete next[kind as DocumentKind]; return next; });
      }
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Yazıcı ayarı kaydedilemedi."); return false; }
    finally { setSaving(false); }
  };
  return { ready, dirty, saving, canSave, stage, save, printerRef,
    printers: (kind: DocumentKind) => ready ? baseline(kind)?.printers ?? [] : [],
    error: tenantChanged ? "İşletme değişti. Önce yazıcı taslağından vazgeçin." : denied === authority ? "Yazıcı yetkisi değişti. Çalışma alanını yeniden açın." : error,
    refresh: () => { if (!saving) setRefresh(value => value + 1); },
    discard: () => { if (!saving) { setDrafts({}); setError(""); tenant.current = undefined; } } };
}
