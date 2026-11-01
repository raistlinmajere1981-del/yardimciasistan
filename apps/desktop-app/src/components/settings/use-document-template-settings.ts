import { useEffect, useRef, useState } from "react";
import type { DocumentKind, DocumentOutputTemplateReadResult, DocumentTemplateLayout } from "@yardimci-asistan/shared";

export function useDocumentTemplateSettings(kinds: DocumentKind[], authority: string, active: boolean, businessId: string | undefined) {
  const [loaded, setLoaded] = useState<{ authority: string; documents: DocumentOutputTemplateReadResult[] } | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<DocumentKind, { expectedRevision: number | null; layout: DocumentTemplateLayout }>>>({});
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
    const bridge = window.yardimciDesktop;
    if (!bridge?.readDocumentOutputTemplate) { setError("Şablon bağlantısı kullanılamıyor."); return; }
    void Promise.all(kindsKey.split(",").map(kind => bridge.readDocumentOutputTemplate({ documentKind: kind as DocumentKind })))
      .then(results => {
        if (cancelled) return;
        const documents = results.map(result => { if (!result.ok) throw Error(); return result.value; });
        setLoaded({ authority, documents });
      }).catch(() => { if (!cancelled) setError("Şablonlar okunamadı. Çalışma alanını yeniden açın."); });
    return () => { cancelled = true; };
  }, [active, authority, kindsKey]);
  const dirty = Object.keys(drafts).length > 0;
  const tenantChanged = dirty && tenant.current !== businessId;
  const ready = active && loaded?.authority === authority && !tenantChanged && denied !== authority;
  const canSave = ready && Object.keys(drafts).every(kind => kinds.includes(kind as DocumentKind));
  const baseline = (kind: DocumentKind) => loaded?.authority === authority ? loaded.documents.find(doc => doc.documentKind === kind) : undefined;
  const stage = (kind: DocumentKind, layout: DocumentTemplateLayout) => {
    if (!ready || saving) return;
    tenant.current = businessId;
    setDrafts(previous => {
      const next = { ...previous };
      if (JSON.stringify(layout) === JSON.stringify(baseline(kind)?.layout)) delete next[kind];
      else next[kind] = { expectedRevision: previous[kind] ? previous[kind].expectedRevision : baseline(kind)?.revision ?? null, layout };
      return next;
    });
    setNotice("");
  };
  const save = async () => {
    if (!dirty || !canSave || saving) return;
    const started = authority;
    setSaving(true); setError(""); setNotice("");
    try {
      for (const [kind, draft] of Object.entries(drafts)) {
        if (!draft || latest.current !== started) throw Error("Yetki değişti. Kayıt durumunu yeniden kontrol edin.");
        const result = await window.yardimciDesktop!.saveDocumentOutputTemplate({ documentKind: kind as DocumentKind, ...draft });
        if (!result.ok) {
          if (["DOCUMENT_SESSION_LOCKED", "DOCUMENT_CAPABILITY_DISABLED", "DOCUMENT_OWNER_REQUIRED"].includes(result.code)) setDenied(started);
          throw Error(result.message);
        }
        if (latest.current !== started) throw Error("Yetki değişti. Kayıt durumunu yeniden kontrol edin.");
        setLoaded(previous => previous && ({ ...previous, documents: [...previous.documents.filter(doc => doc.documentKind !== kind), result.value] }));
        setDrafts(previous => { const next = { ...previous }; delete next[kind as DocumentKind]; return next; });
      }
      setNotice("Şablonlar kaydedildi. Çıktı işi oluşturulmadı.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Şablon kaydedilemedi."); }
    finally { setSaving(false); }
  };
  const pickFormImage = async (kind: DocumentKind, layout: DocumentTemplateLayout) => {
    if (!ready || saving || picking) return;
    const started = authority;
    setPicking(true); setError("");
    try {
      const result = await window.yardimciDesktop!.pickFormImage({ documentKind: kind });
      if (!mounted.current || latest.current !== started) return;
      if (!result.ok) {
        if (["DOCUMENT_SESSION_LOCKED", "DOCUMENT_CAPABILITY_DISABLED", "DOCUMENT_OWNER_REQUIRED"].includes(result.code)) setDenied(started);
        throw Error(result.message);
      }
      if (result.value) stage(kind, { ...layout, scan: { originalImageRef: result.value.imageRef, processedImageRef: null, foreground: false } });
    } catch { if (mounted.current && latest.current === started) setError("Boş form görseli seçilemedi. JPG/PNG, en çok 12 MB ve 25 megapiksel görsel seçin."); }
    finally { if (mounted.current) setPicking(false); }
  };
  const saveProcessedImage = async (kind: DocumentKind, layout: DocumentTemplateLayout, produce: () => Promise<string>) => {
    if (!ready || saving || picking || !layout.scan) return false;
    const started = authority;
    const generation = authorityGeneration.current;
    setPicking(true); setError("");
    try {
      const dataUrl = await produce();
      if (!mounted.current || (latest.current !== started || authorityGeneration.current !== generation)) return false;
      const prefix = "data:image/png;base64,";
      if (!dataUrl.startsWith(prefix)) throw Error("PNG oluşturulamadı. Yeniden deneyin.");
      const result = await window.yardimciDesktop!.saveProcessedFormImage({ documentKind: kind, originalImageRef: layout.scan.originalImageRef, pngBase64: dataUrl.slice(prefix.length) });
      if (!mounted.current || (latest.current !== started || authorityGeneration.current !== generation)) return false;
      if (!result.ok) {
        if (["DOCUMENT_SESSION_LOCKED", "DOCUMENT_CAPABILITY_DISABLED", "DOCUMENT_OWNER_REQUIRED"].includes(result.code)) setDenied(started);
        throw Error("Hazırlanan görsel kaydedilemedi. Yeniden Uygula'yı deneyin.");
      }
      stage(kind, { ...layout, scan: { ...layout.scan, processedImageRef: result.value.imageRef, foreground: false } });
      return true;
    } catch (cause) {
      if (mounted.current && latest.current === started && authorityGeneration.current === generation) setError(cause instanceof Error ? cause.message : "Görsel hazırlanamadı. Köşeleri kontrol edip yeniden deneyin.");
      return false;
    } finally { if (mounted.current) setPicking(false); }
  };
  return { ready, dirty, saving: saving || picking, canSave, stage, save, notice, pickFormImage, saveProcessedImage,
    error: tenantChanged ? "İşletme değişti. Önce şablon taslağından vazgeçin." : denied === authority ? "Şablon yetkisi değişti. Çalışma alanını yeniden açın." : dirty && ready && !canSave ? "Değiştirilen belge artık etkin değil. Şablon taslaklarından vazgeçerek devam edin." : error,
    layout: (kind: DocumentKind) => tenantChanged ? null : drafts[kind]?.layout ?? baseline(kind)?.layout ?? null,
    revision: (kind: DocumentKind) => baseline(kind)?.revision ?? null,
    discard: () => { if (!saving && !picking) { setDrafts({}); setError(""); setNotice(""); tenant.current = undefined; } } };
}
