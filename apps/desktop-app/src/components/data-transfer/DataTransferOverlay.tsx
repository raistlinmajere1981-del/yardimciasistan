import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import { runtimeHasCapability } from "../../app/capabilities";
import { DEFAULT_TRANSFER_PREFERENCES, PRODUCT_TRANSFER_FIELDS, CUSTOMER_TRANSFER_FIELDS } from "@yardimci-asistan/shared";
import type { TransferEntity, TransferSource, TransferPreview, TransferPreferences, TransferResult, TransferRow, TransferStatus, TransferFormat, TransferExportOptions, TransferFileResult, TransferExportSummary, TransferProgress } from "../../../electron/data-transfer-contract";
import { ModalSurface } from "../ui/ModalSurface";
import { WorkspaceHeader } from "../workspace/WorkspaceHeader";
import { DetailSectionCard } from "../workspace/DetailWorkspaceLayout";
import { ActionButton } from "../ui/ActionButton";
import { IconButton } from "../ui/IconButton";
import { ChoiceChips } from "../ui/ChoiceChips";
import { StatusBadge } from "../ui/StatusBadge";
import { DataList, DataListButton } from "../ui/DataList";
import type { CustomerListQuery } from "../../../electron/database/customer-store";
const statusLabel: Record<TransferStatus,string> = {new:"Yeni",update:"Güncellenecek",skip:"Atlanacak",error:"Hatalı"};
export function DataTransferLauncher({entity,search="",quickAccessOnly=false,customerFilter="all",onChanged}: {entity:TransferEntity;search?:string;quickAccessOnly?:boolean;customerFilter?:CustomerListQuery["filter"];onChanged:()=>void|Promise<void>}) {
  const [open,setOpen]=useState(false);
  const label=entity==="products"?"Ürün verilerini içe/dışa aktar":"Müşteri verilerini içe/dışa aktar";
  return <><IconButton aria-label={label} title={label} onClick={()=>setOpen(true)}><ArrowDownUp size={18} aria-hidden="true" /></IconButton>
    {open&&<DataTransferOverlay entity={entity} search={search} quickAccessOnly={quickAccessOnly} customerFilter={customerFilter??"all"} onChanged={onChanged} onClose={()=>setOpen(false)} />}</>;
}
export function DataTransferOverlay({entity,search="",quickAccessOnly=false,customerFilter="all",onChanged,onClose}: {entity:TransferEntity;search?:string;quickAccessOnly?:boolean;customerFilter?:CustomerListQuery["filter"];onChanged:()=>void|Promise<void>;onClose:()=>void}) {
  const bridge=window.yardimciDesktop?.dataTransfer;
  const {snapshot:runtime}=useBusinessCapabilityRuntime();
  const online=runtimeHasCapability(runtime,BUSINESS_CAPABILITIES.ONLINE_SALES), inventory=runtimeHasCapability(runtime,BUSINESS_CAPABILITIES.INVENTORY), menu=runtimeHasCapability(runtime,BUSINESS_CAPABILITIES.FOOD_MENU);
  const titleId=useId(),fields=entity==="products"?PRODUCT_TRANSFER_FIELDS:CUSTOMER_TRANSFER_FIELDS;
  const [mode,setMode]=useState<"import"|"export"|"template">("import");
  const [stage,setStage]=useState<"prepare"|"confirm"|"result">("prepare");
  const [source,setSource]=useState<TransferSource|null>(null),[mapping,setMapping]=useState<Record<string,string>>({});
  const [preferences,setPreferences]=useState<TransferPreferences>({...DEFAULT_TRANSFER_PREFERENCES});
  const [preview,setPreview]=useState<TransferPreview|null>(null),[result,setResult]=useState<TransferResult|null>(null);
  const [rows,setRows]=useState<TransferRow[]>([]),[filter,setFilter]=useState<TransferStatus|"all">("all"),[offset,setOffset]=useState(0),[detail,setDetail]=useState<TransferRow|null>(null);
  const [busy,setBusy]=useState(false),busyRef=useRef(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [progress,setProgress]=useState<TransferProgress>({stage:"",done:0,total:0});
  const [format,setFormat]=useState<TransferFormat>("zip"),[scope,setScope]=useState<"all"|"filtered">("all"),[includeImages,setIncludeImages]=useState(true),[includeIdentity,setIncludeIdentity]=useState(false);
  const [template,setTemplate]=useState<"full"|"basic"|"ideasoft">("full"),[summary,setSummary]=useState<TransferExportSummary|null>(null),[fileResult,setFileResult]=useState<TransferFileResult|null>(null);
  const [menuCategories,setMenuCategories]=useState<{id:string;name:string}[]>([]),[publicationUnderstood,setPublicationUnderstood]=useState(false);
  const sourceToken=useRef("");sourceToken.current=source?.token??"";
  useEffect(()=>bridge?.onProgress(setProgress),[bridge]);
  useEffect(()=>()=>{if(sourceToken.current)void bridge?.release(sourceToken.current).catch(()=>{});},[bridge]);
  useEffect(()=>{
    if(!menu||!window.yardimciDesktop?.getDashboardData)return;
    let current=true;
    void window.yardimciDesktop.getDashboardData().then(data=>{if(current)setMenuCategories(data.menu.categories);}).catch(()=>{});
    return()=>{current=false;};
  },[menu]);
  const exportOptions: TransferExportOptions = {entity,format,scope,search,quickAccessOnly,customerFilter:customerFilter??"all",includeImages,includeIdentity,...(mode==="template"?{template}:{})};
  useEffect(()=>{
    if(mode==="import"||!bridge)return;
    let current=true;setSummary(null);
    void bridge.summary({entity,format,scope,search,quickAccessOnly,customerFilter:customerFilter??"all",includeImages,includeIdentity,...(mode==="template"?{template}:{})}).then(value=>{if(current)setSummary(value);}).catch(e=>{if(current)setError(message(e));});
    return()=>{current=false;};
  },[bridge,customerFilter,entity,format,includeIdentity,includeImages,mode,scope,search,quickAccessOnly,template]);
  useEffect(()=>{
    if(!source||!preview||!bridge)return;
    let current=true;
    void bridge.rows(source.token,filter,offset).then(value=>{if(current){setRows(value);setDetail(null);}}).catch(e=>{if(current)setError(message(e));});
    return()=>{current=false;};
  },[bridge,filter,offset,preview,result,source]);
  async function run(operation:()=>Promise<void>) {
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setError("");setNotice("");setProgress({stage:"İşlem hazırlanıyor",done:0,total:0});
    try{if(!bridge)throw new Error("Masaüstü aktarım bağlantısı kullanılamıyor.");await operation();}catch(e){setError(message(e));}
    finally{busyRef.current=false;setBusy(false);}
  }
  function invalidate(){setPreview(null);setResult(null);setDetail(null);setRows([]);setStage("prepare");setPublicationUnderstood(false);}
  function preference<K extends keyof TransferPreferences>(key:K,value:TransferPreferences[K]){setPreferences(previous=>({...previous,[key]:value}));invalidate();}
  function acceptSource(value:TransferSource|null){if(!value)return;setSource(value);setMapping(value.mapping);setFilter("all");setOffset(0);invalidate();}
  async function upload(file:File){await run(async()=>{if(file.size>32*1024*1024)throw new Error("Dosya 32 MB sınırını aşıyor.");acceptSource(await bridge!.upload(entity,file.name,new Uint8Array(await file.arrayBuffer())));});}
  const applicable=preview?(preview.counts.new+preview.counts.update):0;
  const close=()=>{if(!busyRef.current)onClose();};
  const reset=()=>{if(source)void bridge?.release(source.token).catch(()=>{});setSource(null);invalidate();setFileResult(null);setError("");setNotice("");};
  const rowTotal=result?(filter==="all"?result.added+result.updated+result.skipped+result.errors:filter==="new"?result.added:filter==="update"?result.updated:filter==="skip"?result.skipped:result.errors):preview?(filter==="all"?preview.total:preview.counts[filter]):0;
  return <ModalSurface labelledBy={titleId} className="workspace-frame data-transfer-overlay" onClose={close} closeBlocked={busy}>
    <WorkspaceHeader title={entity==="products"?"Ürün İçe/Dışa Aktar":"Müşteri İçe/Dışa Aktar"} titleId={titleId} context={stage==="confirm"?"Son kontrol ve onay":stage==="result"?"İşlem sonucu":"Yerel dosyayla veri aktarımı"} onClose={close} closeLabel="Aktarım panelini kapat" closeBlocked={busy}/>
    <div className="workspace-frame__navigation"><ChoiceChips ariaLabel="Aktarım aracı" value={mode} onChange={value=>{if(!busy){setMode(value);setStage("prepare");setFileResult(null);setError("");}}} options={[{id:"import",label:"İçe Aktar",disabled:busy},{id:"export",label:"Dışa Aktar",disabled:busy},{id:"template",label:"Şablon İndir",disabled:busy}]} /></div>
    <div className="workspace-frame__body data-transfer-overlay__body" aria-busy={busy}>
      {error&&<p role="alert" className="form-error">{error}</p>}
      {notice&&<p role="status">{notice}</p>}
      {busy&&<div role="status" aria-live="polite"><p>{progress.stage} {progress.total>0?`${progress.done} / ${progress.total}`:""}</p><progress aria-label="Aktarım ilerlemesi" value={progress.total?progress.done:undefined} max={progress.total||1}/></div>}
      <fieldset disabled={busy} className="data-transfer-overlay__controls">
      {mode==="import"&&stage==="prepare"&&<>
        <DetailSectionCard title="Dosya ve kolon eşleme">
          <div onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const file=event.dataTransfer.files[0];if(file&&!busy)void upload(file);}} className="data-transfer-overlay__drop">
            <ActionButton variant="secondary" onClick={()=>{void run(async()=>acceptSource(await bridge!.pick(entity)));}}>Dosya seç</ActionButton>
            <span>CSV, XLSX veya ZIP · En fazla 32 MB / 10.000 kayıt. Dosyayı buraya da bırakabilirsiniz.</span>
          </div>
          {source&&<><p>{source.name} · {source.format.toUpperCase()} · {source.total} kayıt</p>{source.warnings.map(w=><p key={w}>{w}</p>)}
            <details><summary>Kolon eşlemesini düzenle</summary><div className="data-transfer-overlay__grid">
              {Object.entries(fields).map(([key,label])=><label key={key} className="form-field"><span>{label}</span><select value={mapping[key]??""} onChange={event=>{const next={...mapping};if(event.target.value)next[key]=event.target.value;else delete next[key];setMapping(next);invalidate();}}><option value="">Aktarılmayacak</option>{source.headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>)}
            </div></details></>}
        </DetailSectionCard>
        {source&&<DetailSectionCard title="İçe aktarma tercihleri">
          <label className="form-field"><span>Eşleşen kayıtlar</span><select value={preferences.conflicts} onChange={e=>preference("conflicts",e.target.value as "skip"|"update")}><option value="skip">Mevcut kaydı koru ve atla</option><option value="update">Açıkça eşlenen alanları güncelle</option></select></label>
          {entity==="products"&&<>
            <label className="form-check"><input type="checkbox" checked={preferences.activate} onChange={e=>preference("activate",e.target.checked)}/>Yeni ürünleri aktif yap</label>
            <label className="form-check"><input type="checkbox" disabled={!online} checked={preferences.publish} onChange={e=>preference("publish",e.target.checked)}/>Webde yayınla{!online&&" · Online Satış etkin değil"}</label>
            <label className="form-check"><input type="checkbox" disabled={!inventory} checked={preferences.applyStock} onChange={e=>preference("applyStock",e.target.checked)}/>Doğrulanmış stok miktarını sayım olarak uygula</label>
            <label className="form-check"><input type="checkbox" checked={preferences.fallbackCategory} onChange={e=>preference("fallbackCategory",e.target.checked)}/>Kategorisi eksik kayıtları Diğer'e al</label>
            {menu&&<label className="form-field"><span>Restoran menüsüne ekle</span><select value={preferences.menuCategoryId} onChange={e=>preference("menuCategoryId",e.target.value)}><option value="">Ekleme · yalnız katalogda tut</option><option value="__source__">Dosyadaki menü ilişkilerini geri yükle</option>{menuCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
            <label className="form-field"><span>Dosyada belirtilen görsel bulunamazsa</span><select value={preferences.missingImages} onChange={e=>preference("missingImages",e.target.value as "without"|"skip")}><option value="without">Görselsiz al, sonucu raporla</option><option value="skip">Satırı atla</option></select></label>
            <p>Yeni ürünler varsayılan olarak pasif taslaktır ve webde yayınlanmaz. KDV ve stok bilgisi eksikse doğrulama gerekir. Menü bağlantısı seçilmezse ürün menüde görünmez.</p>
          </>}
          <ActionButton onClick={()=>{void run(async()=>{const next=await bridge!.preview(source.token,mapping,preferences);setPreview(next);setRows(next.rows);setOffset(0);setFilter("all");});}}>Analiz et ve önizle</ActionButton>
        </DetailSectionCard>}
      </>}
      {mode==="import"&&preview&&stage==="prepare"&&<DetailSectionCard title="Önizleme">
        <div className="data-transfer-overlay__counts"><StatusBadge>Toplam {preview.total}</StatusBadge>{Object.entries(preview.counts).map(([status,count])=><StatusBadge key={status} tone={status==="error"?"danger":"neutral"}>{statusLabel[status as TransferStatus]} {count}</StatusBadge>)}</div>
        {entity==="products"&&<p>Yayınlanabilir: {preview.publishable} · Yayın engelli: {preview.blocked}. Mevcut yayını etkilenecek: {preview.existingPublished}. {preferences.publish?"Yalnız yayınlanabilir kayıtlar yayınlanır.":"Web yayını kapalı."}</p>}
        {preferences.publish&&<label className="form-check"><input type="checkbox" checked={publicationUnderstood} onChange={e=>setPublicationUnderstood(e.target.checked)}/>Yayınlanacak {preview.publishable} kaydı ve {preview.blocked} engelli kaydın nedenlerini inceledim.</label>}
        <ChoiceChips ariaLabel="Aktarım satır filtresi" value={filter} onChange={value=>{setFilter(value);setOffset(0);}} options={[{id:"all",label:"Tümü"},...Object.entries(statusLabel).map(([id,label])=>({id:id as TransferStatus,label}))]}/>
        <DataList>{rows.map(row=><DataListButton key={row.row} title={`${row.row}. ${row.name}`} meta={[...row.reasons,...row.warnings].join(" · ")} trailing={<StatusBadge tone={row.status==="error"?"danger":"neutral"}>{statusLabel[row.status]}</StatusBadge>} onClick={()=>setDetail(row)}/>)}</DataList>
        <div className="data-transfer-overlay__actions"><ActionButton variant="secondary" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Önceki satırlar</ActionButton><span>{Math.min(offset+1,rowTotal)}–{Math.min(offset+50,rowTotal)} / {rowTotal}</span><ActionButton variant="secondary" disabled={offset+50>=rowTotal} onClick={()=>setOffset(offset+50)}>Sonraki satırlar</ActionButton></div>
        {detail&&<DetailSectionCard title={`Satır ${detail.row}: ${detail.name}`}><p>{[...detail.reasons,...detail.warnings].join(" · ")||"Kayıt doğrulandı."}</p><div className="data-transfer-overlay__table"><table><thead><tr><th>Alan / kaynak kolon</th><th>Eski değer</th><th>Yeni değer</th></tr></thead><tbody>{Object.entries(detail.after).map(([key,value])=><tr key={key}><th>{fields[key]??key}<small>{mapping[key]}</small></th><td>{detail.before[key]||"—"}</td><td>{value||"—"}</td></tr>)}</tbody></table></div></DetailSectionCard>}
      </DetailSectionCard>}
      {mode==="import"&&stage==="confirm"&&preview&&<DetailSectionCard title="Aktarımı onayla"><p>{preview.counts.new} yeni, {preview.counts.update} güncelleme, {preview.counts.skip} atlanacak, {preview.counts.error} hatalı kayıt.</p><p>Etkilenecek {entity==="products"?"ürün":"müşteri"} sayısı: {applicable}.</p>{entity==="products"&&<><p>Mevcut yayını korunarak güncellenecek: {preview.existingPublished}.</p><p>Yeni ürünler: {preferences.activate?"aktif":"pasif taslak"}. Web yayını: {preferences.publish?`${preview.publishable} kayıt yayınlanabilir, ${preview.blocked} engelli`:"kapalı"}.</p><p>{preferences.applyStock?"Stok sayımı uygulanacak.":"Stok miktarı uygulanmayacak."} {preferences.menuCategoryId?"Seçilen menü kategorisine bağlanacak.":"Menüye eklenmeyecek."}</p></>}<p>Bu onaydan sonra doğrulanan kayıtlar yerel veritabanına yazılacak. İşlem bitince sonuç paneli açık kalacak.</p></DetailSectionCard>}
      {mode==="import"&&stage==="result"&&result&&<DetailSectionCard title="İçe aktarma sonucu"><div role="status"><p>Eklenen: {result.added} · Güncellenen: {result.updated} · Atlanan: {result.skipped} · Hata: {result.errors}</p><p>{result.errors?"İşlem hatalarla tamamlandı; aşağıdaki raporu inceleyin.":result.added+result.updated>0?"Kayıtlar uygulandı.":"Hiçbir kayıt değiştirilmedi."}</p></div><ChoiceChips ariaLabel="Sonuç satır filtresi" value={filter} onChange={value=>{setFilter(value);setOffset(0);}} options={[{id:"all",label:"Tümü"},...Object.entries(statusLabel).map(([id,label])=>({id:id as TransferStatus,label}))]}/><DataList>{rows.map(row=><DataListButton key={row.row} title={`Satır ${row.row}: ${statusLabel[row.status]}`} meta={[...row.reasons,...row.warnings].join(" · ")||"Kayıt uygulandı."} onClick={()=>setDetail(row)}/>)}</DataList><div className="data-transfer-overlay__actions"><ActionButton variant="secondary" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Önceki sonuçlar</ActionButton><span>{Math.min(offset+1,rowTotal)}–{Math.min(offset+50,rowTotal)} / {rowTotal}</span><ActionButton variant="secondary" disabled={offset+50>=rowTotal} onClick={()=>setOffset(offset+50)}>Sonraki sonuçlar</ActionButton></div><ActionButton variant="secondary" onClick={()=>{void run(async()=>{const file=await bridge!.report(source!.token);if(!file.cancelled)setNotice(`Sonuç raporu kaydedildi: ${file.path}`);});}}>Sonuç raporunu indir</ActionButton></DetailSectionCard>}
      {mode!=="import"&&<DetailSectionCard title={mode==="template"?"Aktarım şablonu":"Dışa aktarma seçenekleri"}>
        {mode==="export"?<><label className="form-field"><span>Kapsam</span><select value={scope} onChange={e=>{setScope(e.target.value as "all"|"filtered");setFileResult(null);}}><option value="all">Aktif işletmenin tüm kayıtları</option><option value="filtered">Mevcut arama ve filtre</option></select></label><p>{summary?`${summary.records} kayıt · ${summary.images} görsel kaynağı` :"Kayıtlar sayılıyor…"}</p></>:<><label className="form-field"><span>Şablon</span><select value={template} onChange={e=>setTemplate(e.target.value as typeof template)}><option value="full">Yardımcı Asistan (tam)</option><option value="basic">Genel Excel/CSV (temel)</option>{entity==="products"&&<option value="ideasoft">IdeaSoft eşleme</option>}</select></label><p>{template==="full"?"Kimlik, iletişim veya ürün fiyat/kategori ve kanal alanları.":template==="basic"?"Temel ad, iletişim veya stok kodu ve fiyat kolonları.":"IdeaSoft ürün kaynak başlıkları. Tanınmayan kolonları içe aktarırken elle eşleyin."} Şablon veri içermez.</p></>}
        <label className="form-field"><span>Dosya biçimi</span><select value={format} onChange={e=>{setFormat(e.target.value as TransferFormat);setFileResult(null);}}><option value="csv">CSV · Excel UTF-8 BOM / noktalı virgül</option><option value="xlsx">Excel XLSX</option><option value="zip">Yardımcı Asistan ZIP</option></select></label>
        {entity==="products"&&format==="zip"&&<label className="form-check"><input type="checkbox" checked={includeImages} onChange={e=>setIncludeImages(e.target.checked)}/>Görselleri arşive dahil et</label>}
        {entity==="customers"&&<><p>Varsayılan dosya kişi/iletişim verisi içerir; yalnız yerel diske kaydedilir. Kimlik ve belge alanları dahil edilmez.</p><label className="form-check"><input type="checkbox" checked={includeIdentity} onChange={e=>setIncludeIdentity(e.target.checked)}/>Kimlik, pasaport ve belge alanlarını bilinçli olarak dahil et</label></>}
        {fileResult&&!fileResult.cancelled&&<div role="status"><p>{fileResult.name}</p><p>{fileResult.records} kayıt · {fileResult.images} görsel</p><p className="data-transfer-overlay__path">Kaydedildi: {fileResult.path}</p>{fileResult.warnings.map(w=><p key={w}>{w}</p>)}</div>}
      </DetailSectionCard>}
      </fieldset>
    </div>
    <footer className="workspace-frame__footer data-transfer-overlay__actions">
      {mode==="import"&&stage==="prepare"&&<><ActionButton variant="secondary" disabled={busy} onClick={close}>Vazgeç</ActionButton><ActionButton disabled={busy||!preview||!applicable||(preferences.publish&&!publicationUnderstood)} onClick={()=>setStage("confirm")}>Onaya geç</ActionButton></>}
      {mode==="import"&&stage==="confirm"&&<><ActionButton variant="secondary" disabled={busy} onClick={()=>setStage("prepare")}>Geri dön</ActionButton><ActionButton disabled={busy} onClick={()=>{void run(async()=>{const applied=await bridge!.apply(source!.token,preview!.revision);setResult(applied);setRows(applied.rows);setFilter("all");setOffset(0);setStage("result");try{await onChanged();}catch{setNotice("Kayıtlar uygulandı; liste yenilenemedi. Sayfayı yeniden açın.");}});}}>{applicable} kaydı içe aktar</ActionButton></>}
      {mode==="import"&&stage==="result"&&<><ActionButton variant="secondary" onClick={reset} disabled={busy}>Yeniden içe aktar</ActionButton><ActionButton onClick={close} disabled={busy}>Paneli kapat</ActionButton></>}
      {mode!=="import"&&<><ActionButton variant="secondary" onClick={close} disabled={busy}>Kapat</ActionButton><ActionButton disabled={busy||!summary} onClick={()=>{void run(async()=>{const saved=await bridge!.export(exportOptions);setFileResult(saved);if(saved.cancelled)setNotice("Dosya kaydetme iptal edildi.");});}}>{mode==="template"?"Şablonu kaydet":"Dosyayı dışa aktar"}</ActionButton></>}
    </footer>
  </ModalSurface>;
}
function message(error:unknown){return error instanceof Error?error.message:"Aktarım işlemi tamamlanamadı.";}
