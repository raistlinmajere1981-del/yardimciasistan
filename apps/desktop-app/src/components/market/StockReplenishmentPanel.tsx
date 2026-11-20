import { useEffect, useMemo, useState } from "react";
import type { StockReplenishmentRow } from "../../../electron/stock-replenishment";
import { ActionButton } from "../ui/ActionButton";

/** A read-only purchase suggestion. No purchase is created until the operator
 * uses the existing purchasing workflow; inventory counts stay unchanged. */
export function StockReplenishmentPanel({ refreshRevision = 0 }: { refreshRevision?: number }) {
  const [rows,setRows] = useState<StockReplenishmentRow[]>([]);
  const [categoryId,setCategoryId] = useState("");
  const [search,setSearch] = useState("");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [reload,setReload] = useState(0);
  useEffect(()=>{
    let active=true;
    setLoading(true);setError("");
    const read = window.yardimciDesktop?.commerce?.listStockReplenishment;
    if (!read) { setError("Stok servisi bağlantısı bulunamadı.");setLoading(false);return; }
    void read().then(value=>{
      if(active)setRows(value);
    }).catch(e=>{
      if(active)setError(e instanceof Error ? e.message : "Sipariş önerileri okunamadı.");
    }).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[refreshRevision,reload]);
  const categories = useMemo(()=>Array.from(new Map(rows.map(row=>[row.categoryId,{id:row.categoryId,name:row.categoryName}])).values()),[rows]);
  const filtered = useMemo(()=>rows.filter(row=>(!categoryId||row.categoryId===categoryId)
    && (!search.trim() || (row.name+" "+row.sku).toLocaleLowerCase("tr-TR").includes(search.trim().toLocaleLowerCase("tr-TR")))),[rows,categoryId,search]);
  function downloadCsv(selected:StockReplenishmentRow[]){
    const value = (v:string|number) => {
      const text=String(v);
      const safe = typeof v==="string" && /^[=+@\t\r-]/.test(text) ? "'"+text : text;
      return '"'+safe.replaceAll('"','""')+'"';
    };
    const fields=[["Kategori","Ürün","SKU","Birim","Mevcut","Minimum","İdeal","Sipariş"],
      ...selected.map(r=>[r.categoryName,r.name,r.sku,r.unit,r.quantity,r.minimumQuantity,r.idealQuantity,r.suggestedQuantity])];
    const blob=new Blob(["\uFEFF"+fields.map(row=>row.map(value).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");link.href=url;link.download="ideal-stok-siparis-listesi.csv";
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function printList(selected:StockReplenishmentRow[]){
    const esc=(value:string|number)=>String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
    const body=selected.map(r=>"<tr>"+[r.categoryName,r.name,r.sku,r.unit,r.quantity,r.minimumQuantity,r.idealQuantity,r.suggestedQuantity]
      .map(v=>"<td>"+esc(v)+"</td>").join("")+"</tr>").join("");
    const html='<!doctype html><html lang="tr"><meta charset="utf-8"><title>İdeal Stok Sipariş Listesi</title>'
      +'<style>body{font:12px sans-serif;color:#111;padding:20px}h1{font-size:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:6px;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}@page{size:A4 landscape;margin:12mm}</style>'
      +'<h1>İdeal Stok – Sipariş Listesi</h1><p>'+new Date().toLocaleDateString("tr-TR")+' · '+selected.length+' ürün · Yalnız öneridir; sipariş oluşturulmadı.</p>'
      +'<table><thead><tr>'+["Kategori","Ürün","SKU","Birim","Mevcut","Minimum","İdeal","Sipariş"].map(t=>"<th>"+t+"</th>").join("")+'</tr></thead><tbody>'+body+'</tbody></table></html>';
    const frame=document.createElement("iframe");
    frame.setAttribute("title","Sipariş listesi yazdırma");
    frame.style.cssText="position:fixed;left:-9999px;top:0;width:900px;height:800px;border:0;";
    document.body.append(frame);
    frame.onload=()=>{
      const view=frame.contentWindow;
      if(view) { view.onafterprint=()=>frame.remove();view.focus();view.print(); }
      else frame.remove();
    };
    frame.srcdoc=html;
  }
  return <section className="market-panel market-stock-replenishment" aria-label="İdeal stok sipariş listesi" style={{gridColumn:"1 / -1"}}>
    <header className="market-panel-heading"><span>Satın Alma Planlama</span><h2>İdeal Stok Eksikleri</h2>
      <p>Her ürün için önerilen miktar = İdeal stok − Mevcut stok. Minimum stok yalnız uyarı eşiğidir.</p></header>
    <div className="market-form-actions" style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"end"}}>
      <label className="form-field">Kategori
        <select value={categoryId} onChange={e=>setCategoryId(e.target.value)}>
          <option value="">Tüm kategoriler</option>
          {categories.map(category=><option value={category.id} key={category.id}>{category.name}</option>)}
        </select>
      </label>
      <label className="form-field">Ara <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ürün adı / SKU"/></label>
      <ActionButton variant="secondary" onClick={()=>setReload(n=>n+1)} disabled={loading}>Yenile</ActionButton>
      <ActionButton variant="secondary" disabled={loading || !filtered.length} onClick={()=>downloadCsv(filtered)}>Seçilenleri CSV</ActionButton>
      <ActionButton variant="secondary" disabled={loading || !rows.length} onClick={()=>downloadCsv(rows)}>Tüm eksikleri CSV</ActionButton>
      <ActionButton variant="secondary" disabled={loading || !filtered.length} onClick={()=>printList(filtered)}>Seçilenleri Yazdır</ActionButton>
      <ActionButton variant="secondary" disabled={loading || !rows.length} onClick={()=>printList(rows)}>Tümünü Yazdır</ActionButton>
    </div>
    {error && <p role="alert">{error}</p>}
    <p role="status" className="market-muted">{loading?"Stok önerileri hesaplanıyor…":filtered.length+" ürün için sipariş önerisi · Toplam "+rows.length+" eksik ürün"}</p>
    <div style={{maxHeight:350,overflow:"auto"}}>
      <table className="market-stock-replenishment-table" style={{width:"100%",textAlign:"left",borderCollapse:"collapse"}}>
        <thead><tr><th>Kategori</th><th>Ürün</th><th>Mevcut</th><th>Minimum</th><th>İdeal</th><th>Sipariş</th></tr></thead>
        <tbody>
          {filtered.slice(0,250).map(row=><tr key={row.productId}>
            <td>{row.categoryName}</td><td>{row.name}<small style={{display:"block"}}>{row.sku}</small></td>
            <td>{row.quantity} {row.unit}</td><td>{row.minimumQuantity}</td>
            <td>{row.idealQuantity}</td><td><strong>{row.suggestedQuantity} {row.unit}</strong></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {filtered.length>250 && <p className="market-muted">İlk 250 ürün gösteriliyor. CSV ve yazdırma tüm filtre sonuçlarını içerir.</p>}
    {!loading && !error && rows.length===0 && <p className="market-muted">İdeal stok altında ürün yok. Ürün kartlarında ideal stok miktarı belirleyebilirsiniz.</p>}
  </section>;
}
