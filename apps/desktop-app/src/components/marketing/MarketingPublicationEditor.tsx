import type { MarketingPublicationInput, MarketingAssetView } from "@yardimci-asistan/shared";
import { MarketingMediaGallery } from "./MarketingMediaGallery";
export function MarketingPublicationEditor({draft,onChange,assets,maxImages,busy}:{draft:MarketingPublicationInput;onChange:(draft:MarketingPublicationInput)=>void;assets:MarketingAssetView[];maxImages:number;busy:boolean}) {
  return <fieldset className="form-stack marketing-publication-fields" disabled={busy}>
    <label className="form-field">Yayın başlığı<input value={draft.title} maxLength={240} onChange={e=>onChange({...draft,title:e.target.value})}/></label>
    <label className="form-field">Yayın metni<textarea aria-label="Yayın metni" value={draft.text} rows={7} maxLength={draft.channel==="instagram"?2200:12000} onChange={e=>onChange({...draft,text:e.target.value})}/></label>
    <p>{draft.channel==="instagram"?"Instagram · tek görsel + açıklama":"Ana sayfa · Duyurular / Kampanyalar"}</p>
    <MarketingMediaGallery assets={assets} selected={draft.mediaAssetIds} maxImages={maxImages} disabled={busy} onChange={mediaAssetIds=>onChange({...draft,mediaAssetIds})}/>
  </fieldset>;
}
export function MarketingWebsitePreview({draft,assets}:{draft:MarketingPublicationInput;assets:MarketingAssetView[]}) {
  return <article aria-label="Website yayın önizlemesi" className="marketing-preview">
    <h3>{draft.title}</h3><p>{draft.text}</p><div className="marketing-preview-gallery">{draft.mediaAssetIds.map(id=>{const a=assets.find(asset=>asset.id===id);return a?<img key={id} src={a.previewUrl} alt={a.altText || "Yayın görseli"}/>:null;})}</div>
  </article>;
}
