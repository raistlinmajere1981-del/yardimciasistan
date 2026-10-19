import { SearchSelect } from "../ui/SearchSelect";
import type { MarketingAssetView } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { ReorderButtons } from "../ui/ReorderButtons";
export function MarketingMediaGallery({assets,selected,onChange,maxImages,disabled=false}:{assets:MarketingAssetView[];selected:string[];onChange:(ids:string[])=>void;maxImages:number;disabled?:boolean}) {
  function move(index:number,offset:number) {const next=[...selected];const current=next[index];const other=next[index+offset];if(current===undefined||other===undefined)return;next[index]=other;next[index+offset]=current;onChange(next);}
  return <section aria-label="Seçilen görseller" className="marketing-media-selector">
    <p>{selected.length} / {maxImages} görsel · İlk görsel kapak olarak kullanılır.</p>
    <ol className="marketing-selected-media">{selected.map((id,index)=>{
      const asset=assets.find(a=>a.id===id);return <li key={id}>
        {asset?.previewUrl && <img src={asset.previewUrl} alt={asset.altText || `Görsel ${index+1}`} />}
        <span>Görsel {index+1}{asset?.archivedAt?" · Yeni seçimlerde gizli":""}</span>
        <ReorderButtons label={`Görsel ${index+1}`} canMoveUp={index > 0} canMoveDown={index < selected.length-1} disabled={disabled}
          onMove={direction => move(index, direction === "up" ? -1 : 1)} />
        <ActionButton variant="secondary" disabled={disabled} aria-label={`Görsel ${index+1} çıkar`} onClick={()=>onChange(selected.filter(value=>value!==id))}>Çıkar</ActionButton>
      </li>;
    })}</ol>
    <SearchSelect ariaLabel="Görsel ekle" value="" placeholder="Görsel ekle" clearable={false} disabled={disabled || selected.length >= maxImages}
      onChange={id => onChange([...selected, id])} options={assets.filter(asset => !asset.archivedAt && !selected.includes(asset.id)).map(asset => ({
        id: asset.id, label: asset.altText || `${asset.source === "ai" ? "AI" : "Yüklenen"} görsel`, description: `${asset.source === "ai" ? "AI" : "Yüklenen"} · ${asset.width} × ${asset.height}`, keywords: asset.id,
        leading: <img src={asset.previewUrl} alt="" />
      }))} emptyMessage="Seçilebilecek görsel yok. Görsel yükleyin veya oluşturun." />
  </section>;
}
