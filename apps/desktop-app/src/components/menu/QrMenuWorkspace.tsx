import { useMemo, useState } from "react";
import { Copy, Download, ExternalLink, Printer, RefreshCw } from "lucide-react";
import type { PrintQrCodesInput } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { createQrSvg } from "./qr-code";

export type OrderTable = { id: string; name: string; area: string; token: string };
export type OrderRoom = { id: string; name: string; number: string; token: string };
type Kind = "qr_menu" | "qr_room" | "qr_table";
type Code = { id:string; label:string; url:string };
const collator = new Intl.Collator("tr-TR", {numeric:true,sensitivity:"base"});
function downloadSvg(svg:string,name:string) {
  const href=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml;charset=utf-8"}));
  const anchor=document.createElement("a");
  anchor.href=href; anchor.download=name.replace(/[^a-zA-Z0-9_-]/g,"-")+".svg";
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(href),1000);
}
export function QrMenuWorkspace({url,roomOrdersEnabled,ordersEnabled,rooms,tables,onClose,onRefresh}:{
  url:string;roomOrdersEnabled:boolean;ordersEnabled:boolean;rooms:OrderRoom[];tables:OrderTable[];
  onClose():void;onRefresh():Promise<{rooms:OrderRoom[];tables:OrderTable[]}>;
}) {
  const [kind,setKind]=useState<Kind>("qr_menu");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const [selected,setSelected]=useState<Set<string>>(()=>new Set());
  const [activeId,setActiveId]=useState("");
  const [printing,setPrinting]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const [notice,setNotice]=useState("");
  const [items,setItems]=useState({rooms,tables});
  const data=useMemo<Code[]>(()=>kind==="qr_room" && roomOrdersEnabled
    ? items.rooms.map(room=>({id:room.id,label:room.number?"Oda "+room.number:room.name,url:url+"?room="+encodeURIComponent(room.token)}))
    : kind==="qr_table" && ordersEnabled
      ? items.tables.map(table=>({id:table.id,label:(table.area?table.area+" · ":"")+table.name,url:url+"?table="+encodeURIComponent(table.token)}))
      : [],[kind,items,roomOrdersEnabled,ordersEnabled,url]);
  const filtered=useMemo(()=>data.filter(row=>row.label.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR"))).sort((a,b)=>collator.compare(a.label,b.label)),[data,search]);
  const pages=Math.max(1,Math.ceil(filtered.length/25));
  const currentPage=Math.min(page,pages);
  const visible=filtered.slice((currentPage-1)*25,currentPage*25);
  const current=kind==="qr_menu" ? {id:"menu",label:"Genel QR Menü",url}
    : data.find(row=>row.id===activeId) ?? visible[0] ?? null;
  const svg=useMemo(()=>{try {return current?.url?createQrSvg(current.url):"";}catch{return "";}},[current?.url]);
  const allVisible=visible.length>0 && visible.every(row=>selected.has(row.id));
  const selectPage=()=>setSelected(previous=>{
    const next=new Set(previous);
    for(const row of visible) if(allVisible) next.delete(row.id);else next.add(row.id);
    return next;
  });
  const switchKind=(next:Kind)=>{setKind(next);setSearch("");setSelected(new Set());setActiveId("");setPage(1);setNotice("");};
  const qrInput=(ids:string[]):PrintQrCodesInput=>kind==="qr_menu"?{kind:"qr_menu"}:{kind,ids};
  async function print(ids:string[]) {
    if(printing || !window.yardimciDesktop?.printQrCodes) return;
    setPrinting(true);setNotice("");
    try {
      const result=await window.yardimciDesktop.printQrCodes(qrInput(ids));
      setNotice(!result.ok?result.message:result.value==="accepted"?"QR kodları yazıcı kuyruğuna gönderildi."
        :result.value===null?"Yazdırma iptal edildi.":result.value==="unknown"?"Yazdırma sonucu belirsiz; yeniden göndermeden yazıcı kuyruğunu kontrol edin.":"Yazdırma başarısız oldu.");
    }catch {setNotice("QR yazdırma bağlantısı kullanılamıyor.");}
    finally{setPrinting(false);}
  }
  async function refresh() {
    if(refreshing || printing)return;
    setRefreshing(true);setNotice("");
    try {
      const updated=await onRefresh();
      setItems(updated);setSelected(new Set());setActiveId("");
    }catch {setNotice("Güncel QR kodları okunamadı.");}
    finally{setRefreshing(false);}
  }
  async function copy() {
    if(!current?.url)return;
    try {await navigator.clipboard.writeText(current.url);setNotice("Bağlantı panoya kopyalandı.");}
    catch {setNotice("Bağlantı kopyalanamadı.");}
  }
  return <WorkspaceFrame title="QR Menü Kodları" presentation="centered" className="qr-menu-workspace" bodyScroll="panes"
    onClose={onClose} closeBlocked={printing} closeLabel="QR Menü araçlarını kapat"
    navigation={<nav className="qr-menu-workspace__tabs" aria-label="QR türleri">
      <ActionButton variant="ghost" aria-pressed={kind==="qr_menu"} onClick={()=>switchKind("qr_menu")}>Genel Menü</ActionButton>
      {roomOrdersEnabled && <ActionButton variant="ghost" aria-pressed={kind==="qr_room"} onClick={()=>switchKind("qr_room")}>Odalar <small>{items.rooms.length}</small></ActionButton>}
      {ordersEnabled && <ActionButton variant="ghost" aria-pressed={kind==="qr_table"} onClick={()=>switchKind("qr_table")}>Masalar <small>{items.tables.length}</small></ActionButton>}
      <ActionButton className="qr-menu-workspace__refresh" variant="secondary" size="sm" busy={refreshing} onClick={()=>void refresh()}><RefreshCw size={16}/> Güncelle</ActionButton>
    </nav>}
    footer={<>
      <span className="market-muted">Yazıcı ayarları: Ayarlar → Baskı Yönetimi. Oda kodları yalnız aktif, açık hesaplı konaklamalarda geçerlidir.</span>
      <ActionButton variant="secondary" onClick={onClose} disabled={printing}>Kapat</ActionButton>
    </>}>
    <div className="qr-menu-workspace__body">
      {kind!=="qr_menu" && <div className="qr-menu-workspace__list">
        <header><h3>{kind==="qr_room"?"Aktif konaklamalar":"Sipariş masaları"}</h3><span className="market-muted">{data.length} QR kod</span></header>
        <label>Ara<input aria-label="QR kodlarında ara" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder={kind==="qr_room"?"Oda numarası veya adı":"Masa adı veya alan"}/></label>
        <div className="qr-menu-workspace__selection">
          <ActionButton size="sm" variant="secondary" disabled={!visible.length||printing} onClick={selectPage}>{allVisible?"Sayfa seçimini kaldır":"Bu sayfayı seç"}</ActionButton>
          <ActionButton size="sm" variant="ghost" disabled={!selected.size||printing} onClick={()=>setSelected(new Set())}>Temizle</ActionButton>
          <span>{selected.size} seçili</span>
        </div>
        <div className="qr-menu-workspace__records">
          {visible.map(row=><div className="qr-menu-workspace__record" key={row.id} data-active={current?.id===row.id}>
            <input type="checkbox" aria-label={row.label+" seç"} checked={selected.has(row.id)} disabled={printing}
              onChange={e=>setSelected(prev=>{const next=new Set(prev);if(e.target.checked)next.add(row.id);else next.delete(row.id);return next;})}/>
            <button type="button" aria-pressed={current?.id===row.id} onClick={()=>setActiveId(row.id)}>{row.label}</button>
          </div>)}
          {!visible.length && <p className="market-muted">{data.length?"Aramayla eşleşen kayıt bulunamadı.":kind==="qr_room"?"Açık oda hesabı bulunan aktif konaklama yok.":"Aktif masa QR kaydı yok."}</p>}
        </div>
        <div className="qr-menu-workspace__pagination">
          <ActionButton size="sm" variant="secondary" disabled={currentPage===1} onClick={()=>setPage(n=>Math.max(1,n-1))}>Önceki</ActionButton>
          <span>{currentPage} / {pages}</span>
          <ActionButton size="sm" variant="secondary" disabled={currentPage===pages} onClick={()=>setPage(n=>Math.min(pages,n+1))}>Sonraki</ActionButton>
        </div>
        <div className="qr-menu-workspace__batch">
          <ActionButton disabled={!selected.size||selected.size>100||printing} busy={printing}
            onClick={()=>void print(Array.from(selected))}><Printer size={16}/> Seçilenleri Yazdır ({selected.size})</ActionButton>
          {selected.size>100 && <p role="status">Tek işlemde en çok 100 kod yazdırılabilir; seçimi daraltın.</p>}
        </div>
      </div>}
      <section className="qr-menu-workspace__preview" aria-label="Seçili QR kodu">
        <header><h3>{current?.label??"Seçili QR bulunmuyor"}</h3>
          <span className="market-muted">{kind==="qr_menu"?"Genel menü bağlantısı":kind==="qr_room"?"Konaklamaya özel, süreli kod":"Masaya özel sipariş bağlantısı"}</span></header>
        {svg?<div className="qr-menu-workspace__code" aria-label="QR kod önizlemesi" dangerouslySetInnerHTML={{__html:svg}}/>
          :<p className="market-muted">Kod önizlemesi bulunmuyor.</p>}
        <div className="qr-menu-workspace__url"><label>QR bağlantısı<input readOnly value={current?.url??""} aria-label="Seçili QR bağlantısı"/></label></div>
        <div className="qr-menu-workspace__actions">
          <ActionButton size="sm" variant="secondary" disabled={!current?.url} onClick={()=>void window.yardimciDesktop?.openExternal(current!.url)}><ExternalLink size={16}/> Sayfayı Aç</ActionButton>
          <ActionButton size="sm" variant="secondary" disabled={!current?.url} onClick={()=>void copy()}><Copy size={16}/> Bağlantıyı Kopyala</ActionButton>
          <ActionButton size="sm" variant="secondary" disabled={!svg} onClick={()=>downloadSvg(svg,"qr-"+(current?.id??"menu"))}><Download size={16}/> QR Kodu İndir</ActionButton>
          <ActionButton size="sm" disabled={!svg||printing} busy={printing} onClick={()=>void print(current&&kind!=="qr_menu"?[current.id]:[])}><Printer size={16}/> Yazdır</ActionButton>
        </div>
        <p className="market-muted">{kind==="qr_room"?"Misafir çıkışında eski kod iptal olur; yeni konaklamaya yeni QR verilir.":kind==="qr_table"?"Masa kodu, o masaya ait sipariş bağlantısını açar.":"Genel kod, webdeki güncel QR menüyü açar."}</p>
        {notice&&<p className="qr-menu-workspace__notice" role="status">{notice}</p>}
      </section>
    </div>
  </WorkspaceFrame>;
}
