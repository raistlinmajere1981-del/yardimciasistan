import { useState } from "react";
import { Image, Pencil, Trash2 } from "lucide-react";
import type { MarketingContentDetail, MarketingPublication, MarketingStudioSnapshot } from "@yardimci-asistan/shared";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { ActionButton } from "../ui/ActionButton";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { StatusBadge } from "../ui/StatusBadge";
import { MarketingEntityAnalytics } from "./MarketingEntityAnalytics";
import { channelNames, resultValue } from "./share-draft";

export function publicationLabel(p: MarketingPublication) {
  if(p.channel === "website" && p.status === "publishing") return p.desiredPublished ? p.publishedAt ? "Güncelleme onayı bekleniyor" : "Yayın onayı bekleniyor" : "Kaldırma onayı bekleniyor";
  return {draft: "Taslak", publishing: "Görsel işleniyor", published: "Yayında", unpublished: "Yayından kaldırıldı", failed: "Kontrol gerekiyor"}[p.status];
}
export function MarketingThumbnail({snapshot, ids}: {snapshot: MarketingStudioSnapshot; ids: string[]}) {
  const a = snapshot.assets.find(a => a.id === ids[0]);
  return <span className="marketing-thumbnail">{a ? <img src={a.previewUrl} alt={a.altText || "İçerik görseli"}/> : <Image size={22} aria-hidden="true"/>}</span>;
}
export function MarketingRecordManager({kind, snapshot, publications, contents, selectedId, onClose, onEditContent, onEditPublication, onReload, onMessage}: {
  kind: "website" | "drafts" | "publications"; snapshot: MarketingStudioSnapshot; publications: MarketingPublication[]; contents: MarketingContentDetail[];
  selectedId?: string; onClose: () => void; onEditContent: (id: string) => void; onEditPublication: (publication: MarketingPublication) => void;
  onReload: () => Promise<void>; onMessage?: (message: string) => void;
}) {
  const [selection, setSelection] = useState(selectedId || publications[0]?.id || contents[0]?.content.id || "");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [confirm, setConfirm] = useState(false), [analytics, setAnalytics] = useState(false);
  const p = publications.find(p => p.id === selection), c = contents.find(c => c.content.id === selection);
  const canEdit = p && snapshot.channels.some(ch => ch.id === p.channel && ch.enabled && ch.configured && ch.supportsEditPublished);
  const canRemove = p && p.channel === "website" && (p.desiredPublished || p.status === "failed");
  async function operation(remove: boolean) {
    if(!p || busy)return; setBusy(true); setMessage("");
    try {const value = resultValue(await (remove ? window.yardimciDesktop!.unpublishMarketingPublication(p.id, p.revision) : window.yardimciDesktop!.publishMarketingPublication(p.id, p.revision)));
      setConfirm(false); await onReload(); const msg = remove ? "Yayından kaldırma onayı bekleniyor." : publicationLabel(value); setMessage(msg); onMessage?.(msg);
    } catch(e) {setMessage(e instanceof Error ? e.message : "İşlem tamamlanamadı.");} finally {setBusy(false);}
  }
  return <WorkspaceFrame title={kind === "website" ? "Web içerikleri yönetimi" : kind === "drafts" ? "Taslaklar" : "Paylaşımlar"} context={kind === "website" ? "Sitede yayındaki içerikleri görüntüleyin, düzenleyin ve yayından kaldırın." : "İçerikleriniz ve yayın durumları"} className="marketing-management-workspace" presentation="centered" bodyScroll="panes" onClose={onClose} closeBlocked={busy}
    overlay={confirm && <ConfirmDialog withinModal tone="danger" title="Web içeriği yayından kaldırılsın mı?" description="İçerik web eşitlemesi tamamlanınca sitenizden kaldırılır." confirmLabel="Yayından kaldırmayı onayla" busy={busy} onConfirm={() => operation(true)} onCancel={() => setConfirm(false)}/>}>
    <div className="marketing-management"><div className="marketing-management-list" aria-label="İçerik listesi">
      {publications.map(item => <button className="marketing-record" key={item.id} type="button" aria-pressed={item.id === selection} disabled={busy} onClick={() => {setSelection(item.id); setAnalytics(false);}}><MarketingThumbnail snapshot={snapshot} ids={item.mediaAssetIds}/><span><strong>{item.title}</strong><small>{channelNames[item.channel]} · {publicationLabel(item)}</small></span></button>)}
      {contents.map(item => <button className="marketing-record" key={item.content.id} type="button" aria-pressed={item.content.id === selection} onClick={() => setSelection(item.content.id)}><MarketingThumbnail snapshot={snapshot} ids={item.media.map(m => m.mediaAssetId)}/><span><strong>{item.content.title}</strong><small>Son düzenleme: {new Date(item.content.updatedAt).toLocaleDateString("tr-TR")}</small></span></button>)}
      {!publications.length && !contents.length && <p>Henüz içerik yok.</p>}
    </div><section className="marketing-management-detail" aria-label="İçerik detayı">
      <p role="status">{message}</p>
      {p ? <>{p.mediaAssetIds[0] && <div className="marketing-detail-cover"><img src={snapshot.assets.find(a => a.id === p.mediaAssetIds[0])?.previewUrl} alt="Yayın kapak görseli"/></div>}<h3>{p.title}</h3><StatusBadge tone={p.status === "published" ? "success" : p.status === "failed" ? "danger" : "info"}>{publicationLabel(p)}</StatusBadge><p>{p.text}</p><small>{p.publishedAt ? `Yayınlandı: ${new Date(p.publishedAt).toLocaleString("tr-TR")}` : "Henüz yayın onayı alınmadı."}</small>
        <div className="marketing-actions"><ActionButton variant="secondary" disabled={busy || !canEdit} onClick={() => onEditPublication(p)}><Pencil size={16}/>Düzenle</ActionButton><ActionButton variant="danger" disabled={busy || !canRemove} onClick={() => setConfirm(true)}><Trash2 size={16}/>Yayından kaldır</ActionButton></div>
        {p.channel === "instagram" && <><p>Instagram içeriği sonradan değiştirilemez. Güncel içerik için yeni paylaşım oluşturun.</p><ActionButton variant="secondary" disabled={busy || !snapshot.channels.some(c => c.id === "instagram" && c.enabled && c.configured)} onClick={() => void operation(false)}>Instagram yayın durumunu kontrol et</ActionButton>{p.providerSummary?.permalink && <a href={p.providerSummary.permalink} target="_blank" rel="noreferrer">Instagram’da görüntüle</a>}</>}
        {snapshot.shares?.some(s => s.contentId === p.contentId && s.submitted) && <ActionButton variant="secondary" disabled={busy} onClick={() => onEditContent(p.contentId)}>Paylaşım işlemini aç</ActionButton>}
        <ActionButton variant="quiet" onClick={() => setAnalytics(!analytics)}>{analytics ? "İçerik bilgilerine dön" : "Yayın sonuçlarını görüntüle"}</ActionButton>{analytics && <MarketingEntityAnalytics kind="publication" id={p.id} revision={String(p.revision)}/>}
      </> : c ? <><h3>{c.content.title}</h3><p>{c.content.masterText}</p><ActionButton onClick={() => onEditContent(c.content.id)}>Paylaşımı aç</ActionButton></> : <p>Listeden bir içerik seçin.</p>}
    </section></div>
  </WorkspaceFrame>;
}
