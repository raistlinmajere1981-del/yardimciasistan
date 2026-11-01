import { useCallback, useEffect, useRef, useState } from "react";
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
import { DetailSectionCard, DetailWorkspaceLayout } from "../workspace/DetailWorkspaceLayout";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { useWorkspaceCloseGuard, useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { ProductFormFields } from "./ProductFormFields";
import { ProductPhotoGallery } from "./ProductPhotoGallery";
import type { ProductPhotoCollection } from "@yardimci-asistan/shared";
import type { DesktopDashboardData, DesktopMenuSaveResult, DesktopStatusUpdateResult } from "../../../electron/database";
import { MenuProductEntryFields } from "../menu/MenuProductEntryFields";
import { toItemForm, type ItemFormState } from "../menu/menu-model";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useWebAvailability } from "../../app/web-availability";

type WorkspaceState = "idle" | "loading" | "success" | "error";

export function ProductWorkspace({
  intent,
  products,
  categories,
  inventoryEnabled,
  productDataEnabled,
  wholesaleEnabled = false,
  onlineSalesEnabled: onlineSalesCapability = false,
  retailFieldsEnabled = true,
  purchasingEnabled = true,
  menuData,
  qrMenuEnabled: qrMenuCapability = false,
  onSaveMenuEntry,
  onRemoveMenuEntry,
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
  retailFieldsEnabled?: boolean;
  purchasingEnabled?: boolean;
  menuData?: DesktopDashboardData;
  qrMenuEnabled?: boolean;
  onSaveMenuEntry?: (form: ItemFormState) => Promise<DesktopMenuSaveResult | undefined>;
  onRemoveMenuEntry?: (entryId: string) => Promise<DesktopStatusUpdateResult | undefined>;
  busy: boolean;
  onReload: () => Promise<void>;
  onProductSaved: (product: CatalogProduct) => void;
  onStateChange: (state: "loading" | "success" | "error", message: string) => void;
}) {
  const webAvailable = useWebAvailability();
  const onlineSalesEnabled = webAvailable && onlineSalesCapability;
  const qrMenuEnabled = webAvailable && qrMenuCapability;
  const navigation = useWorkspaceNavigation();
  const bridge = window.yardimciDesktop?.commerce;
  const [productReadAttempt, setProductReadAttempt] = useState(0);
  const [savedProduct, setSavedProduct] = useState<CatalogProduct | null>(null);
  const product = savedProduct ?? products.find((item) => item.id === intent.entityId) ?? null;
  const creating = intent.mode === "create" && !product;
  const productId = product?.id ?? "";
  const [form, setForm] = useState<ProductFormState>(() => emptyProductForm(inventoryEnabled));
  const [baseline, setBaseline] = useState<ProductFormState>(() => emptyProductForm(inventoryEnabled));
  const [localImageDataUrl, setLocalImageDataUrl] = useState("");
  const [imageDraftMode, setImageDraftMode] = useState<"keep" | "manual" | "clear" | "external">("keep");
  const [manualImageDataUrl, setManualImageDataUrl] = useState("");
  const [balance, setBalance] = useState<InventoryBalance | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loadedProductId, setLoadedProductId] = useState("");
  const [resourceState, setResourceState] = useState<WorkspaceState>(intent.mode === "create" ? "success" : "idle");
  const [saveState, setSaveState] = useState<WorkspaceState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [pendingSavedId, setPendingSavedId] = useState("");
  const [countedQuantity, setCountedQuantity] = useState("");
  const [countNote, setCountNote] = useState("");
  const [fieldsBusy, setFieldsBusy] = useState(false);
  const [photosBusy, setPhotosBusy] = useState(false);
  const [stockBusy, setStockBusy] = useState(false);
  const stockLock = useRef(false);
  const saveLock = useRef(false);
  const [stockOperation, setStockOperation] = useState<"add" | "remove" | "count">("add");
  const [stockConfirm, setStockConfirm] = useState(false);
  const [stockMessage, setStockMessage] = useState("");
  const [historyError, setHistoryError] = useState("");
  const beginStockRequest = useRequestGeneration();
  const [isPublished, setIsPublished] = useState(onlineSalesEnabled);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const [publicationLoaded, setPublicationLoaded] = useState(false);
  const [publicationMessage, setPublicationMessage] = useState("");
  const beginPublicationRequest = useRequestGeneration();
  const beginResourceRequest = useRequestGeneration();
  const beginPhotoChangeRequest = useRequestGeneration();
  const beginSaveRequest = useRequestGeneration();
  const beginMenuRequest = useRequestGeneration();
  const menuEntry = menuData?.menu.items.find(item => item.product_id === intent.entityId && (!intent.menuEntryId || item.id === intent.menuEntryId));
  const [menuForm, setMenuForm] = useState(() => toItemForm(menuEntry, menuData?.menu.categories[0]?.id ?? ""));
  const [menuBaseline, setMenuBaseline] = useState(menuForm);
  const [menuBusy, setMenuBusy] = useState(false);
  const [menuMessage, setMenuMessage] = useState("");
  const [removeMenuConfirm, setRemoveMenuConfirm] = useState(false);
  const menuDirty = JSON.stringify(menuForm) !== JSON.stringify(menuBaseline);
  const [createPublished, setCreatePublished] = useState(onlineSalesEnabled);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline) || imageDraftMode !== "keep" || (creating && onlineSalesEnabled && createPublished !== onlineSalesEnabled);
  const showPhotoGallery = onlineSalesCapability && Boolean(productId) && imageDraftMode === "keep" && resourceState === "success";
  const stockDraftDirty = Boolean(countedQuantity.trim() || countNote.trim() || stockConfirm);
  const mutationBusy = busy || fieldsBusy || photosBusy || menuBusy || publicationBusy || stockBusy || saveState === "loading";
  const effectiveImageDataUrl = imageDraftMode === "manual"
    ? manualImageDataUrl
    : imageDraftMode === "keep"
      ? localImageDataUrl
      : "";
  const closeBlocked = useWorkspaceCloseGuard({
    busy: mutationBusy || resourceState === "loading",
    dirty: dirty || menuDirty || stockDraftDirty
  });
  useEffect(() => {
    if (!pendingSavedId || closeBlocked) return;
    navigation.closeWorkspace(
      { entityType: "product", entityId: intent.entityId },
      intent.mode === "create" ? { createdEntityId: pendingSavedId } : undefined
    );
  }, [closeBlocked, intent.entityId, intent.mode, navigation, pendingSavedId]);
  useEffect(() => { beginPhotoChangeRequest(); }, [beginPhotoChangeRequest, productId]);
  const photosChanged = useCallback(async (collection: ProductPhotoCollection) => {
    const isCurrent = beginPhotoChangeRequest();
    // Only image provenance changes. Keep all unsaved product metadata and its baseline.
    setForm(current => ({ ...current, imageSourceUrl: collection.sourceUrl, imageLicense: collection.sourceLicense }));
    setBaseline(current => ({ ...current, imageSourceUrl: collection.sourceUrl, imageLicense: collection.sourceLicense }));
    const preview = await bridge!.getProductImageDataUrl(collection.productId);
    if (!isCurrent()) return;
    setLocalImageDataUrl(preview);
    await onReload();
  }, [beginPhotoChangeRequest, bridge, onReload]);
  useEffect(() => {
    if (menuDirty || menuBusy) return;
    const next = toItemForm(menuEntry, menuData?.menu.categories[0]?.id ?? "");
    setMenuForm(next); setMenuBaseline(next);
  }, [menuEntry, menuData?.menu.categories, menuDirty, menuBusy]);

  useEffect(() => {
    const isCurrent = beginPublicationRequest();
    setPublicationLoaded(false);
    setIsPublished(false);
    setPublicationMessage("");
    if (!onlineSalesEnabled || !productId || !bridge) {
      setPublicationBusy(false);
      return;
    }
    setPublicationBusy(true);
    void bridge.getProductPublication(productId).then((publication) => {
      if (!isCurrent()) return;
      setIsPublished(publication?.isPublished ?? false);
      setPublicationLoaded(true);
    }).catch(() => {
      if (isCurrent()) setPublicationMessage("Web yayın tercihi okunamadı. Ürün kartını yeniden açıp deneyin.");
    }).finally(() => { if (isCurrent()) setPublicationBusy(false); });
  }, [beginPublicationRequest, bridge, onlineSalesEnabled, productId]);

  async function savePublication(published: boolean) {
    if (!bridge || !product || !onlineSalesEnabled || mutationBusy || !publicationLoaded) return;
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

  async function saveMenuPresentation() {
    if (!menuEntry || !onSaveMenuEntry || mutationBusy) return;
    const isCurrent = beginMenuRequest();
    setMenuBusy(true); setMenuMessage("");
    try {
      const result = await onSaveMenuEntry(menuForm);
      if (!isCurrent()) return;
      if (!result?.ok) { setMenuMessage(result?.message ?? "Menü sunumu kaydedilemedi."); return; }
      const next = toItemForm(result.dashboardData.menu.items.find(item => item.id === result.savedId), menuForm.category_id);
      setMenuForm(next); setMenuBaseline(next); setMenuMessage(result.message);
    } catch { if (isCurrent()) setMenuMessage("Menü sunumu kaydedilemedi."); }
    finally { if (isCurrent()) setMenuBusy(false); }
  }

  async function removeMenuEntry() {
    if (!menuEntry || !onRemoveMenuEntry || mutationBusy) return;
    const isCurrent = beginMenuRequest();
    setMenuBusy(true);
    try {
      const result = await onRemoveMenuEntry(menuEntry.id);
      if (!isCurrent()) return;
      setMenuMessage(result?.message ?? "Menü ilişkisi kaldırılamadı.");
      if (result?.ok) { setRemoveMenuConfirm(false); setMenuBaseline(menuForm); }
    } catch { if (isCurrent()) setMenuMessage("Menü ilişkisi kaldırılamadı."); }
    finally { if (isCurrent()) setMenuBusy(false); }
  }

  useEffect(() => {
    if (creating || product || !bridge) return;
    let current = true;
    setResourceState("loading");
    void bridge.listProducts({ productId: intent.entityId, limit: 1 }).then(page => {
      if (!current) return;
      const record = page.items[0];
      if (!record) { setResourceState("error"); setSaveMessage("Ürün bulunamadı."); return; }
      setSavedProduct(record);
    }).catch(error => { if (current) { setResourceState("error"); setSaveMessage(error instanceof Error ? error.message : "Ürün okunamadı."); } });
    return () => { current = false; };
  }, [bridge, creating, intent.entityId, product, productReadAttempt]);

  const loadProductResources = useCallback(async () => {
    if (!product || !bridge) return;
    const isCurrent = beginResourceRequest();
    setResourceState("loading");
    let nextBalance: InventoryBalance | null = null;
    let nextMovements: InventoryMovement[] = [];
    let minimumQuantity = product.minimumQuantity;

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
    if (!bridge || (!product && !creating) || saveLock.current || mutationBusy || stockDraftDirty || resourceState !== "success") return;
    if (!form.name.trim()) { onStateChange("error", "Ürün adı girin."); setSaveState("error"); return; }
    const priceError = validateProductFormPrices(form);
    if (priceError) {
      setSaveState("error");
      onStateChange("error", priceError);
      return;
    }
    const isCurrent = beginSaveRequest();
    saveLock.current = true;
    setSaveState("loading");
    setSaveMessage("");
    let saved: CatalogProduct;
    try {
      const { id: productId, ...productFields } = productFormToSaveInput(form);
      saved = await bridge.saveProduct({
        ...productFields,
        ...(productId ? { id: productId } : {}),
        ...(creating && onlineSalesEnabled ? { onlineSalesPublished: createPublished } : {}),
        ...(imageDraftMode === "manual" && manualImageDataUrl ? { manualImageDataUrl } : {}),
        ...(imageDraftMode === "clear" ? { clearImage: true } : {})
      });
      if (!isCurrent()) return;
    } catch (error) {
      if (!isCurrent()) return;
      const message = error instanceof Error ? error.message : "Ürün kaydedilemedi.";
      setSaveState("error");
      setSaveMessage(message);
      saveLock.current = false;
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
    setSavedProduct(saved);
    setLoadedProductId(saved.id);
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
    saveLock.current = false;
    setSaveState("success");
    onStateChange("success", message);
    setPendingSavedId(saved.id);
  }

  const history = inventoryEnabled && intent.mode === "history";
  const presentation = navigation.current?.presentation ?? "centered";

  async function refreshStockHistory() {
    if (!bridge || !product || stockLock.current || mutationBusy) return;
    const isCurrent = beginStockRequest();
    setStockBusy(true);
    try {
      const next = await bridge.listInventoryMovements({ productId: product.id, limit: 100 });
      if (isCurrent()) { setMovements(next); setHistoryError(""); }
    } catch (error) { if (isCurrent()) setHistoryError(error instanceof Error ? error.message : "Stok hareketleri okunamadı."); }
    finally { if (isCurrent()) setStockBusy(false); }
  }

  const stockQuantity = Number(countedQuantity.trim().replace(",", "."));
  const stockPreview = !countedQuantity.trim() || !Number.isFinite(stockQuantity) || !balance ? null
    : stockOperation === "count" ? stockQuantity : balance.quantity + (stockOperation === "remove" ? -stockQuantity : stockQuantity);
  const stockValidation = !countedQuantity.trim() || !Number.isFinite(stockQuantity) || stockQuantity <= 0
    ? "Sıfırdan büyük, geçerli bir miktar girin."
    : stockPreview !== null && stockPreview < 0 ? "Stok miktarı negatif olamaz." : "";

  async function updateStock() {
    if (!bridge || !product || !product.trackInventory || !form.trackInventory || !inventoryEnabled || !balance || dirty || menuDirty || mutationBusy || stockLock.current || stockValidation) return;
    const isCurrent = beginStockRequest();
    stockLock.current = true;
    setStockBusy(true); setStockMessage("");
    let committed = false;
    try {
      if (stockOperation === "count") {
        const result = await bridge.setInventoryCount({ productId: product.id, locationId: balance.locationId,
          countedQuantity: stockQuantity, expectedUpdatedAt: balance.updatedAt, note: countNote,
          referenceType: "product_workspace_count", referenceId: product.id, actorSource: "desktop-product-workspace" });
        committed = true;
        if (!isCurrent()) return;
        setBalance(result.balance);
        if (result.movement) setMovements(current => [result.movement!, ...current]);
        setStockMessage(result.movement ? "Fiziksel sayım kaydedildi." : "Stok miktarı değişmedi.");
      } else {
        const movement = await bridge.applyInventoryMovement({ productId: product.id, locationId: balance.locationId,
          type: "adjust", quantityDelta: stockOperation === "remove" ? -stockQuantity : stockQuantity,
          note: countNote, referenceType: "product_workspace_adjust", referenceId: product.id, actorSource: "desktop-product-workspace" });
        committed = true;
        if (!isCurrent()) return;
        setBalance(current => current ? { ...current, quantity: movement.quantityAfter, updatedAt: movement.createdAt } : current);
        setMovements(current => [movement, ...current]);
        setStockMessage("Stok hareketi kaydedildi.");
      }
      setCountedQuantity(""); setCountNote(""); setStockConfirm(false);
      const [balanceResult, historyResult, reloadResult] = await Promise.allSettled([
        bridge.getInventoryBalance(product.id), bridge.listInventoryMovements({ productId: product.id, limit: 20 }), onReload()
      ]);
      if (!isCurrent()) return;
      if (balanceResult.status === "fulfilled") setBalance(balanceResult.value);
      else { setBalance(null); setStockMessage("Stok kaydedildi; güncel miktar okunamadı. Kartı yeniden açın."); }
      if (historyResult.status === "fulfilled") { setMovements(historyResult.value); setHistoryError(""); }
      else setHistoryError("Stok kaydedildi; hareket listesi yenilenemedi.");
      if (reloadResult.status === "rejected") setStockMessage("Stok kaydedildi; katalog görünümü yenilenemedi.");
    } catch (error) {
      if (!isCurrent()) return;
      setStockConfirm(false);
      setStockMessage(committed ? "Stok kaydedildi; görünüm yenilenemedi." : error instanceof Error ? error.message : "Stok güncellenemedi.");
      try { const current = await bridge.getInventoryBalance(product.id); if (isCurrent()) setBalance(current); }
      catch { if (isCurrent()) setBalance(null); }
    } finally { stockLock.current = false; if (isCurrent()) setStockBusy(false); }
  }

  if (!product && !creating) {
    return <WorkspaceFrame
      title={resourceState === "error" ? "Ürün okunamadı" : "Ürün yükleniyor…"}
      presentation={presentation}
      onPresentationChange={navigation.updateWorkspacePresentation}
      onClose={() => navigation.closeWorkspace()}
      closeBlocked={closeBlocked}
      returnFocusRef={navigation.returnFocusRef}
      dismissOnBackdrop
    >
      <div className="empty-state">
        {resourceState === "error" ? <>
          <p role="alert">{saveMessage || "Ürün kaydı bulunamadı."}</p>
          <ActionButton variant="secondary" onClick={() => setProductReadAttempt(current => current + 1)}>Yeniden dene</ActionButton>
        </> : <p role="status">Ürün yükleniyor…</p>}
      </div>
    </WorkspaceFrame>;
  }

  const stockDisabled = dirty || menuDirty || mutationBusy || !balance || stockConfirm;
  const stockPanel = inventoryEnabled && form.trackInventory && <DetailSectionCard title="Stok" className="market-product-stock-update">
    <strong>Mevcut stok: {balance?.quantity ?? "—"} {form.unit}</strong>
    <label className="form-field form-field--fluid form-field--span">Minimum stok<input type="number" min="0" step="0.0001" value={form.minimumQuantity} disabled={mutationBusy || stockDraftDirty} onChange={event => setForm(current => ({ ...current, minimumQuantity: event.target.value }))} /></label>
    {product?.trackInventory ? <>
      <label className="form-field form-field--fluid form-field--span">İşlem<select aria-label="Stok işlemi" value={stockOperation} disabled={stockDisabled} onChange={event => setStockOperation(event.target.value as typeof stockOperation)}>
        <option value="add">Ekle</option><option value="remove">Çıkar</option><option value="count">Fiziksel Sayım</option>
      </select></label>
      <label className="form-field form-field--fluid">Miktar<input inputMode="decimal" aria-label="Stok işlem miktarı" value={countedQuantity} onChange={event => setCountedQuantity(event.target.value)} disabled={stockDisabled} /></label>
      <label className="form-field form-field--fluid">Kısa not<input maxLength={240} value={countNote} onChange={event => setCountNote(event.target.value)} disabled={stockDisabled} /></label>
      {stockPreview !== null && <p role="status">İşlem sonrası: {stockPreview} {form.unit}</p>}
      {countedQuantity && stockValidation && <p role="alert">{stockValidation}</p>}
      <ActionButton variant="secondary" disabled={stockDisabled || Boolean(stockValidation)} onClick={() => setStockConfirm(true)}>Stok İşlemini Onayla</ActionButton>
      <ActionButton variant="secondary" disabled={mutationBusy || !stockDraftDirty} onClick={() => { setCountedQuantity(""); setCountNote(""); setStockConfirm(false); }}>Stok taslağını temizle</ActionButton>
      {stockConfirm && <ConfirmDialog embedded title="Stok işlemini kaydet" description={`Yeni toplam ${stockPreview} ${form.unit}. Hareket stok geçmişine kaydedilecek.`} confirmLabel="Stok Hareketini Kaydet" busy={stockBusy} onCancel={() => setStockConfirm(false)} onConfirm={() => void updateStock()} />}
      <ActionButton variant="secondary" disabled={dirty || menuDirty || stockDraftDirty || mutationBusy || resourceState !== "success"} onClick={() => {
        navigation.updateWorkspaceMode({ entityType: "product", mode: "history" });
        void refreshStockHistory();
      }}><History size={16} aria-hidden="true" />Stok Hareketleri</ActionButton>
      {(dirty || menuDirty) && <small>Stok işleminden önce kart değişikliklerini kaydedin veya geri alın.</small>}
    </> : <small>Stok işlemleri için önce ürünü stok takibi açık olarak kaydedin.</small>}
    {stockMessage && <p role="status">{stockMessage}</p>}
    {historyError && <p role="alert">{historyError}</p>}
  </DetailSectionCard>;

  const menuPanel = menuEntry && menuData && <section className="form-stack">
    <MenuProductEntryFields form={menuForm} dashboardData={menuData} inventoryEnabled={inventoryEnabled}
      qrMenuEnabled={qrMenuEnabled} disabled={mutationBusy} onChange={setMenuForm} />
    <div className="action-row">
      <ActionButton variant="secondary" disabled={!menuDirty || mutationBusy} onClick={() => { setMenuForm(menuBaseline); setMenuMessage(""); }}>Menü değişikliklerini geri al</ActionButton>
      <ActionButton disabled={!menuDirty || mutationBusy} onClick={() => void saveMenuPresentation()}>Menü Sunumunu Kaydet</ActionButton>
      <ActionButton variant="danger" disabled={dirty || menuDirty || mutationBusy} onClick={() => setRemoveMenuConfirm(true)}>Menüden kaldır</ActionButton>
    </div>
    {menuMessage && <p role="status">{menuMessage}</p>}
    {removeMenuConfirm && <ConfirmDialog embedded tone="danger" title="Menüden kaldır"
      description="Yalnız menü ilişkisi kaldırılır. Ortak ürün, stok ve online satış korunur." confirmLabel="Menüden kaldır"
      busy={menuBusy} onCancel={() => setRemoveMenuConfirm(false)} onConfirm={() => void removeMenuEntry()} />}
  </section>;

  return <WorkspaceFrame
      className="product-workspace-frame detail-workspace-frame"
      bodyScroll={history ? "body" : "panes"}
      title={product?.name ?? "Yeni ürün ekle"}
      context={[product?.brand, product?.sku || product?.barcode].filter(Boolean).join(" · ") || "Katalog ürünü"}
      actions={history && <ActionButton variant="secondary" disabled={mutationBusy} onClick={() =>
        navigation.updateWorkspaceMode({ entityType: "product", mode: "details" })
      }>← Ürüne dön</ActionButton>}
      presentation={presentation}
      onPresentationChange={navigation.updateWorkspacePresentation}
      onClose={() => navigation.closeWorkspace()}
      closeBlocked={closeBlocked}
      returnFocusRef={navigation.returnFocusRef}
      dismissOnBackdrop
      footer={!history && <div className="panel product-workspace-actions" data-surface-role="configuration">
        <div className="action-row">
          <ActionButton variant="secondary" type="button" disabled={mutationBusy || !dirty} onClick={() => {
            setForm(baseline);
            setImageDraftMode("keep");
            setManualImageDataUrl("");
            setSaveState("idle");
            setSaveMessage("");
            setCreatePublished(onlineSalesEnabled);
          }}>Değişiklikleri Geri Al</ActionButton>
          <ActionButton type="button" disabled={mutationBusy || stockDraftDirty || resourceState !== "success" || !dirty || !form.name.trim()} onClick={() => void saveProduct()}>
            <Save size={16} aria-hidden="true" />{saveState === "loading" ? "Kaydediliyor" : "Ürünü Kaydet"}
          </ActionButton>
        </div>
      </div>}
    >
      {!history ? <>
        {resourceState === "error" ? <DetailWorkspaceLayout railLabel="Ürün işlemleri" contentLabel="Ürün detayları" rail={stockPanel}><div className="empty-state"><strong>Ürün kartı güvenli biçimde yüklenemedi.</strong><p>{saveMessage}</p><ActionButton variant="secondary" onClick={() => void loadProductResources()}>Tekrar Dene</ActionButton></div>{menuPanel}</DetailWorkspaceLayout> :
          <ProductFormFields
            renderSections={({ status, details, media }) => <DetailWorkspaceLayout
              railLabel="Ürün işlemleri" contentLabel="Ürün detayları" rail={<>
                {showPhotoGallery ? <ProductPhotoGallery key={productId} productId={productId}
                  disabled={busy || fieldsBusy || menuBusy || publicationBusy || stockBusy || saveState === "loading" || stockDraftDirty || resourceState !== "success"}
                  onBusyChange={setPhotosBusy} onChanged={photosChanged} /> : <>{media}
                    {onlineSalesEnabled && creating && <small>İlk kayıttan sonra en fazla 12 fotoğrafı sıralayıp kapak seçebilirsiniz.</small>}
                    {onlineSalesEnabled && productId && imageDraftMode !== "keep" && <small>Galeriyi açmak için seçili kapak değişikliğini kaydedin veya geri alın.</small>}
                  </>}
                {status}{stockPanel}</>}
            >{details}{menuPanel}</DetailWorkspaceLayout>}
            {...(creating && intent.lookupSeed ? { lookupSeed: intent.lookupSeed } : {})}
            onBusyChange={setFieldsBusy}
            form={form}
            categories={categories}
            inventoryEnabled={inventoryEnabled}
            productDataEnabled={productDataEnabled}
            wholesaleEnabled={wholesaleEnabled}
            retailFieldsEnabled={retailFieldsEnabled}
            purchasingEnabled={purchasingEnabled}
            disabled={mutationBusy || stockDraftDirty || resourceState !== "success"}
            mode="all"
            statusFields={onlineSalesEnabled ? <>
              <label className="form-check"><input type="checkbox" checked={creating ? createPublished : isPublished} disabled={mutationBusy || (!creating && !publicationLoaded)} onChange={event => { if (creating) setCreatePublished(event.target.checked); else void savePublication(event.target.checked); }} /> Web satışında yayınla</label>
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
              if (showPhotoGallery) return;
              setManualImageDataUrl("");
              setImageDraftMode("external");
            }}
            onChange={next => setForm(current => showPhotoGallery
              ? { ...next, imageSourceUrl: current.imageSourceUrl, imageLicense: current.imageLicense } : next)}
            onStateChange={onStateChange}
          />}
      </> : <section className="form-stack" aria-label="Stok hareketleri">
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
