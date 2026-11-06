import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { MAX_PRODUCT_PHOTOS, MAX_PRODUCT_PHOTO_BYTES, type ProductPhotoCollection, type ProductPhotoDraftPhoto } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { useRequestGeneration } from "../workspace/use-request-generation";

export function ProductPhotoGallery({ productId, collection, photos, disabled, onBusyChange, onChange }: {
  productId: string;
  collection: ProductPhotoCollection;
  photos: ProductPhotoDraftPhoto[];
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onChange: (photos: ProductPhotoDraftPhoto[]) => void;
}) {
  const bridge = window.yardimciDesktop?.commerce;
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
  useEffect(() => {
    setMessage(""); setError(""); setSelected(""); setFailedSource("");
  }, [collection]);
  useEffect(() => {
    if (!bridge || !productId) return;
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
  function change(next: ProductPhotoDraftPhoto[], text: string) {
    if (disabled || busy || lock.current) return;
    onChange(next); setMessage(`${text} Ürünü Kaydet ile uygulanacak.`); setError("");
  }
  async function add(files: File[]) {
    if (disabled || busy || lock.current || !files.length) return;
    if (files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size <= 0 || file.size > MAX_PRODUCT_PHOTO_BYTES)) {
      setError("JPEG, PNG veya WEBP seçin; her fotoğraf en fazla 5 MB olabilir."); return;
    }
    const isCurrent = beginRequest();
    lock.current = true; setBusy(true); setError("");
    try {
      const next = [...photos];
      for (const file of files) {
        const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        if (next.some(photo => photo.id === id)) continue;
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Ürün fotoğrafı okunamadı."));
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(file);
        });
        next.push({ id, format: file.type, dataUrl });
      }
      if (!isCurrent()) return;
      if (next.length > MAX_PRODUCT_PHOTOS) throw new Error("Ürün başına en fazla 12 fotoğraf eklenebilir.");
      onChange(next); setMessage("Fotoğraflar taslağa eklendi. Ürünü Kaydet ile uygulanacak; aynı fotoğraf bir kez saklanır.");
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : "Fotoğraf okunamadı.");
    } finally { lock.current = false; if (isCurrent()) setBusy(false); }
  }
  const blocked = disabled || busy;
  const selectedPhoto = photos.find(photo => photo.id === selected) ?? photos[0];
  const source = selectedPhoto?.dataUrl || previews[selectedPhoto?.id ?? ""] || (!photos.length && !collection.photos.length ? collection.sourceUrl : "") || "";
  function move(index: number, delta: number) {
    const next = [...photos];
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    change(next, "Fotoğraf sırası taslakta değiştirildi.");
  }
  return <section aria-label="Ürün fotoğrafları" aria-busy={busy} className="form-stack market-product-media panel detail-section-card">
    <header className="detail-section-card__heading"><h3>Fotoğraflar · {photos.length}/{MAX_PRODUCT_PHOTOS}</h3></header>
    <div className={`market-product-image-card${source ? " has-image" : ""}`}>
      {source && failedSource !== source ? <img src={source} alt="Seçili ürün fotoğrafı" referrerPolicy="no-referrer" onError={() => setFailedSource(source)} />
        : <div className="market-product-image-placeholder"><ImageIcon size={28} aria-hidden="true" /><span>{photos.length ? "Fotoğraf önizlenemedi" : "Ürün görseli yok"}</span></div>}
    </div>
    <ol className="product-photo-list" aria-label="Fotoğraf sırası">
      {photos.map((photo, index) => <li key={photo.id}>
        <button type="button" className="product-photo-thumbnail" aria-label={`${index + 1}. fotoğrafı önizle`} aria-pressed={selectedPhoto?.id === photo.id} disabled={disabled || busy} onClick={() => setSelected(photo.id)}>
          {(photo.dataUrl || previews[photo.id]) ? <img src={photo.dataUrl || previews[photo.id]} alt="" /> : <ImageIcon size={22} aria-hidden="true" />}
          <span>{index === 0 ? "Kapak" : index + 1}</span>
        </button>
        <div className="action-row">
          <ActionButton variant="link" disabled={blocked || index === 0} aria-label={`${index + 1}. fotoğrafı kapak yap`} onClick={() => change([photo, ...photos.filter(item => item.id !== photo.id)], "Kapak fotoğrafı taslakta değiştirildi.")}>Kapak yap</ActionButton>
          <ActionButton variant="link" disabled={blocked || index === 0} aria-label={`${index + 1}. fotoğrafı öne taşı`} onClick={() => move(index, -1)}><ArrowUp size={16} aria-hidden="true" /></ActionButton>
          <ActionButton variant="link" disabled={blocked || index === photos.length - 1} aria-label={`${index + 1}. fotoğrafı arkaya taşı`} onClick={() => move(index, 1)}><ArrowDown size={16} aria-hidden="true" /></ActionButton>
          <ActionButton variant="link" disabled={blocked} aria-label={`${index + 1}. fotoğrafı kaldır`} onClick={() => change(photos.filter(item => item.id !== photo.id), "Fotoğraf taslaktan kaldırıldı.")}><Trash2 size={16} aria-hidden="true" /></ActionButton>
        </div>
      </li>)}
    </ol>
    <input ref={input} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" aria-label="Ürün fotoğraflarını seç" disabled={blocked || photos.length === MAX_PRODUCT_PHOTOS} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void add(files); }} />
    <ActionButton variant="secondary" disabled={blocked || photos.length === MAX_PRODUCT_PHOTOS} onClick={() => input.current?.click()}><Upload size={16} aria-hidden="true" />Fotoğraf ekle</ActionButton>
    <small>JPEG, PNG, WEBP · 5 MB/fotoğraf. Fotoğraf değişiklikleri Ürünü Kaydet ile uygulanır; Değişiklikleri Geri Al ile iptal edilir.</small>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
