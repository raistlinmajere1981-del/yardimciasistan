import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { MAX_PRODUCT_PHOTOS, MAX_PRODUCT_PHOTO_BYTES, type ProductPhotoCollection } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { useRequestGeneration } from "../workspace/use-request-generation";

export function ProductPhotoGallery({ productId, disabled, onBusyChange, onChanged }: {
  productId: string;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onChanged: (collection: ProductPhotoCollection) => Promise<void>;
}) {
  const bridge = window.yardimciDesktop?.commerce;
  const [collection, setCollection] = useState<ProductPhotoCollection | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [failedSource, setFailedSource] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const beginRequest = useRequestGeneration();
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  const load = useCallback(async () => {
    if (!bridge) return;
    const isCurrent = beginRequest();
    setBusy(true); setError(""); setFailedSource("");
    try {
      const next = await bridge.listProductPhotos(productId);
      if (isCurrent()) { setCollection(next); setSelected(next.photos[0]?.id ?? ""); }
    } catch (cause) { if (isCurrent()) setError(cause instanceof Error ? cause.message : "Fotoğraflar okunamadı."); }
    finally { if (isCurrent()) setBusy(false); }
  }, [beginRequest, bridge, productId]);
  useEffect(() => {
    setCollection(null); setPreviews({}); setMessage(""); setSelected("");
    void load();
    return () => { beginRequest(); };
  }, [beginRequest, load]);
  useEffect(() => {
    if (!collection || !bridge) return;
    let current = true;
    void (async () => {
      for (const photo of collection.photos) {
        let url = "";
        try { url = await bridge.previewProductPhoto(productId, photo.id); } catch { /* Per-photo fallback remains visible. */ }
        if (!current) return;
        setPreviews(previous => ({ ...previous, [photo.id]: url }));
      }
    })();
    return () => { current = false; };
  }, [bridge, collection, productId]);
  async function mutate(action: (isCurrent: () => boolean) => Promise<ProductPhotoCollection>, success: string) {
    if (disabled || busy || lock.current || !collection) return;
    const isCurrent = beginRequest();
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const next = await action(isCurrent);
      if (!isCurrent()) return;
      setCollection(next); setSelected(next.photos[0]?.id ?? ""); setMessage(success);
      try { await onChanged(next); }
      catch { if (isCurrent()) setMessage(`${success} Katalog görünümü yenilenemedi.`); }
    } catch (cause) {
      if (!isCurrent()) return;
      setError(cause instanceof Error ? cause.message : "Fotoğraf işlemi tamamlanamadı.");
      try {
        const next = await bridge!.listProductPhotos(productId);
        if (isCurrent()) { setCollection(next); await onChanged(next); }
      } catch { /* Retry remains available. */ }
    } finally { lock.current = false; if (isCurrent()) setBusy(false); }
  }
  async function add(files: File[]) {
    if (!bridge || !collection || disabled || busy || lock.current || !files.length) return;
    if (files.length + collection.photos.length > MAX_PRODUCT_PHOTOS) { setError("Ürün başına en fazla 12 fotoğraf eklenebilir."); return; }
    if (files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size <= 0 || file.size > MAX_PRODUCT_PHOTO_BYTES)) {
      setError("JPEG, PNG veya WEBP seçin; her fotoğraf en fazla 5 MB olabilir."); return;
    }
    await mutate(async isCurrent => {
      const dataUrls: string[] = [];
      for (const file of files) {
        dataUrls.push(await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Ürün fotoğrafı okunamadı."));
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(file);
        }));
        if (!isCurrent()) throw new Error("Ürün değişti; fotoğrafları yeniden seçin.");
      }
      return bridge.addProductPhotos({ productId, expectedRevision: collection.revision, dataUrls });
    }, "Fotoğraflar kaydedildi. Aynı fotoğraf bir kez saklanır.");
  }
  const blocked = disabled || busy || !collection;
  const source = previews[selected] || (selected === collection?.photos[0]?.id || !collection?.photos.length ? collection?.sourceUrl : "") || "";
  const base = { productId, expectedRevision: collection?.revision ?? "" };
  function move(index: number, delta: number) {
    const ids = collection!.photos.map(item => item.id);
    [ids[index], ids[index + delta]] = [ids[index + delta]!, ids[index]!];
    void mutate(() => bridge!.reorderProductPhotos({ ...base, photoIds: ids }), "Fotoğraf sırası kaydedildi.");
  }
  return <section aria-label="Ürün fotoğrafları" aria-busy={busy} className="form-stack market-product-media panel detail-section-card">
    <header className="detail-section-card__heading"><h3>Fotoğraflar · {collection?.photos.length ?? 0}/{MAX_PRODUCT_PHOTOS}</h3></header>
    <div className={`market-product-image-card${source ? " has-image" : ""}`}>
      {source && failedSource !== source ? <img src={source} alt="Seçili ürün fotoğrafı" referrerPolicy="no-referrer" onError={() => setFailedSource(source)} />
        : <div className="market-product-image-placeholder"><ImageIcon size={28} aria-hidden="true" /><span>{collection?.photos.length ? "Fotoğraf önizlenemedi" : "Ürün görseli yok"}</span></div>}
    </div>
    <ol className="product-photo-list" aria-label="Fotoğraf sırası">
      {collection?.photos.map((photo, index) => <li key={photo.id}>
        <button type="button" className="product-photo-thumbnail" aria-label={`${index + 1}. fotoğrafı önizle`} aria-pressed={selected === photo.id} disabled={disabled || busy} onClick={() => setSelected(photo.id)}>
          {previews[photo.id] ? <img src={previews[photo.id]} alt="" /> : <ImageIcon size={22} aria-hidden="true" />}
          <span>{index === 0 ? "Kapak" : index + 1}</span>
        </button>
        <div className="action-row">
          <ActionButton variant="link" disabled={blocked || index === 0} aria-label={`${index + 1}. fotoğrafı kapak yap`} onClick={() => void mutate(() => bridge!.setProductPhotoCover({ ...base, photoId: photo.id }), "Kapak fotoğrafı değiştirildi.")}>Kapak yap</ActionButton>
          <ActionButton variant="link" disabled={blocked || index === 0} aria-label={`${index + 1}. fotoğrafı öne taşı`} onClick={() => move(index, -1)}><ArrowUp size={16} aria-hidden="true" /></ActionButton>
          <ActionButton variant="link" disabled={blocked || index === collection.photos.length - 1} aria-label={`${index + 1}. fotoğrafı arkaya taşı`} onClick={() => move(index, 1)}><ArrowDown size={16} aria-hidden="true" /></ActionButton>
          <ActionButton variant="link" disabled={blocked} aria-label={`${index + 1}. fotoğrafı kaldır`} onClick={() => void mutate(() => bridge!.removeProductPhoto({ ...base, photoId: photo.id }), "Fotoğraf kaldırıldı; ilk fotoğraf kapaktır.")}><Trash2 size={16} aria-hidden="true" /></ActionButton>
        </div>
      </li>)}
    </ol>
    <input ref={input} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" aria-label="Ürün fotoğraflarını seç" disabled={blocked || collection?.photos.length === MAX_PRODUCT_PHOTOS} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void add(files); }} />
    <ActionButton variant="secondary" disabled={blocked || collection?.photos.length === MAX_PRODUCT_PHOTOS} onClick={() => input.current?.click()}><Upload size={16} aria-hidden="true" />Fotoğraf ekle</ActionButton>
    <small>İlk fotoğraf kapaktır. Fotoğraf değişiklikleri hemen kaydedilir; kart taslağınız korunur. JPEG, PNG, WEBP · 5 MB/fotoğraf.</small>
    {message && <p role="status">{message}</p>}
    {error && <><p role="alert">{error}</p><ActionButton variant="link" disabled={disabled || busy} onClick={() => void load()}>Galeriyi yenile</ActionButton></>}
  </section>;
}
