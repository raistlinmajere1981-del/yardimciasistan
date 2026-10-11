import { Image } from "lucide-react";
import type { MarketingContentDetail, MarketingPublication, MarketingStudioSnapshot } from "@yardimci-asistan/shared";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { ActionButton } from "../ui/ActionButton";
import { channelNames } from "./share-draft";

export function publicationLabel(p: MarketingPublication) {
  if (p.channel === "website" && p.status === "publishing") return p.desiredPublished ? p.publishedAt ? "Güncelleme onayı bekleniyor" : "Yayın onayı bekleniyor" : "Kaldırma onayı bekleniyor";
  return {draft: "Taslak", publishing: "Görsel işleniyor", published: "Yayında", unpublished: "Yayından kaldırıldı", failed: "Kontrol gerekiyor"}[p.status];
}
export function MarketingThumbnail({snapshot, ids}: {snapshot: MarketingStudioSnapshot; ids: string[]}) {
  const a = snapshot.assets.find(a => a.id === ids[0]);
  return <span className="marketing-thumbnail">{a ? <img src={a.previewUrl} alt={a.altText || "İçerik görseli"}/> : <Image size={22} aria-hidden="true"/>}</span>;
}

/** A selector/launcher only; all records open the canonical sharing workspace. */
export function MarketingRecordManager({kind, snapshot, publications, contents, onClose, onEditContent, onEditPublication}: {
  kind: "website" | "drafts" | "publications"; snapshot: MarketingStudioSnapshot; publications: MarketingPublication[]; contents: MarketingContentDetail[];
  onClose: () => void; onEditContent: (id: string) => void; onEditPublication: (publication: MarketingPublication) => void;
}) {
  return <WorkspaceFrame title={kind === "website" ? "Web içerikleri" : kind === "drafts" ? "Taslaklar" : "Paylaşımlar"} context="Açmak istediğiniz kaydı seçin."
    className="marketing-workspace-frame marketing-records-workspace" presentation="centered" onClose={onClose}
    footer={<ActionButton variant="secondary" onClick={onClose}>Kapat</ActionButton>}>
    <section className="marketing-records-list" aria-label="Kayıtlar">
      {publications.map(item => <button className="marketing-record" key={item.id} type="button" onClick={() => onEditPublication(item)}><MarketingThumbnail snapshot={snapshot} ids={item.mediaAssetIds}/><span><strong>{item.title}</strong><small>{channelNames[item.channel]} · {publicationLabel(item)}</small></span></button>)}
      {contents.map(item => <button className="marketing-record" key={item.content.id} type="button" onClick={() => onEditContent(item.content.id)}><MarketingThumbnail snapshot={snapshot} ids={item.media.map(m => m.mediaAssetId)}/><span><strong>{item.content.title}</strong><small>Son düzenleme: {new Date(item.content.updatedAt).toLocaleDateString("tr-TR")}</small></span></button>)}
      {!publications.length && !contents.length && <p className="muted">Henüz içerik yok.</p>}
    </section>
  </WorkspaceFrame>;
}
