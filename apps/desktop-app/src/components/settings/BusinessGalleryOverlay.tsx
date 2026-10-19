import { useEffect, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import type { PublicResourceMediaAssetFields } from "@yardimci-asistan/shared";
import { ModalSurface } from "../ui/ModalSurface";
import { IconButton } from "../ui/IconButton";
import { ActionButton } from "../ui/ActionButton";
import { MediaPreview } from "../ui/MediaPreview";
import { ReorderButtons } from "../ui/ReorderButtons";
import { WorkspaceHeader } from "../workspace/WorkspaceHeader";
import { reportAppStatus } from "../../app/runtime-state";

export function BusinessGalleryOverlay({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<PublicResourceMediaAssetFields[]>([]);
  const [dirty, setDirty] = useState(false);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 12;
  const bridge = window.yardimciDesktop;
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!bridge?.listBusinessGallery || !bridge.getBusinessGalleryDraftState) throw Error("Galeri yönetimi kullanılamıyor.");
        const [list, status] = await Promise.all([bridge.listBusinessGallery(), bridge.getBusinessGalleryDraftState()]);
        if (active) { setItems(list); setDirty(status.dirty); }
      } catch (error) { if (active) reportAppStatus("error", error instanceof Error ? error.message : "Galeri okunamadı."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [bridge]);
  const alteredTitles = items.filter(item => titles[item.id] !== undefined && titles[item.id] !== item.title);
  const pending = dirty || alteredTitles.length > 0;
  const closeBlocked = busy || loading || pending;
  const close = () => { if (!closeBlocked) onClose(); };
  const apply = async (fn: () => Promise<{ok:boolean;message:string;media:PublicResourceMediaAssetFields[];dirty?:boolean}>) => {
    setBusy(true);
    try {
      const result = await fn();
      if (!result.ok) reportAppStatus("error", result.message);
      setItems(result.media);
      if (typeof result.dirty === "boolean") setDirty(result.dirty);
    } catch (error) { reportAppStatus("error", error instanceof Error ? error.message : "Galeri işlemi yapılamadı."); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true);
    try {
      for (const item of alteredTitles) {
        const updated = await bridge!.updateBusinessGalleryPhoto({
          id: item.id, kind: item.kind === "cover" ? "cover" : "photo", title: titles[item.id]!
        });
        if (!updated.ok) { reportAppStatus("error", updated.message); return; }
        setItems(updated.media);
      }
      const result = await bridge!.commitBusinessGallery();
      if (!result.ok) { reportAppStatus("error", result.message); return; }
      setDirty(false); setTitles({});
      if (result.changed) reportAppStatus("success", "Galeri kaydedildi. Web eşitlemesinde yayınlanacak.");
      setItems(await bridge!.listBusinessGallery());
    } catch { reportAppStatus("error", "Galeri kaydedilemedi."); }
    finally { setBusy(false); }
  };
  const discard = async () => {
    setBusy(true);
    try {
      const result = await bridge!.discardBusinessGallery();
      if (!result.ok) { reportAppStatus("error", result.message); return; }
      setDirty(false); setTitles({});
      setItems(await bridge!.listBusinessGallery());
    } catch { reportAppStatus("error", "Değişiklikler geri alınamadı."); }
    finally { setBusy(false); }
  };
  const ordered = [...items].sort((a,b) => a.sortOrder - b.sortOrder);
  const totalPages = Math.max(1, Math.ceil(ordered.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const visible = ordered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return <ModalSurface labelledBy="business-gallery-title" className="settings-gallery-overlay"
    dismissOnBackdrop closeBlocked={closeBlocked} onClose={close}>
    <WorkspaceHeader title="Galeri Yönetimi" titleId="business-gallery-title" closeLabel="Galeriyi kapat" closeBlocked={closeBlocked} onClose={close} />
    <div className="settings-gallery-body">
        <div className="settings-gallery-tools">
          <p>{ordered.length} fotoğraf</p>
          <ActionButton disabled={loading || busy || items.length >= 80 || !bridge?.addBusinessGalleryPhoto}
            onClick={() => void apply(() => bridge!.addBusinessGalleryPhoto())}>
            <ImagePlus size={16} aria-hidden="true"/> Fotoğraf Ekle
          </ActionButton>
        </div>
        <div className="settings-gallery-content" aria-busy={loading}>
        {loading ? null : ordered.length === 0 ?
          <div className="settings-gallery-empty">Henüz fotoğraf yok.</div> :
          <div className="settings-gallery-grid" aria-label="Galeri fotoğrafları">
            {visible.map((item,pageIndex) => {
              const index = currentPage * pageSize + pageIndex;
              return <article className="settings-gallery-item" key={item.id}>
              <MediaPreview className="settings-gallery-preview" src={item.previewDataUrl} alt={item.title || item.originalName} loading="lazy">
                <div className="settings-gallery-placeholder">Önizleme yok</div>
              </MediaPreview>
              <label className="form-field">Açıklama
                <input value={titles[item.id] ?? item.title} maxLength={240} disabled={busy}
                  onChange={event => setTitles(current => ({...current, [item.id]: event.target.value}))}/>
              </label>
              <div className="settings-gallery-item-actions">
                <ReorderButtons label={item.originalName} canMoveUp={index > 0} canMoveDown={index < ordered.length - 1} disabled={busy}
                  onMove={direction => void apply(() => bridge!.moveBusinessGalleryPhoto({id:item.id,direction}))} />
                <IconButton size="sm" busy={busy} aria-label={item.originalName + " sil"}
                  onClick={() => void apply(() => bridge!.deleteBusinessGalleryPhoto(item.id))}><Trash2 size={14} aria-hidden="true" /></IconButton>
              </div>
            </article>;})}
          </div>}
        </div>
        {totalPages > 1 && <nav className="settings-gallery-pagination" aria-label="Galeri sayfaları">
          <ActionButton variant="secondary" disabled={busy || currentPage === 0} onClick={() => setPage(p => Math.max(0,p-1))}>Önceki</ActionButton>
          <span>{currentPage + 1} / {totalPages} · {ordered.length} fotoğraf</span>
          <ActionButton variant="secondary" disabled={busy || currentPage === totalPages-1} onClick={() => setPage(p => Math.min(totalPages-1,p+1))}>Sonraki</ActionButton>
        </nav>}
    </div>
    <footer className="workspace-frame__footer action-row">
      {pending && <span>Kaydedilmemiş galeri değişiklikleri</span>}
      <ActionButton variant="secondary" disabled={!pending || busy || loading} onClick={() => void discard()}>Değişiklikleri Geri Al</ActionButton>
      <ActionButton disabled={!pending || busy || loading} onClick={() => void save()}>Kaydet</ActionButton>
    </footer>
  </ModalSurface>;
}
