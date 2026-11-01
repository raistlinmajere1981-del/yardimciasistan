import { useEffect, useRef, useState } from "react";
import type { DocumentKind } from "@yardimci-asistan/shared";
import type { FormImagePixels, FormImagePoint, FormImageTransform } from "../../app/form-image-perspective";
import { ActionButton } from "../ui/ActionButton";

const cornerNames = ["Sol üst", "Sağ üst", "Sağ alt", "Sol alt"];
const pngPrefix = "data:image/png;base64,";
const maxBytes = 12 * 1024 * 1024;
/** Decode only the bounded local PNG projection, and downscale before allocating RGBA. */
async function decodeOriginal(src: string): Promise<FormImagePixels> {
  if (!src.startsWith(pngPrefix) || src.length > pngPrefix.length + Math.ceil(maxBytes / 3) * 4) throw Error("Görsel okunamadı. Boş formu yeniden seçin.");
  const image = new Image(); image.src = src;
  try { await image.decode(); } catch { throw Error("Görsel açılamadı. Boş formu yeniden seçin."); }
  if (image.naturalWidth < 2 || image.naturalHeight < 2 || image.naturalWidth * image.naturalHeight > 25_000_000) throw Error("Görsel boyutu uygun değil. En az 2 × 2 piksel bir form seçin.");
  const scale = Math.min(1, 2200 / image.naturalWidth, 2200 / image.naturalHeight, Math.sqrt(4_000_000 / (image.naturalWidth * image.naturalHeight)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(image.naturalWidth * scale); canvas.height = Math.floor(image.naturalHeight * scale);
  if (canvas.width < 2 || canvas.height < 2) throw Error("Görsel çok ince. Formun tamamını içeren bir fotoğraf seçin.");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw Error("Görsel alanı açılamadı. Yeniden deneyin.");
  try {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } catch { throw Error("Görsel okunamadı. Boş formu yeniden seçip deneyin."); }
}
async function encodePng(pixels: FormImagePixels): Promise<string> {
  const canvas = document.createElement("canvas"); canvas.width = pixels.width; canvas.height = pixels.height;
  const context = canvas.getContext("2d");
  if (!context) throw Error("Görsel oluşturulamadı. Yeniden deneyin.");
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error("PNG oluşturulamadı. Yeniden deneyin.")), "image/png"));
  if (blob.size > maxBytes) throw Error("Hazırlanan görsel 12 MB sınırını aştı. Daha küçük bir görsel seçin.");
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = () => reject(Error("PNG okunamadı. Yeniden deneyin."));
    reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob);
  });
}
export function FormImagePreparation({ documentKind, originalRef, pageWidth, pageHeight, enabled, onApply, onBack }: {
  documentKind: DocumentKind; originalRef: string; pageWidth: number; pageHeight: number; enabled: boolean;
  onApply(produce: () => Promise<string>): Promise<boolean>; onBack(): void;
}) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [selected, setSelected] = useState(0);
  const [spec, setSpec] = useState<FormImageTransform>({ pageWidth, pageHeight, corners: [{ x: .02, y: .02 }, { x: .98, y: .02 }, { x: .98, y: .98 }, { x: .02, y: .98 }], rotation: 0, brightness: 0, contrast: 1, grayscale: false });
  const imageArea = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; pointer: number } | null>(null);
  const running = useRef(false);
  const cancelWorker = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void window.yardimciDesktop!.readFormImage({ documentKind, imageRef: originalRef }).then(result => {
      if (cancelled) return;
      if (result.ok && result.value.dataUrl.startsWith(pngPrefix)) setSrc(result.value.dataUrl);
      else setError("Asıl görsel okunamadı. Boş formu yeniden seçin.");
    }).catch(() => { if (!cancelled) setError("Asıl görsel okunamadı. Boş formu yeniden seçin."); });
    return () => { cancelled = true; mounted.current = false; cancelWorker.current?.(); }; // In-flight apply settles; its hook rejects stale authority.
  }, [documentKind, originalRef]);
  const change = (patch: Partial<Omit<FormImageTransform, "threshold">> & { threshold?: number | undefined }) => {
    setPreview("");
    setSpec(previous => {
      const { threshold: previousThreshold, ...rest } = previous;
      const { threshold: nextThreshold, ...updates } = patch;
      const threshold = "threshold" in patch ? nextThreshold : previousThreshold;
      return { ...rest, ...updates, ...(threshold === undefined ? {} : { threshold }) };
    });
  };
  const corner = (index: number, patch: Partial<FormImagePoint>) => {
    setPreview("");
    setSpec(previous => {
      const corners: [FormImagePoint, FormImagePoint, FormImagePoint, FormImagePoint] = [...previous.corners];
      corners[index] = { ...corners[index]!, ...patch };
      return { ...previous, corners };
    });
  };
  const process = async () => {
    const source = await decodeOriginal(src);
    if (!mounted.current) throw Error("Hazırlama durduruldu. Yeniden deneyin.");
    const result = await new Promise<FormImagePixels>((resolve, reject) => {
      const task = new Worker(new URL("../../app/form-image-preparation.worker.ts", import.meta.url), { type: "module" });
      const timer = setTimeout(() => { finish(); reject(Error("Hazırlama zaman aşımına uğradı. Yeniden deneyin.")); }, 30_000);
      const finish = () => { clearTimeout(timer); task.terminate(); cancelWorker.current = null; };
      cancelWorker.current = () => { finish(); reject(Error("Hazırlama durduruldu. Yeniden deneyin.")); };
      task.onmessage = (event: MessageEvent<{ result?: FormImagePixels; error?: string }>) => { finish(); if (event.data.result) resolve(event.data.result); else reject(Error(event.data.error)); };
      task.onerror = () => { finish(); reject(Error("Görsel işlenemedi. Yeniden deneyin.")); };
      try { task.postMessage({ source, spec }, [source.data.buffer]); } catch { finish(); reject(Error("Görsel işlenemedi. Yeniden deneyin.")); }
    });
    if (!mounted.current) throw Error("Hazırlama durduruldu. Yeniden deneyin.");
    return encodePng(result);
  };
  const run = async (apply: boolean) => {
    if (!enabled || running.current || !src) return;
    running.current = true; setBusy(true); setError("");
    try {
      if (apply) { if (await onApply(process) && mounted.current) onBack(); }
      else { const output = await process(); if (mounted.current) setPreview(output); }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Görsel işlenemedi. Yeniden deneyin."); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  };
  const disabled = !enabled || busy;
  return <div className="print-management__preparation" id="print-document-preview" aria-label="Görsel hazırlama" aria-busy={busy}>
    <div className="print-management__inspector">
      <label>Köşe seç<select aria-label="Köşe seç" value={selected} disabled={disabled} onChange={event => setSelected(Number(event.target.value))}>{cornerNames.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label>
      {(["x", "y"] as const).map(axis => <label key={axis}>Köşe {axis.toUpperCase()} (%)<input aria-label={`Köşe ${axis.toUpperCase()} (%)`} type="number" min="0" max="100" step="0.1" disabled={disabled} value={Number((spec.corners[selected]![axis] * 100).toFixed(2))} onChange={event => { if (event.target.value !== "" && Number.isFinite(event.target.valueAsNumber)) corner(selected, { [axis]: Math.max(0, Math.min(1, event.target.valueAsNumber / 100)) }); }} /></label>)}
      <ActionButton variant="secondary" disabled={disabled} onClick={() => change({ rotation: ((spec.rotation! + 90) % 360) as 0 | 90 | 180 | 270 })}>90° döndür · {spec.rotation}°</ActionButton>
      <label>Parlaklık<input aria-label="Parlaklık" type="range" min="-1" max="1" step="0.05" value={spec.brightness} disabled={disabled} onChange={event => change({ brightness: event.target.valueAsNumber })} /></label>
      <label>Kontrast<input aria-label="Kontrast" type="range" min="0" max="3" step="0.05" value={spec.contrast} disabled={disabled} onChange={event => change({ contrast: event.target.valueAsNumber })} /></label>
      <label><input type="checkbox" checked={spec.grayscale} disabled={disabled} onChange={event => change({ grayscale: event.target.checked })} />Gri ton</label>
      <label><input type="checkbox" checked={spec.threshold !== undefined} disabled={disabled} onChange={event => change({ threshold: event.target.checked ? 128 : undefined })} />Siyah/Beyaz</label>
      {spec.threshold !== undefined && <label>Eşik<input aria-label="Eşik" type="range" min="0" max="255" value={spec.threshold} disabled={disabled} onChange={event => change({ threshold: event.target.valueAsNumber })} /></label>}
    </div>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Görsel hazırlanıyor…</p>}
    <div className="print-management__canvas">
      {src && <div ref={imageArea} className="print-management__corners"
        onPointerDown={event => {
          if (event.target !== event.currentTarget || disabled || event.button !== 0) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          corner(selected, { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) });
        }} onPointerMove={event => {
          const current = drag.current; const bounds = imageArea.current?.getBoundingClientRect();
          if (!current || current.pointer !== event.pointerId || disabled || !bounds?.width || !bounds.height) return;
          corner(current.index, { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) });
        }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
        <img src={src} alt="Hazırlanacak asıl form" draggable={false} onError={() => setError("Görsel açılamadı. Boş formu yeniden seçin.")} />
        <svg className="print-management__quad" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={spec.corners.map(point => `${point.x * 100},${point.y * 100}`).join(" ")} /></svg>
        {spec.corners.map((point, index) => <ActionButton key={index} variant="secondary" className="print-management__corner" aria-label={`${cornerNames[index]} köşesi`} aria-pressed={selected === index} disabled={disabled} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          onFocus={() => setSelected(index)} onClick={() => setSelected(index)} onKeyDown={event => {
            const deltas: Record<string, [number, number]> = { ArrowLeft: [-.005, 0], ArrowRight: [.005, 0], ArrowUp: [0, -.005], ArrowDown: [0, .005] };
            const delta = deltas[event.key]; if (!delta) return; event.preventDefault();
            corner(index, { x: Math.max(0, Math.min(1, point.x + delta[0])), y: Math.max(0, Math.min(1, point.y + delta[1])) });
          }} onPointerDown={event => { if (disabled || event.button !== 0) return; event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); setSelected(index); drag.current = { index, pointer: event.pointerId }; imageArea.current!.setPointerCapture(event.pointerId); }}>{index + 1}</ActionButton>)}
      </div>}
      {preview && <img className="print-management__prepared-preview" src={preview} alt="Hazırlanan form önizlemesi" />}
    </div>
    <div className="print-management__move">
      <ActionButton variant="secondary" disabled={disabled || !src} onClick={() => void run(false)}>Önizle</ActionButton>
      <ActionButton disabled={disabled || !src} onClick={() => void run(true)}>Uygula</ActionButton>
      <ActionButton variant="secondary" disabled={busy} onClick={onBack}>Yerleşime dön</ActionButton>
    </div>
  </div>;
}
