import { useEffect, useRef, useState } from "react";
import type { MarketingAssetView } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { MarketingMediaGallery } from "./MarketingMediaGallery";
import { observeNexaAi } from "../../app/nexa-activity";
import { resultValue } from "./share-draft";

export function MarketingImages({assets, selected, onChange, onReload, aiAvailable, generateFirst, onBusy}: {
  assets: MarketingAssetView[]; selected: string[]; onChange: (ids: string[]) => void; onReload: () => Promise<void>;
  aiAvailable: boolean; generateFirst: boolean; onBusy: (busy: boolean) => void;
}) {
  const [mode, setMode] = useState(generateFirst ? "ai" : "library");
  const [instructions, setInstructions] = useState(""), [aspect, setAspect] = useState<"square" | "landscape" | "portrait">("square"), [style, setStyle] = useState("");
  const [candidate, setCandidate] = useState<MarketingAssetView | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [localAssets, setLocalAssets] = useState(assets);
  const [removal, setRemoval] = useState<MarketingAssetView | null>(null);
  const active = useRef(true), working = useRef(false);
  useEffect(() => {active.current = true; return () => {active.current = false;};}, []);
  useEffect(() => setLocalAssets(assets), [assets]);
  async function run(work: () => Promise<void>) {if(working.current)return; working.current = true; setBusy(true); onBusy(true); setMessage(""); try {await work();} catch(e) {if(active.current) setMessage(e instanceof Error ? e.message : "Görsel işlemi tamamlanamadı.");} finally {working.current = false; if(active.current) {setBusy(false); onBusy(false);}}}
  return <section className="form-stack" aria-label="Paylaşım görselleri">
    <div className="marketing-actions"><ActionButton variant={mode === "library" ? "primary" : "secondary"} disabled={busy} onClick={() => setMode("library")}>Görsel kütüphanesi</ActionButton><ActionButton variant={mode === "ai" ? "primary" : "secondary"} disabled={busy} onClick={() => setMode("ai")}>AI görsel üretimi</ActionButton><ActionButton variant={mode === "manage" ? "primary" : "secondary"} disabled={busy} onClick={() => setMode("manage")}>Kütüphaneyi düzenle</ActionButton></div>
    {mode === "library" ? <>
      <ActionButton variant="secondary" disabled={busy} onClick={() => void run(async () => {const uploaded = resultValue(await window.yardimciDesktop!.uploadMarketingAssets()); if(active.current) setLocalAssets([...localAssets, ...uploaded.filter(a => !localAssets.some(old => old.id === a.id))]); await onReload();})}>Görsel yükle</ActionButton>
      <MarketingMediaGallery assets={localAssets} selected={selected} onChange={onChange} maxImages={20} disabled={busy}/>
      <div className="marketing-image-grid" aria-label="Görsel kütüphanesi">{localAssets.filter(a => !a.archivedAt).map(a => <button type="button" className="marketing-image-tile" key={a.id} aria-label={`${a.altText || (a.source === "ai" ? "AI görseli" : "Yüklenen görsel")} seç`} aria-pressed={selected.includes(a.id)} disabled={busy || (!selected.includes(a.id) && selected.length >= 20)} onClick={() => onChange(selected.includes(a.id) ? selected.filter(id => id !== a.id) : [...selected, a.id])}><img src={a.previewUrl} alt={a.altText || "Kütüphane görseli"}/><span>{selected.includes(a.id) ? "Seçildi" : "Seç"} · {a.width} × {a.height}</span></button>)}</div>
      {!localAssets.some(a => !a.archivedAt) && <p>Henüz görsel yok. Bir görsel yükleyin veya AI ile oluşturun.</p>}
    </> : mode === "manage" ? <section className="form-stack" aria-label="Görsel kütüphanesi yönetimi"><p>Kullanılan görseller silinemez. Yeni seçimlerden gizlemek mevcut yayınları değiştirmez.</p>
      {localAssets.map(a => <article className="marketing-options-row" key={a.id}><div className="marketing-thumbnail"><img src={a.previewUrl} alt={a.altText || "Kütüphane görseli"}/></div><div><strong>{a.altText || (a.source === "ai" ? "AI görseli" : "Yüklenen görsel")}</strong><small>{a.usageCount} kullanım · {a.activePublicationCount} aktif yayın{a.archivedAt ? " · Yeni seçimlerde gizli" : ""}</small></div><div className="marketing-actions">
        <ActionButton variant="secondary" disabled={busy || Boolean(a.archivedAt) || selected.includes(a.id)} onClick={() => void run(async () => {resultValue(await window.yardimciDesktop!.manageMarketingAsset(a.id, "archive")); await onReload(); if(active.current) setMessage("Görsel yeni seçimlerden gizlendi.");})}>Yeni seçimlerde gizle</ActionButton>
        <ActionButton variant="danger" disabled={busy || a.usageCount > 0 || selected.includes(a.id)} onClick={() => setRemoval(a)}>Görseli sil</ActionButton>
      </div></article>)}
      {removal && <ConfirmDialog withinModal tone="danger" title="Görsel kütüphaneden silinsin mi?" description="Bu görsel dosyası kalıcı olarak silinir." confirmLabel="Görseli sil" busy={busy} onCancel={() => setRemoval(null)} onConfirm={() => run(async () => {resultValue(await window.yardimciDesktop!.manageMarketingAsset(removal.id, "delete")); await onReload(); if(active.current) {setRemoval(null); setMessage("Görsel silindi.");}})}/>}
    </section> : <>
      <label className="form-field form-field--fluid">Görsel talimatı<textarea rows={3} value={instructions} maxLength={2000} disabled={busy} placeholder="Görselde neler olmasını istediğinizi anlatın." onChange={e => setInstructions(e.target.value)}/></label>
      <div className="marketing-binding"><label className="form-field form-field--fluid">Görsel oranı<select value={aspect} disabled={busy} onChange={e => setAspect(e.target.value as typeof aspect)}><option value="square">Kare · 1:1</option><option value="landscape">Yatay</option><option value="portrait">Dikey</option></select></label>
        <label className="form-field form-field--fluid">Görsel stili<input value={style} maxLength={500} disabled={busy} placeholder="Örneğin: Doğal ışık, fotoğraf" onChange={e => setStyle(e.target.value)}/></label></div>
      <ActionButton disabled={busy || !aiAvailable || !instructions.trim()} busy={busy} onClick={() => void run(async () => {const generated = resultValue(await observeNexaAi(() => window.yardimciDesktop!.generateMarketingAi({capability: "image_generation", text: "", instructions, aspect, styleHints: style}), "response", () => active.current)); if(active.current) setCandidate(generated.asset || null); await onReload();})}>AI ile görsel oluştur</ActionButton>
      <div className="marketing-image-candidate" aria-label="AI görsel önizlemesi">{candidate ? <img src={candidate.previewUrl} alt="AI ile oluşturulan aday görsel"/> : <p>Oluşturulan görsel burada görünür. Siz seçmeden paylaşıma eklenmez.</p>}</div>
      <ActionButton variant="secondary" disabled={busy || !candidate || selected.includes(candidate.id) || selected.length >= 20} onClick={() => {if(candidate) onChange([...selected, candidate.id]);}}>Görseli paylaşıma ekle</ActionButton>
      <p>{selected.length} görsel seçili. İlk görsel kapaktır.</p>
    </>}
    <p role="status">{message || (!aiAvailable && mode === "ai" ? "AI görsel hizmeti şu anda kullanılamıyor." : "")}</p>
  </section>;
}
