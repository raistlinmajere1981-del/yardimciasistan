import { useCallback, useEffect, useState } from "react";
import { History, Save } from "lucide-react";
import type {
  CatalogCategory,
  CatalogProduct,
  InventoryBalance,
  InventoryMovement
} from "@yardimci-asistan/shared";
import {
  emptyProductForm,
  productFormToSaveInput,
  toProductForm,
  validateProductFormPrices,
  type ProductFormState
} from "../../app/product-model";
import type { ProductWorkspaceIntent } from "../workspace/workspace-intent";
import { ActionButton } from "../ui/ActionButton";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { useWorkspaceCloseGuard, useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { ProductFormFields } from "./ProductFormFields";

type WorkspaceState = "idle" | "loading" | "success" | "error";

export function ProductWorkspace({
  intent,
  products,
  categories,
  inventoryEnabled,
  productDataEnabled,
  wholesaleEnabled = false,
  onlineSalesEnabled = false,
  busy,
  onReload,
  onProductSaved,
  onStateChange
}: {
  intent: ProductWorkspaceIntent;
  products: CatalogProduct[];
  categories: CatalogCategory[];
  inventoryEnabled: boolean;
  productDataEnabled: boolean;
  wholesaleEnabled?: boolean;
  onlineSalesEnabled?: boolean;
  busy: boolean;
  onReload: () => Promise<void>;
  onProductSaved: (product: CatalogProduct) => void;
  onStateChange: (state: "loading" | "success" | "error", message: string) => void;
}) {
  const navigation = useWorkspaceNavigation();
  const bridge = window.yardimciDesktop?.commerce;
  const product = products.find((item) => item.id === intent.entityId) ?? null;
  const [form, setForm] = useState<ProductFormState>(() => emptyProductForm(inventoryEnabled));
  const [baseline, setBaseline] = useState<ProductFormState>(() => emptyProductForm(inventoryEnabled));
  const [localImageDataUrl, setLocalImageDataUrl] = useState("");
  const [imageDraftMode, setImageDraftMode] = useState<"keep" | "manual" | "clear" | "external">("keep");
  const [manualImageDataUrl, setManualImageDataUrl] = useState("");
  const [balance, setBalance] = useState<InventoryBalance | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loadedProductId, setLoadedProductId] = useState("");
  const [resourceState, setResourceState] = useState<WorkspaceState>("idle");
  const [saveState, setSaveState] = useState<WorkspaceState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [countedQuantity, setCountedQuantity] = useState("");
  const [countNote, setCountNote] = useState("");
  const [stockBusy, setStockBusy] = useState(false);
  const [stockMessage, setStockMessage] = useState("");
  const [historyError, setHistoryError] = useState("");
  const beginStockRequest = useRequestGeneration();
  const [isPublished, setIsPublished] = useState(false);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const [publicationLoaded, setPublicationLoaded] = useState(false);
  const [publicationMessage, setPublicationMessage] = useState("");
  const beginPublicationRequest = useRequestGeneration();
  const beginResourceRequest = useRequestGeneration();
  const beginSaveRequest = useRequestGeneration();
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline) || imageDraftMode !== "keep";
  const effectiveImageDataUrl = imageDraftMode === "manual"
    ? manualImageDataUrl
    : imageDraftMode === "keep"
      ? localImageDataUrl
      : "";
  const closeBlocked = useWorkspaceCloseGuard({
    busy: busy || publicationBusy || stockBusy || resourceState === "loading" || saveState === "loading",
    dirty
  });

  useEffect(() => {
    const isCurrent = beginPublicationRequest();
    setPublicationLoaded(false);
    setIsPublished(false);
    setPublicationMessage("");
    if (!onlineSalesEnabled || !product || !bridge) {
      setPublicationBusy(false);
      return;
    }
    setPublicationBusy(true);
    void bridge.getProductPublication(product.id).then((publication) => {
      if (!isCurrent()) return;
      setIsPublished(publication?.isPublished ?? false);
      setPublicationLoaded(true);
    }).catch(() => {
      if (isCurrent()) setPublicationMessage("Web yayın tercihi okunamadı. Ürün kartını yeniden açıp deneyin.");
    }).finally(() => { if (isCurrent()) setPublicationBusy(false); });
  }, [beginPublicationRequest, bridge, onlineSalesEnabled, product?.id]);

  async function savePublication(published: boolean) {
    if (!bridge || !product || !onlineSalesEnabled || publicationBusy || !publicationLoaded) return;
    const isCurrent = beginPublicationRequest();
    setPublicationBusy(true);
    setPublicationMessage("");
    try {
      const saved = await bridge.saveProductPublication({ productId: product.id, isPublished: published });
      if (!isCurrent()) return;
      setIsPublished(saved.isPublished);
      setPublicationMessage("Web yayın tercihi kaydedildi.");
    } catch {
      if (isCurrent()) setPublicationMessage("Web yayın tercihi kaydedilemedi. Tekrar deneyin.");
    } finally { if (isCurrent()) setPublicationBusy(false); }
  }

  const loadProductResources = useCallback(async () => {
    if (!product || !bridge) return;
    const isCurrent = beginResourceRequest();
    setResourceState("loading");
    let nextBalance: InventoryBalance | null = null;
    let nextMovements: InventoryMovement[] = [];
    let minimumQuantity = 0;

    if (inventoryEnabled && product.trackInventory) {
      try {
        nextBalance = await bridge.getInventoryBalance(product.id);
        minimumQuantity = nextBalance.minimumQuantity;
      } catch (error) {
        if (!isCurrent()) return;
        const message = error instanceof Error
          ? error.message
          : "Ürünün mevcut minimum stok eşiği okunamadı; kaydetmeden önce Stok ekranını kontrol edin.";
        setResourceState("error");
        setSaveMessage(message);
        onStateChange("error", message);
        return;
      }
      try {
        nextMovements = await bridge.listInventoryMovements({ productId: product.id, limit: 20 });
        if (isCurrent()) setHistoryError("");
      } catch {
        nextMovements = [];
        if (isCurrent()) setHistoryError("Stok hareketleri okunamadı.");
      }
    }

    let nextImage = "";
    if (product.imageAssetPath) {
      try {
        nextImage = await bridge.getProductImageDataUrl(product.id);
      } catch {
        nextImage = "";
      }
    }

    if (!isCurrent()) return;
    const nextForm = toProductForm(product, minimumQuantity, inventoryEnabled);
    setForm(nextForm);
    setBaseline(nextForm);
    setBalance(nextBalance);
    setMovements(nextMovements);
    setLocalImageDataUrl(nextImage);
    setImageDraftMode("keep");
    setManualImageDataUrl("");
    setLoadedProductId(product.id);
    setResourceState("success");
    setSaveState("idle");
    setSaveMessage("");
    setCountedQuantity("");
    setCountNote("");
    setStockMessage("");
  }, [beginResourceRequest, bridge, inventoryEnabled, onStateChange, product]);

  useEffect(() => {
    if (!product || loadedProductId === product.id) return;
    void loadProductResources();
  }, [loadProductResources, loadedProductId, product]);

  async function saveProduct() {
    if (!bridge || !product || busy || publicationBusy || stockBusy || resourceState === "loading" || saveState === "loading") return;
    const priceError = validateProductFormPrices(form);
    if (priceError) {
      setSaveState("error");
      setSaveMessage(priceError);
      return;
    }
    const isCurrent = beginSaveRequest();
    setSaveState("loading");
    setSaveMessage("");
    let saved: CatalogProduct;
    try {
      saved = await bridge.saveProduct({
        ...productFormToSaveInput(form),
        ...(imageDraftMode === "manual" && manualImageDataUrl ? { manualImageDataUrl } : {}),
        ...(imageDraftMode === "clear" ? { clearImage: true } : {})
      });
      if (!isCurrent()) return;
    } catch (error) {
      if (!isCurrent()) return;
      const message = error instanceof Error ? error.message : "Ürün kaydedilemedi.";
      setSaveState("error");
      setSaveMessage("");
      onStateChange("error", message);
      return;
    }

    let nextImage = "";
    if (saved.imageAssetPath) {
      try {
        nextImage = await bridge.getProductImageDataUrl(saved.id);
      } catch {
        nextImage = "";
      }
    }

    if (!isCurrent()) return;
    onProductSaved(saved);
    let catalogReloadFailed = false;
    try {
      await onReload();
    } catch {
      catalogReloadFailed = true;
    }
    if (!isCurrent()) return;

    const nextForm = toProductForm(saved, form.minimumQuantity, inventoryEnabled);
    setForm(nextForm);
    setBaseline(nextForm);
    setLocalImageDataUrl(nextImage);
    setImageDraftMode("keep");
    setManualImageDataUrl("");

    if (inventoryEnabled && saved.trackInventory) {
      try {
        const [nextBalance, nextMovements] = await Promise.all([
          bridge.getInventoryBalance(saved.id),
          bridge.listInventoryMovements({ productId: saved.id, limit: 20 })
        ]);
        if (isCurrent()) {
          setBalance(nextBalance);
          setMovements(nextMovements);
        }
      } catch {
        if (isCurrent()) {
          setBalance(null);
          setMovements([]);
        }
      }
    } else {
      setBalance(null);
      setMovements([]);
    }

    if (!isCurrent()) return;
    const message = `${saved.name} kaydedildi.${saved.imageAssetPath ? " Ürün görseli yerel arşive eklendi." : ""}${catalogReloadFailed ? " Katalog görünümü yenilenemedi." : ""}`;
    setSaveState("success");
    setSaveMessage("");
    onStateChange("success", message);
  }

  const history = inventoryEnabled && intent.mode === "history";
  const presentation = navigation.current?.presentation ?? "centered";

  async function refreshStockHistory() {
    if (!bridge || !product || stockBusy) return;
    const isCurrent = beginStockRequest();
    setStockBusy(true);
    try {
      const next = await bridge.listInventoryMovements({ productId: product.id, limit: 100 });
      if (isCurrent()) { setMovements(next); setHistoryError(""); }
    } catch (error) { if (isCurrent()) setHistoryError(error instanceof Error ? error.message : "Stok hareketleri okunamadı."); }
    finally { if (isCurrent()) setStockBusy(false); }
  }

  async function updateStock() {
    if (!bridge || !product || !balance || dirty || busy || stockBusy || saveState === "loading") return;
    const quantity = Number(countedQuantity.trim().replace(",", "."));
    if (!countedQuantity.trim() || !Number.isFinite(quantity) || quantity < 0) { setStockMessage("Geçerli, negatif olmayan bir stok miktarı girin."); return; }
    const isCurrent = beginStockRequest();
    setStockBusy(true); setStockMessage("");
    try {
      const result = await bridge.setInventoryCount({ productId: product.id, locationId: balance.locationId,
        countedQuantity: quantity, expectedUpdatedAt: balance.updatedAt, note: countNote,
        referenceType: "product_workspace_count", referenceId: product.id, actorSource: "desktop-product-workspace" });
      if (!isCurrent()) return;
      setBalance(result.balance);
      if (result.movement) setMovements(current => [result.movement!, ...current]);
      setCountedQuantity(""); setCountNote("");
      setStockMessage(result.movement ? "Stok güncellendi." : "Stok miktarı değişmedi.");
      try { await onReload(); } catch { if (isCurrent()) setStockMessage("Stok güncellendi ancak katalog görünümü yenilenemedi."); }
    } catch (error) {
      if (!isCurrent()) return;
      setStockMessage(error instanceof Error ? error.message : "Stok güncellenemedi.");
      // Keep the user's count draft, but show the current balance before an explicit retry.
      try { const current = await bridge.getInventoryBalance(product.id); if (isCurrent()) setBalance(current); } catch { /* Preserve the original operation error. */ }
    }
    finally { if (isCurrent()) setStockBusy(false); }
  }

  if (!product) {
    return <WorkspaceFrame
      title="Ürün bulunamadı"
      context="Katalog yenilenmiş veya ürün artık kullanılamıyor olabilir."
      presentation={presentation}
      onPresentationChange={navigation.updateWorkspacePresentation}
      onClose={() => navigation.closeWorkspace()}
      closeBlocked={closeBlocked}
      returnFocusRef={navigation.returnFocusRef}
      dismissOnBackdrop
    >
      <div className="empty-state">
        <strong>Ürün kaydı bulunamadı.</strong>
        <p>Kataloğu yenileyip tekrar deneyin.</p>
        <ActionButton variant="secondary" onClick={() => void onReload()}>Kataloğu Yenile</ActionButton>
      </div>
    </WorkspaceFrame>;
  }

  return <WorkspaceFrame
      title={product.name}
      context={[product.brand, product.sku || product.barcode].filter(Boolean).join(" · ") || "Katalog ürünü"}
      actions={inventoryEnabled && <ActionButton variant="secondary" disabled={dirty || stockBusy || saveState === "loading" || resourceState !== "success"} onClick={() => {
        navigation.updateWorkspaceMode({ entityType: "product", mode: history ? "details" : "history" });
        if (!history) void refreshStockHistory();
      }}><History size={16} aria-hidden="true" />{history ? "← Ürüne dön" : "Stok Hareketleri"}</ActionButton>}
      presentation={presentation}
      onPresentationChange={navigation.updateWorkspacePresentation}
      onClose={() => navigation.closeWorkspace()}
      closeBlocked={closeBlocked}
      returnFocusRef={navigation.returnFocusRef}
      dismissOnBackdrop
      footer={!history && <>
        <p className={"form-status sync-" + saveState} role="status">{saveMessage}</p>
        <div className="action-row">
          <ActionButton variant="secondary" type="button" disabled={busy || publicationBusy || stockBusy || saveState === "loading" || !dirty} onClick={() => {
            setForm(baseline);
            setImageDraftMode("keep");
            setManualImageDataUrl("");
            setSaveState("idle");
            setSaveMessage("");
          }}>Değişiklikleri Geri Al</ActionButton>
          <ActionButton type="button" disabled={busy || publicationBusy || stockBusy || saveState === "loading" || resourceState !== "success" || !dirty} onClick={() => void saveProduct()}>
            <Save size={16} aria-hidden="true" />{saveState === "loading" ? "Kaydediliyor" : "Ürünü Kaydet"}
          </ActionButton>
        </div>
      </>}
    >
      {!history ? <div className="form-stack">
        {inventoryEnabled && product.trackInventory && <section className="market-product-stock-update" aria-label="Stok güncelleme">
          <strong>Mevcut stok: {balance?.quantity ?? "—"} {product.unit}</strong>
          <label className="market-field">Yeni stok miktarı<input inputMode="decimal" aria-label="Yeni stok miktarı" value={countedQuantity} onChange={event => setCountedQuantity(event.target.value)} disabled={dirty || stockBusy || !balance} /></label>
          <label className="market-field">Stok açıklaması<input value={countNote} onChange={event => setCountNote(event.target.value)} disabled={dirty || stockBusy || !balance} /></label>
          <ActionButton variant="secondary" disabled={dirty || stockBusy || !balance || !countedQuantity.trim()} onClick={() => void updateStock()}>Stok Güncelle / Düzelt</ActionButton>
          {dirty && <small>Stok güncellemeden önce ürün değişikliklerini kaydedin veya geri alın.</small>}
          {stockMessage && <p role="status">{stockMessage}</p>}
        </section>}
        {resourceState === "error" ? <div className="empty-state"><strong>Ürün kartı güvenli biçimde yüklenemedi.</strong><p>{saveMessage}</p><ActionButton variant="secondary" onClick={() => void loadProductResources()}>Tekrar Dene</ActionButton></div> :
          <ProductFormFields
            form={form}
            categories={categories}
            inventoryEnabled={inventoryEnabled}
            productDataEnabled={productDataEnabled}
            wholesaleEnabled={wholesaleEnabled}
            disabled={busy || stockBusy || resourceState !== "success" || saveState === "loading"}
            mode="all"
            statusFields={onlineSalesEnabled ? <>
              <label className="market-check"><input type="checkbox" checked={isPublished} disabled={busy || publicationBusy || !publicationLoaded || saveState === "loading" || stockBusy} onChange={event => void savePublication(event.target.checked)} /> Web satışında yayınla</label>
              {publicationMessage && <p role="status">{publicationMessage}</p>}
            </> : null}
            localImageDataUrl={effectiveImageDataUrl}
            onManualImageSelected={(dataUrl) => {
              setManualImageDataUrl(dataUrl);
              setImageDraftMode("manual");
            }}
            onImageClear={() => {
              setManualImageDataUrl("");
              setImageDraftMode("clear");
            }}
            onExternalImageSelected={() => {
              setManualImageDataUrl("");
              setImageDraftMode("external");
            }}
            onChange={setForm}
            onStateChange={onStateChange}
          />}
      </div> : <section className="form-stack" aria-label="Stok hareketleri">
              <header className="market-panel-heading market-panel-heading-row"><h3>Son stok hareketleri</h3><ActionButton variant="secondary" disabled={stockBusy} onClick={() => void refreshStockHistory()}>Yenile</ActionButton></header>
              {historyError && <p role="alert">{historyError}</p>}
              <div className="market-history-list">
                {movements.map((movement) => <div className="market-history-row" key={movement.id}>
                  <span><strong>{movement.type}</strong><small>{new Date(movement.createdAt).toLocaleString("tr-TR")} · {movement.note || movement.referenceType || "Stok hareketi"}</small></span>
                  <span>{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta}</span>
                </div>)}
                 {movements.length === 0 && !historyError && <p className="market-muted">Henüz stok hareketi yok.</p>}
              </div>
      </section>}
    </WorkspaceFrame>;
}
