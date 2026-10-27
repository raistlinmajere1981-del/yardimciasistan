import { useEffect, useRef, useState } from "react";
import { Languages, RefreshCw, Search, Sparkles, CheckSquare, ListChecks } from "lucide-react";
import { PUBLIC_LANGUAGES, type TranslationFilter, TranslationJob, TranslationPage, TranslationRecord, TranslationIdentity, TranslationSettings } from "@yardimci-asistan/shared";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import type { WorkspacePresentation } from "../workspace/workspace-intent";
import { ActionButton } from "../ui/ActionButton";
import { IconButton } from "../ui/IconButton";
import { StatusChip } from "../ui/StatusChip";
import { StatusBadge } from "../ui/StatusBadge";
import { DataList, DataListButton } from "../ui/DataList";
import { Panel } from "../ui/Panel";

const categories: Array<[NonNullable<TranslationFilter["category"]>, string]> = [["all","Tümü"],["products","Ürünler"],["menu","Menü"],["room","Odalar"],["table","Masalar"],["gallery","Galeri"],["marketing","Kampanyalar"],["business","İşletme Bilgileri"],["site_text","Site Metinleri"]];
const states: Array<[NonNullable<TranslationFilter["state"]>, string]> = [["all","Tümü"],["missing","Eksik"],["ready","Hazır"],["stale","Güncellenecek"],["manual","Manuel"],["failed","Başarısız"]];
const fieldLabels: Record<string,string> = {name:"Ad",description:"Açıklama",about_text:"Hakkımızda",directions_note:"Yol tarifi",policy_note:"Kurallar",payment_note:"Ödeme açıklaması",title:"Başlık",text:"Metin",bed_info:"Yatak bilgisi",price_note:"Fiyat açıklaması",area:"Alan"};
const keyOf = (r: {kind:string;id:string}) => `${r.kind}:${r.id}`;

export function LanguageManagementWorkspace({settings,onClose}:{settings:TranslationSettings;onClose:()=>void}) {
  const bridge = window.yardimciDesktop;
  const [filter,setFilter] = useState<TranslationFilter>({language:settings.targetLanguages[0] ?? "",category:"all",state:"all",query:"",offset:0,limit:50});
  const [page,setPage] = useState<TranslationPage>({records:[],total:0,offset:0,limit:50});
  const [selected,setSelected] = useState<Map<string,TranslationRecord>>(new Map());
  const [draft,setDraft] = useState<Record<string,string>>({});
  const [loading,setLoading] = useState(true), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const [listError,setListError] = useState(""), [hasLoaded,setHasLoaded] = useState(false);
  const [job,setJob] = useState<TranslationJob | null>(null), [revision,setRevision] = useState(0);
  const [stage,setStage] = useState<"list"|"editor">("list");
  const [presentation,setPresentation] = useState<WorkspacePresentation>("centered");
  const serial = useRef(0), lastProgress = useRef("");
  const record = selected.size === 1 ? [...selected.values()][0] : undefined;
  const dirty = Boolean(record?.fields.some(f => draft[f.field] !== undefined && draft[f.field] !== f.text));
  const reviewable = Boolean(record?.fields.some(f => f.state === "stale" && f.origin === "manual" && f.text));
  const blocked = busy || loading || dirty;
  const running = job?.state === "running";
  const singleIdentity = record ? JSON.stringify({kind:record.kind,id:record.id}) : "";
  useEffect(() => {
    let active = true;
    if (!singleIdentity || dirty || busy || !bridge?.getTranslation) return;
    const identity = JSON.parse(singleIdentity) as TranslationIdentity;
    void bridge.getTranslation(identity,filter.language).then(result => {
      if (!active) return;
      if (!result.ok) {setError(result.message);return;}
      setSelected(current => current.size === 1 && current.has(keyOf(identity)) ? new Map([[keyOf(identity),result.value]]) : current);
    }).catch(() => {if(active)setError("Seçilen kayıt okunamadı. Oturum kilidini kontrol edin.");});
    return () => {active=false;};
  },[bridge,singleIdentity,filter.language,revision,dirty,busy]);
  useEffect(() => {
    const generation = ++serial.current;
    let active = true;
    if (!filter.language) { setLoading(false); return; }
    setLoading(true); setListError("");
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (!bridge?.listTranslations) throw Error("Dil Yönetimi kullanılamıyor.");
          const result = await bridge.listTranslations(filter);
          if (!active || generation !== serial.current) return;
          if (!result.ok) { setListError(result.message); return; }
          setListError(""); setHasLoaded(true); setPage(result.value);
          setSelected(current => new Map([...current].map(([key,r]) => [key,result.value.records.find(v => keyOf(v) === key) ?? r])));
        } catch { if (active && generation === serial.current) setListError("Kayıtlar okunamadı. Oturum kilidini kontrol edip yeniden deneyin."); }
        finally { if (active && generation === serial.current) setLoading(false); }
      })();
    },150);
    return () => { clearTimeout(timer); active = false; };
  },[bridge,filter,revision]);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const result = await bridge?.getTranslationJob();
        if (!active || !result) return;
        if (!result.ok) { setError(result.message); return; }
        setJob(result.value);
        const progress = result.value ? JSON.stringify(result.value) : "";
        if (progress !== lastProgress.current) { lastProgress.current = progress; if (!dirty && !busy) setRevision(v => v+1); }
      } catch { if (active) setError("Çeviri durumu okunamadı. Oturum kilitli olabilir."); }
    };
    void poll(); const timer = setInterval(() => void poll(),1000);
    return () => { active = false; clearInterval(timer); };
  },[bridge,dirty,busy]);
  const changeFilter = (value: Partial<TranslationFilter>) => { if (blocked) return; setFilter(f => ({...f,...value,offset:0})); if (value.language) { setSelected(new Map()); setDraft({}); } };
  const choose = (r:TranslationRecord, multiple:boolean) => {
    if (blocked || listError || !hasLoaded) return;
    setDraft({});
    setSelected(current => {
      if (!multiple) return new Map([[keyOf(r),r]]);
      const next = new Map(current); if (next.has(keyOf(r))) next.delete(keyOf(r)); else next.set(keyOf(r),r); return next;
    });
    if (!multiple) setStage("editor");
  };
  const save = async () => {
    if (!record || !bridge || listError || !hasLoaded || (!dirty && !reviewable)) return;
    setBusy(true); setError("");
    try {
      const result = await bridge.saveTranslation({...record,language:filter.language,fields:record.fields.filter(f => (draft[f.field] !== undefined && draft[f.field] !== f.text) || (f.state === "stale" && f.origin === "manual" && f.text))
        .map(f => ({field:f.field,sourceHash:f.sourceHash,text:draft[f.field] ?? f.text}))});
      if (!result.ok) { setError(result.message); return; }
      setDraft({}); setRevision(v => v+1);
    } catch { setError("Çeviri kaydedilemedi. Taslak korundu; oturum kilidini kontrol edin."); }
    finally { setBusy(false); }
  };
  const translate = async (allMissing:boolean) => {
    if (!bridge || blocked || running || listError || !hasLoaded) return;
    setBusy(true); setError("");
    try {
      const result = await bridge.startTranslation({filter:{...filter,...(allMissing ? {state:"missing" as const} : {})},
        ...(!allMissing ? {selection:[...selected.values()].map(({kind,id}) => ({kind,id}))} : {})});
      if (!result.ok) setError(result.message); else setJob(result.value);
    } catch { setError("AI kullanılamıyor. Manuel çeviri ve Türkçe yayın devam ediyor."); }
    finally { setBusy(false); }
  };
  const close = () => { if (!blocked) onClose(); };
  const pageCount = Math.max(1,Math.ceil(page.total/page.limit));
  const pageIndex = Math.floor(page.offset/page.limit)+1;
  const selectPage = () => setSelected(current => new Map([...current,...page.records.map(r => [keyOf(r),r] as const)]));
  const clearSelection = () => {setSelected(new Map());setDraft({});};
  return <WorkspaceFrame
    className="language-workspace"
    title="Dil Yönetimi"
    context="Yayın içeriklerinin çevirileri"
    presentation={presentation}
    onPresentationChange={setPresentation}
    closeBlocked={blocked}
    dismissOnBackdrop
    closeLabel="Dil Yönetimini kapat"
    onClose={close}
    bodyScroll="panes"
    actions={<div className="language-workspace__header-actions">
      {filter.language && <select aria-label="Yayın dili" title="Yayın dili" value={filter.language} disabled={blocked}
        onChange={e => changeFilter({language:e.target.value})}>
        {settings.targetLanguages.map(l => <option key={l} value={l}>{PUBLIC_LANGUAGES.find(v => v.code === l)?.name ?? l}</option>)}
      </select>}
      <IconButton aria-label="Yenile" title="Yenile" disabled={blocked} onClick={() => setRevision(v=>v+1)}>
        <RefreshCw size={17} aria-hidden="true"/>
      </IconButton>
    </div>}
  >
    {!filter.language ? <div className="language-workspace__no-languages" role="status">Çoklu Dil ayarlarından bir hedef yayın dili ekleyin.</div> : <>
      {error && <p role="alert" className="language-workspace__message">{error}</p>}
      <div className="language-workspace__body" data-stage={stage}>
        <section className="language-workspace__list panel" aria-label="Çevrilebilir kayıtlar">
          <div className="language-workspace__section-heading">
            <div className="language-workspace__section-title">
              <ListChecks size={18} aria-hidden="true"/>
              <h3>Yayın İçerikleri</h3>
            </div>
            {(listError || hasLoaded) && <StatusBadge className="language-workspace__count">{listError ? "Kayıt sayısı alınamadı" : `${page.total} kayıt`}</StatusBadge>}
          </div>
          <div className="language-workspace__filter-group">
            <div className="language-workspace__chip-row" role="group" aria-label="İçerik kategorileri">
              {categories.map(([id,label]) => <StatusChip key={id} selected={filter.category===id} disabled={blocked} onClick={() => changeFilter({category:id})}>{label}</StatusChip>)}
            </div>
            <label className="language-workspace__search">
              <Search size={17} aria-hidden="true"/>
              <span className="sr-only">Kayıtlarda ara</span>
              <input type="search" aria-label="Kayıtlarda ara" placeholder="Kayıtlarda ara..." value={filter.query} disabled={busy || dirty}
                onChange={e => setFilter(f=>({...f,query:e.target.value,offset:0}))}/>
            </label>
            <div className="language-workspace__chip-row" role="group" aria-label="Çeviri durumu">
              {states.map(([id,label]) => <StatusChip key={id} selected={filter.state===id} disabled={blocked} onClick={() => changeFilter({state:id})}>{label}</StatusChip>)}
            </div>
          </div>
          <div className="language-workspace__selection-bar">
            <span className="language-workspace__selection-count">{selected.size} seçili</span>
            <div className="language-workspace__selection-actions">
              <ActionButton size="sm" variant="secondary" disabled={blocked || Boolean(listError) || !hasLoaded || !page.records.length} onClick={selectPage}>
                <CheckSquare size={14} aria-hidden="true"/> Sayfayı Seç
              </ActionButton>
              <ActionButton size="sm" variant="quiet" disabled={blocked || !selected.size} onClick={clearSelection}>Seçimi Temizle</ActionButton>
              <ActionButton className="language-workspace__mobile" size="sm" variant="secondary" onClick={() => setStage("editor")}>İşlem Paneli</ActionButton>
            </div>
          </div>
          {listError && <p role="alert" className="language-workspace__list-message">Kayıtlar alınamadı: {listError} Yenile ile yeniden deneyin. Önceki sonuçlar güncel olmayabilir.</p>}
          <div className="language-workspace__records" aria-busy={loading}>
            <DataList className="language-workspace__rows">{page.records.map(r => <div key={keyOf(r)} className={`language-workspace__record${selected.has(keyOf(r))?" is-selected":""}`}>
              <label className="form-check">
                <input type="checkbox" aria-label={`${r.label} seç`} disabled={blocked || Boolean(listError)}
                  checked={selected.has(keyOf(r))} onChange={() => choose(r,true)}/>
                <span className="sr-only">{r.label} seç</span>
              </label>
              <DataListButton className="language-workspace__record-button" twoLine selected={selected.has(keyOf(r))}
                title={r.label}
                meta={`${r.ready}/${r.total} hazır${r.stale ? ` · ${r.stale} güncellenecek` : ""}${r.manual ? ` · ${r.manual} manuel` : ""}${r.failed ? ` · ${r.failed} başarısız` : ""}`}
                aria-label={r.label} aria-current={selected.size===1 && selected.has(keyOf(r)) ? "true" : undefined}
                disabled={blocked || Boolean(listError)} onClick={() => choose(r,false)} />
            </div>)}</DataList>
            {!loading && !listError && hasLoaded && !page.records.length && <p role="status" className="language-workspace__list-message">{(filter.category === "all" && filter.state === "all" && !filter.query)
              ? "Henüz çevrilebilir public kaynak kaydı yok. İçeriklerin web yayınını etkinleştirip kayıtları yayımlayın; burada yalnız yayına uygun kayıtlar listelenir."
              : "Filtreye uygun public kayıt bulunamadı. Filtreleri veya aramayı değiştirin."}</p>}
          </div>
          <nav className="language-workspace__pagination" aria-label="Çeviri sayfaları">
            <ActionButton size="sm" variant="secondary" disabled={blocked || Boolean(listError) || !hasLoaded || page.offset===0}
              onClick={() => setFilter(f=>({...f,offset:Math.max(0,page.offset-page.limit)}))}>Önceki</ActionButton>
            <span>{pageIndex} / {pageCount}</span>
            <ActionButton size="sm" variant="secondary" disabled={blocked || Boolean(listError) || !hasLoaded || page.offset+page.limit>=page.total}
              onClick={() => setFilter(f=>({...f,offset:page.offset+page.limit}))}>Sonraki</ActionButton>
          </nav>
        </section>
        <section className="language-workspace__editor panel" aria-label="Çeviri işlemleri">
          <div className="language-workspace__section-heading">
            <div className="language-workspace__section-title"><Languages size={18} aria-hidden="true"/><h3>Çeviri Düzenleyici</h3></div>
            <ActionButton className="language-workspace__mobile" size="sm" variant="secondary" disabled={blocked} onClick={() => setStage("list")}>Kayıtlara Dön</ActionButton>
          </div>
          <div className="language-workspace__editor-scroll">
            {record ? <div className="language-workspace__detail">
              <div className="language-workspace__record-heading">
                <strong>{record.label}</strong>
                <span>{record.fields.length} alan · {filter.language.toUpperCase()}</span>
              </div>
              {record.fields.map(f => <Panel as="div" padding="compact" key={f.field} className="language-workspace__field">
                <div className="language-workspace__field-heading"><strong>{fieldLabels[f.field] ?? f.field}</strong>
                  <StatusBadge tone={f.state==="ready"?"success":f.state==="failed"?"danger":"warning"}>{f.origin==="manual"?"Manuel · ":""}{states.find(([id])=>id===f.state)?.[1] ?? "Eksik"}</StatusBadge></div>
                <div className="language-workspace__field-pair">
                  <label className="form-field">Türkçe<textarea aria-label={`${fieldLabels[f.field] ?? f.field} · Türkçe`} readOnly value={f.source}/></label>
                  <label className="form-field">{filter.language.toUpperCase()} çeviri<textarea aria-label={`${fieldLabels[f.field] ?? f.field} · ${filter.language} çeviri`}
                    value={draft[f.field] ?? f.text} maxLength={12000} disabled={busy || running || loading || Boolean(listError)}
                    onChange={e=>setDraft(d=>({...d,[f.field]:e.target.value}))}/></label>
                </div>
              </Panel>)}
              {reviewable && <p role="status" className="language-workspace__hint">Manuel çeviriyi yeni kaynakla karşılaştırın. Kaydet, metin değişmese de güncelliğini onaylar.</p>}
              {dirty && <p role="status" className="language-workspace__hint">Kaydedilmemiş çeviri değişiklikleri</p>}
              <div className="language-workspace__save-actions">
                <ActionButton variant="secondary" disabled={!dirty || busy} onClick={()=>setDraft({})}>Değişiklikleri Geri Al</ActionButton>
                <ActionButton disabled={(!dirty && !reviewable) || busy || running || loading || Boolean(listError)} onClick={() => void save()}>Kaydet</ActionButton>
              </div>
            </div> : <div className="language-workspace__empty" role="status">
              <Languages size={28} aria-hidden="true"/>
              <strong>{selected.size ? `${selected.size} kayıt seçildi` : "Kayıt seçilmedi"}</strong>
              <span>{selected.size ? "Seçimi AI işlemleriyle topluca çevirebilirsiniz." : "Çeviri alanlarını düzenlemek için soldan bir kayıt seçin."}</span>
            </div>}
          </div>
          <div className="language-workspace__ai-panel">
            <div className="language-workspace__ai-heading">
              <Sparkles size={17} aria-hidden="true"/>
              <strong>AI İşlemleri</strong>
            </div>
            <div className="language-workspace__ai-actions">
              <ActionButton variant="secondary" disabled={blocked || Boolean(listError) || !hasLoaded || running || !selected.size}
                onClick={() => void translate(false)}>AI ile Çevir</ActionButton>
              <ActionButton variant="secondary" disabled={blocked || Boolean(listError) || !hasLoaded || running || !page.total}
                onClick={() => void translate(true)}>Filtrelenen Eksikleri Tamamla</ActionButton>
            </div>
            {job && <div className="language-workspace__job" role="status">
              <span>{job.message}</span>
              <progress max={Math.max(1,job.total)} value={job.completed+job.failed+job.skipped}/>
              <div className="language-workspace__job-summary"><span>{job.completed} tamamlandı · {job.failed} hata · {job.skipped} atlandı / {job.total}</span>
                {running && <ActionButton size="sm" variant="secondary" onClick={() => {void bridge?.cancelTranslation().catch(()=>setError("İşlem durdurulamadı."));}}>İşlemi Durdur</ActionButton>}</div>
            </div>}
          </div>
        </section>
      </div>
    </>}
  </WorkspaceFrame>;
}
