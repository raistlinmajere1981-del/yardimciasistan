import { useEffect, useMemo, useState } from "react";
import {
  PUBLIC_LANGUAGES, SEO_FIELDS,
  type SeoEditorSnapshot, type SeoFields, type SeoPageKey, type SeoProposal, type TranslationField
} from "@yardimci-asistan/shared";
import { ModalSurface } from "../ui/ModalSurface";
import { ActionButton } from "../ui/ActionButton";
import { WorkspaceHeader } from "../workspace/WorkspaceHeader";
import { reportAppStatus } from "../../app/runtime-state";

const pageNames: Record<SeoPageKey,string> = {
  home:"Ana Sayfa",about:"Hakkımızda",rooms:"Odalar",restaurant:"Restoran",
  menu:"Menü",catalog:"Katalog",gallery:"Galeri",announcements:"Duyurular",
  reviews:"Yorumlar",contact:"İletişim"
};
const fieldNames: Record<keyof SeoFields,string> = {
  title:"SEO başlığı",description:"Arama sonucu açıklaması",
  og_title:"Open Graph / sosyal paylaşım başlığı",
  og_description:"Open Graph / sosyal paylaşım açıklaması"
};
const maxLength: Record<keyof SeoFields,number> = {
  title:160,description:500,og_title:160,og_description:500
};
const empty:SeoFields = {title:"",description:"",og_title:"",og_description:""};

export function SeoManagementWorkspace({onClose}: {onClose:()=>void}) {
  const [snapshot,setSnapshot] = useState<SeoEditorSnapshot|null>(null);
  const [page,setPage] = useState<SeoPageKey>("home");
  const [language,setLanguage] = useState("tr");
  const [draft,setDraft] = useState<SeoFields>(empty);
  const [saved,setSaved] = useState<SeoFields>(empty);
  const [translations,setTranslations] = useState<TranslationField[]>([]);
  const [suggestion,setSuggestion] = useState<SeoProposal|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const bridge=window.yardimciDesktop;
  const currentSource = useMemo(()=>snapshot?.pages.find(p=>p.page===page),[snapshot,page]);
  const dirty=JSON.stringify(saved)!==JSON.stringify(draft);
  const closeBlocked=busy || loading || dirty;
  const sourceAvailable=SEO_FIELDS.some(field=>Boolean(currentSource?.[field].trim()));

  const refresh = async () => {
    const result=await bridge!.getSeoSnapshot();
    if(!result.ok) throw Error(result.message);
    setSnapshot(result.value);
    return result.value;
  };
  useEffect(()=>{
    let active=true;
    if(!bridge?.getSeoSnapshot) {setError("SEO Yönetimi kullanılamıyor.");setLoading(false);return;}
    void bridge.getSeoSnapshot().then(result=>{
      if(!active) return;
      if(result.ok) setSnapshot(result.value);
      else setError(result.message);
    }).catch(()=>{if(active)setError("SEO kayıtları okunamadı.");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[bridge]);
  useEffect(()=>{
    let active=true;
    if(!snapshot) return;
    setSuggestion(null);setError("");
    const source=snapshot.pages.find(item=>item.page===page);
    if(language==="tr"){
      const next = source ? Object.fromEntries(SEO_FIELDS.map(field=>[field,source[field]])) as SeoFields : empty;
      setDraft(next);setSaved(next);setTranslations([]);setLoading(false);
      return;
    }
    setLoading(true);
    void bridge!.getTranslation({kind:"seo",id:page},language).then(result=>{
      if(!active)return;
      if(!result.ok) {
        setError(sourceAvailable ? result.message : "Önce bu sayfanın Türkçe SEO kaynak metnini kaydedin.");
        setDraft(empty);setSaved(empty);setTranslations([]);return;
      }
      const next=Object.fromEntries(SEO_FIELDS.map(field=>[field,
        result.value.fields.find(t=>t.field===field)?.text ?? ""])) as SeoFields;
      setDraft(next);setSaved(next);setTranslations(result.value.fields);
    }).catch(()=>{if(active)setError("Dil bazlı SEO kayıtları okunamadı.");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[bridge,snapshot,page,language,sourceAvailable]);

  async function save(){
    if(!snapshot||!currentSource||busy||loading||!dirty)return;
    setBusy(true);setError("");
    try {
      if(language==="tr") {
        const result=await bridge!.saveSeoSource(page,draft,currentSource.updatedAt);
        if(!result.ok)throw Error(result.message);
        await refresh();
      } else {
        if (SEO_FIELDS.some(field=>Boolean(saved[field].trim()) && !draft[field].trim())) {
          throw Error("Mevcut çeviri alanı boş bırakılamaz. Bu alanı güncellemek için yeni metni yazın.");
        }
        const fields=translations.filter(item=>draft[item.field as keyof SeoFields]?.trim())
          .filter(item=>SEO_FIELDS.includes(item.field as keyof SeoFields))
          .map(item=>({field:item.field,sourceHash:item.sourceHash,text:draft[item.field as keyof SeoFields]}));
        if(fields.length===0)throw Error("Önce Türkçe kaynak metni kaydedin. Boş çeviri yayınlanamaz.");
        const result=await bridge!.saveTranslation({kind:"seo",id:page,language,fields});
        if(!result.ok)throw Error(result.message);
        const refreshed=await bridge!.getTranslation({kind:"seo",id:page},language);
        if(refreshed.ok) setTranslations(refreshed.value.fields);
        setSaved(draft);
      }
      setSuggestion(null);
      reportAppStatus("success","SEO kaydı kaydedildi. Mevcut web yayınıyla eşitlenecek.");
    }catch(error){
      setError(error instanceof Error?error.message:"SEO kaydı kaydedilemedi.");
    }finally{setBusy(false);}
  }

  async function generate(){
    if(!snapshot||busy||loading)return;
    setBusy(true);setError("");setSuggestion(null);
    try{
      const result=await bridge!.suggestSeoCopy(page,language);
      if(!result.ok)throw Error(result.message);
      setSuggestion(result.value);
    }catch(error){
      setError(error instanceof Error?error.message:"AI önerisi hazırlanamadı.");
    }finally{setBusy(false);}
  }

  const sources=currentSource;
  return <ModalSurface labelledBy="seo-management-title" className="settings-layout-overlay"
    dismissOnBackdrop closeBlocked={closeBlocked} onClose={()=>{if(!closeBlocked)onClose();}}>
    <WorkspaceHeader title="Çok Dilli SEO Yönetimi" titleId="seo-management-title"
      closeLabel="SEO Yönetimini kapat" closeButton="text" closeBlocked={closeBlocked}
      onClose={()=>{if(!closeBlocked)onClose();}} />
    <div className="settings-layout-body" aria-busy={loading}>
      <p>Yayın dilleri Dil Yönetimi'nden gelir. Canonical adres ve hreflang bağlantıları site tarafından otomatik oluşturulur. QR ve özel hesap sayfaları indekslenmez.</p>
      {error && <p role="alert">{error}</p>}
      <div className="form-stack">
        <label className="form-field">Sayfa
          <select value={page} disabled={closeBlocked}
            onChange={event=>setPage(event.target.value as SeoPageKey)}>
            {snapshot?.pages.map(item=><option key={item.page} value={item.page}>{pageNames[item.page]}</option>)}
          </select>
        </label>
        <label className="form-field">Yayın dili
          <select value={language} disabled={closeBlocked}
            onChange={event=>setLanguage(event.target.value)}>
            {snapshot?.languages.map(code=>{
              const lang=PUBLIC_LANGUAGES.find(item=>item.code===code);
              return <option key={code} value={code}>{lang?.nativeName ?? code} ({code})</option>;
            })}
          </select>
        </label>
      </div>
      {language!=="tr" && <p role="status">
        Türkçe SEO kaynak metnine bağlı çeviri. Manuel düzenlemeler, AI tarafından değiştirilmez.
        {translations.some(item=>item.state==="stale") ? " Kaynak değiştiği için güncellenmesi gereken alanlar var." : ""}
        {!sourceAvailable ? " Önce Türkçe kaynak metni oluşturun." : ""}
      </p>}
      {SEO_FIELDS.map(field=>{
        const fieldState=translations.find(item=>item.field===field);
        const blocked=language!=="tr" && !fieldState;
        return <label className="form-field" key={field}>
          {fieldNames[field]} · {draft[field].length}/{maxLength[field]}
          {language!=="tr" && fieldState?.origin &&
            <small>{fieldState.origin==="manual" ? "Manuel" : "AI"} · {fieldState.state==="stale" ? "Kaynak değişti" : fieldState.state==="ready" ? "Hazır" : fieldState.state}</small>}
          <textarea value={draft[field]} rows={field.endsWith("description")?3:2}
            maxLength={maxLength[field]} disabled={busy||loading||blocked}
            placeholder={blocked ? "Önce Türkçe kaynak alanını doldurun." : "Boşsa site varsayılan metnini kullanır."}
            onChange={event=>{setDraft(current=>({...current,[field]:event.target.value}));setSuggestion(null);}} />
        </label>;
      })}
      <p>Arama motoru önizlemesi: <strong>{draft.title || pageNames[page]}</strong></p>
      <p>{draft.description || (language==="tr" ? "Açıklama boş; yayınlanmış işletme açıklaması kullanılacak." : "Bu dilde açıklama yoksa sayfanın yayımlanmış açıklaması kullanılır.")}</p>
      <div className="action-row">
        <ActionButton disabled={busy||loading||(language!=="tr"&&!sourceAvailable)}
          variant="secondary" onClick={()=>void generate()}>
          {busy ? "Hazırlanıyor…" : "AI Önerisi Oluştur"}
        </ActionButton>
      </div>
      {suggestion && <section className="panel" aria-label="AI SEO önerisi">
        <h3>AI taslağı · {language.toUpperCase()}</h3>
        <strong>{suggestion.fields.title}</strong>
        <p>{suggestion.fields.description}</p>
        <p>Paylaşım: {suggestion.fields.og_title} — {suggestion.fields.og_description}</p>
        <ActionButton variant="secondary" onClick={()=>{
          setDraft(suggestion.fields);setSuggestion(null);
        }}>Taslağa Uygula (kaydetmez)</ActionButton>
      </section>}
      <p><strong>Canonical:</strong> Site adresi + sayfa + seçilen yayın dili. Harici adresle değiştirilemez.</p>
      {sources && language!=="tr" && <p>Türkçe kaynak: {sources.title || pageNames[page]}</p>}
    </div>
    <footer className="workspace-frame__footer action-row">
      {dirty && <span>Kaydedilmemiş SEO değişiklikleri</span>}
      <ActionButton disabled={busy||loading||!dirty} onClick={()=>void save()}>Kaydet</ActionButton>
      <ActionButton variant="secondary" disabled={busy||loading||!dirty}
        onClick={()=>{setDraft(saved);setSuggestion(null);setError("");}}>Değişiklikleri Geri Al</ActionButton>
    </footer>
  </ModalSurface>;
}
