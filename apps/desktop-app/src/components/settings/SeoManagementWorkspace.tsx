import { useEffect, useMemo, useState } from "react";
import { FileText, Globe2, Search, Share2, Sparkles } from "lucide-react";
import {
  PUBLIC_LANGUAGES, SEO_FIELDS,
  type SeoEditorSnapshot, type SeoFields, type SeoPageKey, type SeoProposal, type TranslationField
} from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { StatusBadge } from "../ui/StatusBadge";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { reportAppStatus } from "../../app/runtime-state";

const pageNames: Record<SeoPageKey, string> = {
  home: "Ana Sayfa", about: "Hakkımızda", rooms: "Odalar", restaurant: "Restoran",
  menu: "Menü", catalog: "Katalog", gallery: "Galeri", announcements: "Duyurular",
  reviews: "Yorumlar", contact: "İletişim"
};
const fieldNames: Record<keyof SeoFields, string> = {
  title: "Sayfa başlığı", description: "Arama açıklaması",
  og_title: "Paylaşım başlığı", og_description: "Paylaşım açıklaması"
};
const maxLength: Record<keyof SeoFields, number> = {
  title: 160, description: 500, og_title: 160, og_description: 500
};
const empty: SeoFields = { title: "", description: "", og_title: "", og_description: "" };

export function SeoManagementWorkspace({ onClose }: { onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<SeoEditorSnapshot | null>(null);
  const [page, setPage] = useState<SeoPageKey>("home");
  const [language, setLanguage] = useState("tr");
  const [draft, setDraft] = useState<SeoFields>(empty);
  const [saved, setSaved] = useState<SeoFields>(empty);
  const [translations, setTranslations] = useState<TranslationField[]>([]);
  const [suggestion, setSuggestion] = useState<SeoProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bridge = window.yardimciDesktop;
  const currentSource = useMemo(() => snapshot?.pages.find(item => item.page === page), [snapshot, page]);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  const closeBlocked = busy || loading || dirty;
  const sourceAvailable = SEO_FIELDS.some(field => Boolean(currentSource?.[field].trim()));
  const staleCount = translations.filter(item => item.state === "stale").length;

  const refresh = async () => {
    const result = await bridge!.getSeoSnapshot();
    if (!result.ok) throw Error(result.message);
    setSnapshot(result.value);
    return result.value;
  };
  useEffect(() => {
    let active = true;
    if (!bridge?.getSeoSnapshot) { setError("SEO Yönetimi kullanılamıyor."); setLoading(false); return; }
    void bridge.getSeoSnapshot().then(result => {
      if (!active) return;
      if (result.ok) setSnapshot(result.value);
      else setError(result.message);
    }).catch(() => { if (active) setError("SEO kayıtları okunamadı."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bridge]);
  useEffect(() => {
    let active = true;
    if (!snapshot) return;
    setSuggestion(null); setError("");
    const source = snapshot.pages.find(item => item.page === page);
    if (language === "tr") {
      const next = source ? Object.fromEntries(SEO_FIELDS.map(field => [field, source[field]])) as SeoFields : empty;
      setDraft(next); setSaved(next); setTranslations([]); setLoading(false);
      return;
    }
    setLoading(true);
    void bridge!.getTranslation({ kind: "seo", id: page }, language).then(result => {
      if (!active) return;
      if (!result.ok) {
        setError(sourceAvailable ? result.message : "Önce Türkçe SEO metnini kaydedin.");
        setDraft(empty); setSaved(empty); setTranslations([]); return;
      }
      const next = Object.fromEntries(SEO_FIELDS.map(field => [
        field, result.value.fields.find(item => item.field === field)?.text ?? ""
      ])) as SeoFields;
      setDraft(next); setSaved(next); setTranslations(result.value.fields);
    }).catch(() => { if (active) setError("Dil bazlı SEO kayıtları okunamadı."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bridge, snapshot, page, language, sourceAvailable]);

  async function save() {
    if (!snapshot || !currentSource || busy || loading || !dirty) return;
    setBusy(true); setError("");
    try {
      if (language === "tr") {
        const result = await bridge!.saveSeoSource(page, draft, currentSource.updatedAt);
        if (!result.ok) throw Error(result.message);
        await refresh();
      } else {
        if (SEO_FIELDS.some(field => Boolean(saved[field].trim()) && !draft[field].trim())) {
          throw Error("Kayıtlı çeviri silinemez. Alanı güncellemek için yeni metin yazın.");
        }
        const fields = translations.filter(item => draft[item.field as keyof SeoFields]?.trim())
          .filter(item => SEO_FIELDS.includes(item.field as keyof SeoFields))
          .map(item => ({
            field: item.field, sourceHash: item.sourceHash, text: draft[item.field as keyof SeoFields]
          }));
        if (fields.length === 0) throw Error("Önce Türkçe kaynak metni kaydedin. Boş çeviri yayınlanamaz.");
        const result = await bridge!.saveTranslation({ kind: "seo", id: page, language, fields });
        if (!result.ok) throw Error(result.message);
        const refreshed = await bridge!.getTranslation({ kind: "seo", id: page }, language);
        if (refreshed.ok) setTranslations(refreshed.value.fields);
        setSaved(draft);
      }
      setSuggestion(null);
      reportAppStatus("success", "SEO kaydı kaydedildi. Mevcut web yayınıyla eşitlenecek.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "SEO kaydı kaydedilemedi.");
    } finally { setBusy(false); }
  }

  async function generate() {
    if (!snapshot || busy || loading) return;
    setBusy(true); setError(""); setSuggestion(null);
    try {
      const result = await bridge!.suggestSeoCopy(page, language);
      if (!result.ok) throw Error(result.message);
      setSuggestion(result.value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI önerisi hazırlanamadı.");
    } finally { setBusy(false); }
  }

  const discard = () => { setDraft(saved); setSuggestion(null); setError(""); };
  const fieldEditor = (field: keyof SeoFields) => {
    const fieldState = translations.find(item => item.field === field);
    const blocked = language !== "tr" && !fieldState;
    return <label className="seo-management__field" key={field}>
      <span className="seo-management__field-heading">
        <strong>{fieldNames[field]}</strong>
        <span className="seo-management__field-meta">
          {language !== "tr" && fieldState?.origin && <StatusBadge tone={fieldState.state === "stale" ? "warning" : "neutral"}>
            {fieldState.origin === "manual" ? "Manuel" : "AI"} · {fieldState.state === "stale" ? "Güncelle" : fieldState.state === "ready" ? "Hazır" : fieldState.state}
          </StatusBadge>}
          <small>{draft[field].length}/{maxLength[field]}</small>
        </span>
      </span>
      <textarea rows={field.endsWith("description") ? 3 : 2} value={draft[field]}
        maxLength={maxLength[field]} disabled={busy || loading || blocked}
        placeholder={blocked ? "Türkçe kaynak alanı boş." : "Boşsa site varsayılanını kullanır."}
        onChange={event => { setDraft(current => ({ ...current, [field]: event.target.value })); setSuggestion(null); }} />
    </label>;
  };

  return <WorkspaceFrame title="SEO Yönetimi" closeLabel="SEO Yönetimini kapat" presentation="centered"
    className="seo-management" bodyScroll="panes" closeBlocked={closeBlocked} onClose={onClose}
    footer={<>
      <div className="seo-management__feedback" aria-live="polite">
        {error && <p role="alert">{error}</p>}
        {dirty && <p role="status">Kaydedilmemiş değişiklikler var.</p>}
      </div>
      <div className="seo-management__footer-actions">
        <ActionButton variant="secondary" disabled={!dirty || busy || loading} onClick={discard}>Değişiklikleri geri al</ActionButton>
        <ActionButton disabled={!dirty || busy || loading} busy={busy} busyLabel="Kaydediliyor…" onClick={() => void save()}>Kaydet</ActionButton>
      </div>
    </>}>
    <div className="seo-management__layout" aria-busy={loading}>
      <nav className="seo-management__pages" aria-label="SEO sayfaları">
        <h3>Sayfalar</h3>
        {snapshot?.pages.map(item => <ActionButton key={item.page} variant="ghost"
          aria-pressed={page === item.page} aria-controls="seo-management-editor"
          disabled={closeBlocked} onClick={() => setPage(item.page)}>
          <FileText size={16} aria-hidden="true" />
          <span>{pageNames[item.page]}
            <small className="seo-management__page-meta">{SEO_FIELDS.some(field => item[field].trim()) ? "Özel metin" : "Site varsayılanı"}</small>
          </span>
        </ActionButton>)}
      </nav>

      <section className="seo-management__editor" id="seo-management-editor" aria-label="SEO metin düzenleyicisi">
        <div className="seo-management__editor-heading">
          <div>
            <h3>{pageNames[page]}</h3>
            <small>Arama ve paylaşım metinleri</small>
          </div>
          <label className="seo-management__language"><span><Globe2 size={15} aria-hidden="true" /> Yayın dili</span>
            <select value={language} disabled={closeBlocked}
              onChange={event => setLanguage(event.target.value)}>
              {snapshot?.languages.map(code => {
                const lang = PUBLIC_LANGUAGES.find(item => item.code === code);
                return <option key={code} value={code}>{lang?.nativeName ?? code} ({code})</option>;
              })}
            </select>
          </label>
        </div>
        {language !== "tr" && <div className="seo-management__source-status" role="status">
          <StatusBadge tone={!sourceAvailable || staleCount > 0 ? "warning" : "info"}>
            {!sourceAvailable ? "Kaynak gerekli" : staleCount > 0 ? staleCount + " alan güncel değil" : "TR kaynağa bağlı"}
          </StatusBadge>
          <small>{!sourceAvailable ? "Türkçe metin oluşturun." : "Çeviriler Türkçe kaynağa bağlıdır."}</small>
        </div>}
        <section className="seo-management__group" aria-label="Arama görünümü metinleri">
          <div className="seo-management__group-heading">
            <Search size={17} aria-hidden="true" />
            <h4>Arama sonuçları</h4>
          </div>
          {fieldEditor("title")}
          {fieldEditor("description")}
        </section>
        <section className="seo-management__group" aria-label="Sosyal paylaşım metinleri">
          <div className="seo-management__group-heading">
            <Share2 size={17} aria-hidden="true" />
            <h4>Sosyal paylaşım</h4>
          </div>
          {fieldEditor("og_title")}
          {fieldEditor("og_description")}
        </section>
        <div className="seo-management__ai-actions">
          <ActionButton variant="secondary" disabled={!snapshot || loading || busy || (language !== "tr" && !sourceAvailable)}
            busy={busy} busyLabel="Hazırlanıyor…" onClick={() => void generate()}>
            <Sparkles size={16} aria-hidden="true" /> AI önerisi oluştur
          </ActionButton>
          <small>Öneri yalnız taslağa uygulanır.</small>
        </div>
        {suggestion && <section className="seo-management__suggestion" aria-label="AI SEO önerisi">
          <div className="seo-management__suggestion-heading">
            <h4>AI önerisi · {language.toUpperCase()}</h4>
            <StatusBadge tone="info">Kaydedilmedi</StatusBadge>
          </div>
          <strong>{suggestion.fields.title}</strong>
          <p>{suggestion.fields.description}</p>
          <strong>{suggestion.fields.og_title}</strong>
          <p>{suggestion.fields.og_description}</p>
          <ActionButton variant="secondary" disabled={busy || loading}
            onClick={() => { setDraft(suggestion.fields); setSuggestion(null); }}>
            Taslağa uygula
          </ActionButton>
        </section>}
      </section>

      <aside className="seo-management__preview" aria-label="SEO önizleme ve yayın kuralları">
        <div className="seo-management__preview-heading">
          <h3>Önizleme</h3>
          <StatusBadge tone="neutral">Taslak</StatusBadge>
        </div>
        <section className="seo-management__preview-block">
          <span className="seo-management__eyebrow"><Search size={14} aria-hidden="true" /> Arama sonucu</span>
          <div className="seo-management__search-preview">
            <small>{pageNames[page]} · {language.toUpperCase()}</small>
            <strong>{draft.title || pageNames[page]}</strong>
            <p>{draft.description || "Site varsayılanı kullanılacak."}</p>
          </div>
        </section>
        <section className="seo-management__preview-block">
          <span className="seo-management__eyebrow"><Share2 size={14} aria-hidden="true" /> Sosyal paylaşım</span>
          <div className="seo-management__social-preview">
            <div className="seo-management__social-media"><Share2 size={28} aria-hidden="true" /></div>
            <div className="seo-management__social-copy">
              <strong>{draft.og_title || draft.title || pageNames[page]}</strong>
              <p>{draft.og_description || draft.description || "Site varsayılanı kullanılacak."}</p>
            </div>
          </div>
        </section>
        <section className="seo-management__rules">
          <h3>Yayın kuralları</h3>
          <div><span>Canonical adres</span><StatusBadge tone="success">Otomatik</StatusBadge></div>
          <div><span>Dil bağlantıları</span><StatusBadge tone="success">Otomatik</StatusBadge></div>
          <div><span>QR / hesap sayfaları</span><StatusBadge tone="muted">İndeks dışı</StatusBadge></div>
          {language !== "tr" && sourceAvailable && <div className="seo-management__source"><span>Türkçe kaynak</span><small>{currentSource?.title || pageNames[page]}</small></div>}
        </section>
        <small className="seo-management__preview-note">Önizleme temsilidir. Boş alanlar web sitesinin varsayılan metnini kullanır.</small>
      </aside>
    </div>
  </WorkspaceFrame>;
}
