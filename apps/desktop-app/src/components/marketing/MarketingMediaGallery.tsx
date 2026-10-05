import { SearchSelect } from "../ui/SearchSelect";
import type { MarketingAssetView } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
export function MarketingMediaGallery({assets,selected,onChange,maxImages,disabled=false}:{assets:MarketingAssetView[];selected:string[];onChange:(ids:string[])=>void;maxImages:number;disabled?:boolean}) {
  function move(index:number,offset:number) {const next=[...selected];[next[index],next[index+offset]]=[next[index+offset],next[index]];onChange(next);}
  return <section aria-label="Seçilen görseller" className="marketing-media-selector">
    <p>{selected.length} / {maxImages} görsel · İlk görsel kapak olarak kullanılır.</p>
    <ol className="marketing-selected-media">{selected.map((id,index)=>{
      const asset=assets.find(a=>a.id===id);return <li key={id}>
        {asset?.previewUrl && <img src={asset.previewUrl} alt={asset.altText || `Görsel ${index+1}`} />}
        <span>Görsel {index+1}{asset?.archivedAt?" · Arşivlenmiş":""}</span>
        <ActionButton variant="secondary" disabled={disabled || index===0} aria-label={`Görsel ${index+1} yukarı`} onClick={()=>move(index,-1)}>↑</ActionButton>
        <ActionButton variant="secondary" disabled={disabled || index===selected.length-1} aria-label={`Görsel ${index+1} aşağı`} onClick={()=>move(index,1)}>↓</ActionButton>
        <ActionButton variant="secondary" disabled={disabled} aria-label={`Görsel ${index+1} çıkar`} onClick={()=>onChange(selected.filter(value=>value!==id))}>Çıkar</ActionButton>
      </li>;
    })}</ol>
    <SearchSelect ariaLabel="Medya seç" value="" placeholder="Görsel ekle" clearable={false} disabled={disabled || selected.length >= maxImages}
      onChange={id => onChange([...selected, id])} options={assets.filter(asset => !asset.archivedAt && !selected.includes(asset.id)).map(asset => ({
        id: asset.id, label: asset.altText || `${asset.source === "ai" ? "AI" : "Yüklenen"} görsel`, description: `${asset.source === "ai" ? "AI" : "Yüklenen"} · ${asset.width} × ${asset.height}`, keywords: asset.id,
        leading: <img src={asset.previewUrl} alt="" />
      }))} emptyMessage="Seçilebilecek görsel yok. Görsel yükleyin veya oluşturun." />
  </section>;
}
