import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
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
import type { ProductWorkspaceIntent, ProductWorkspaceMode } from "../workspace/workspace-intent";
import { ActionButton } from "../ui/ActionButton";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { useWorkspaceCloseGuard, useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { WorkspaceTabList, WorkspaceTabPanel, WorkspaceTabs } from "../workspace/WorkspaceTabs";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { ProductFormFields } from "./ProductFormFields";

type WorkspaceState = "idle" | "loading" | "success" | "error";

export function ProductWorkspace({
  intent,
  products,
  categories,
  inventoryEnabled,
  productDataEnabled,
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
  const [balance, setBalance] = useState<InventoryBalance | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loadedProductId, setLoadedProductId] = useState("");
  const [resourceState, setResourceState] = useState<WorkspaceState>("idle");
  const [saveState, setSaveState] = useState<WorkspaceState>("idle");
  const [saveMessage, setSaveMessage] = useState("Değişiklikler yalnız bu ürün kartına kaydedilir.");
  const beginResourceRequest = useRequestGeneration();
  const beginSaveRequest = useRequestGeneration();
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const closeBlocked = useWorkspaceCloseGuard({
    busy: busy || resourceState === "loading" || saveState === "loading",
    dirty
  });

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
      } catch {
        nextMovements = [];
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
    setLoadedProductId(product.id);
    setResourceState("success");
    setSaveState("idle");
    setSaveMessage("Değişiklikler yalnız bu ürün kartına kaydedilir.");
  }, [beginResourceRequest, bridge, inventoryEnabled, onStateChange, product]);

  useEffect(() => {
    if (!product || loadedProductId === product.id) return;
    void loadProductResources();
  }, [loadProductResources, loadedProductId, product]);

  async function saveProduct() {
    if (!bridge || !product || busy || resourceState === "loading" || saveState === "loading") return;
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
      saved = await bridge.saveProduct(productFormToSaveInput(form));
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
    setSaveMessage("Değişiklikler yalnız bu ürün kartına kaydedilir.");
    onStateChange("success", message);
  }

  const tabs: readonly { id: ProductWorkspaceMode; label: string }[] = inventoryEnabled
    ? [{ id: "details", label: "Bilgiler" }, { id: "stock", label: "Stok" }, { id: "media", label: "Görsel" }]
    : [{ id: "details", label: "Bilgiler" }, { id: "media", label: "Görsel" }];
  const requestedMode = intent.mode ?? "details";
  const mode = tabs.some((tab) => tab.id === requestedMode) ? requestedMode : "details";
  const presentation = navigation.current?.presentation ?? "centered";

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

  return <WorkspaceTabs value={mode}>
    <WorkspaceFrame
      title={product.name}
      context={[product.brand, product.sku || product.barcode].filter(Boolean).join(" · ") || "Katalog ürünü"}
      navigation={<WorkspaceTabList label="Ürün çalışma alanı" tabs={tabs} onChange={(nextMode) => navigation.updateWorkspaceMode({ entityType: "product", mode: nextMode })} />}
      presentation={presentation}
      onPresentationChange={navigation.updateWorkspacePresentation}
      onClose={() => navigation.closeWorkspace()}
      closeBlocked={closeBlocked}
      returnFocusRef={navigation.returnFocusRef}
      dismissOnBackdrop
      footer={<>
        <p className={"form-status sync-" + saveState} role="status">{saveMessage}</p>
        <div className="action-row">
          <ActionButton variant="secondary" type="button" disabled={busy || saveState === "loading" || !dirty} onClick={() => {
            setForm(baseline);
            setSaveState("idle");
            setSaveMessage("Değişiklikler yalnız bu ürün kartına kaydedilir.");
          }}>Değişiklikleri Geri Al</ActionButton>
          <ActionButton type="button" disabled={busy || saveState === "loading" || resourceState !== "success" || !dirty} onClick={() => void saveProduct()}>
            <Save size={16} aria-hidden="true" />{saveState === "loading" ? "Kaydediliyor" : "Ürünü Kaydet"}
          </ActionButton>
        </div>
      </>}
    >
      <WorkspaceTabPanel value="details">
        {resourceState === "error" ? <div className="empty-state"><strong>Ürün kartı güvenli biçimde yüklenemedi.</strong><p>{saveMessage}</p><ActionButton variant="secondary" onClick={() => void loadProductResources()}>Tekrar Dene</ActionButton></div> :
          <ProductFormFields
            form={form}
            categories={categories}
            inventoryEnabled={inventoryEnabled}
            productDataEnabled={productDataEnabled}
            disabled={busy || resourceState !== "success" || saveState === "loading"}
            mode="details"
            localImageDataUrl={localImageDataUrl}
            onChange={setForm}
            onStateChange={onStateChange}
          />}
      </WorkspaceTabPanel>

      {inventoryEnabled && <WorkspaceTabPanel value="stock">
        <div className="form-stack market-product-stock-view">
          {!form.trackInventory ? <p className="empty-state">Bu ürün için stok takibi kapalı.</p> : <>
            <section className="market-stock-card">
              <span>Güncel stok</span>
              <strong>{balance?.quantity ?? "—"} {product.unit}</strong>
              <small>Minimum eşik: {balance?.minimumQuantity ?? form.minimumQuantity}</small>
            </section>
            <section className="market-panel">
              <header className="market-panel-heading"><span>Hareketler</span><h3>Son stok hareketleri</h3><p>Sayım ve stok mutasyonları Stok çalışma alanında yapılır.</p></header>
              <div className="market-history-list">
                {movements.map((movement) => <div className="market-history-row" key={movement.id}>
                  <span><strong>{movement.type}</strong><small>{new Date(movement.createdAt).toLocaleString("tr-TR")} · {movement.note || movement.referenceType || "Stok hareketi"}</small></span>
                  <span>{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta}</span>
                </div>)}
                {movements.length === 0 && <p className="market-muted">Henüz stok hareketi yok.</p>}
              </div>
            </section>
          </>}
        </div>
      </WorkspaceTabPanel>}

      <WorkspaceTabPanel value="media">
        <ProductFormFields
          form={form}
          categories={categories}
          inventoryEnabled={inventoryEnabled}
          productDataEnabled={productDataEnabled}
          disabled={busy || resourceState !== "success" || saveState === "loading"}
          mode="media"
          localImageDataUrl={localImageDataUrl}
          onChange={setForm}
          onStateChange={onStateChange}
        />
      </WorkspaceTabPanel>
    </WorkspaceFrame>
  </WorkspaceTabs>;
}
