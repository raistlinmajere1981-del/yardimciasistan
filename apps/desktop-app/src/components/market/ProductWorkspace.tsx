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
import type { ProductPhotoCollection, ProductPhotoDraftPhoto } from "@yardimci-asistan/shared";
import type { DesktopDashboardData, DesktopMenuSaveResult, DesktopStatusUpdateResult } from "../../../electron/database";
import { MenuProductEntryFields } from "../menu/MenuProductEntryFields";
import { toItemForm, type ItemFormState } from "../menu/menu-model";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useWebAvailability } from "../../app/web-availability";

type WorkspaceState = "idle" | "loading" | "success" | "error";
const EMPTY_PHOTOS: ProductPhotoCollection = { productId: "", revision: "", photos: [], sourceUrl: "", sourceLicense: "" };

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
  const [imageResetKey, setImageResetKey] = useState(0);
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
  const stockOperationId = useRef(crypto.randomUUID());
  const saveLock = useRef(false);
  const [stockOperation, setStockOperation] = useState<"add" | "remove" | "count">("add");
  const [historyError, setHistoryError] = useState("");
  const beginStockRequest = useRequestGeneration();
  const [isPublished, setIsPublished] = useState(onlineSalesEnabled);
  const [publicationBaseline, setPublicationBaseline] = useState(onlineSalesEnabled);
  const [isFeatured, setIsFeatured] = useState(false);
  const [featuredBaseline, setFeaturedBaseline] = useState(false);
  const [featuredOrder, setFeaturedOrder] = useState(0);
  const [featuredOrderBaseline, setFeaturedOrderBaseline] = useState(0);
  const [photoBaseline, setPhotoBaseline] = useState<ProductPhotoCollection>(EMPTY_PHOTOS);
  const [photoDraft, setPhotoDraft] = useState<ProductPhotoDraftPhoto[]>([]);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const [publicationLoaded, setPublicationLoaded] = useState(false);
  const [publicationMessage, setPublicationMessage] = useState("");
  const beginPublicationRequest = useRequestGeneration();
  const beginResourceRequest = useRequestGeneration();
  const beginSaveRequest = useRequestGeneration();
  const beginMenuRequest = useRequestGeneration();
  const menuEntry = menuData?.menu.items.find(item => item.product_id === intent.entityId && (!intent.menuEntryId || item.id === intent.menuEntryId));
  const [menuForm, setMenuForm] = useState(() => toItemForm(menuEntry, menuData?.menu.categories[0]?.id ?? ""));
  const [menuBaseline, setMenuBaseline] = useState(menuForm);
  const [menuBusy, setMenuBusy] = useState(false);
  const [menuMessage, setMenuMessage] = useState("");
  const [removeMenuConfirm, setRemoveMenuConfirm] = useState(false);
  const menuDirty = JSON.stringify(menuForm) !== JSON.stringify(menuBaseline);
  const photosDirty = JSON.stringify(photoDraft.map(photo => photo.id)) !== JSON.stringify(photoBaseline.photos.map(photo => photo.id));
  const stockDraftDirty = Boolean(countedQuantity.trim() || countNote.trim() || stockOperation !== "add");
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline) || imageDraftMode !== "keep" || photosDirty
    || isPublished !== publicationBaseline || isFeatured !== featuredBaseline
    || featuredOrder !== featuredOrderBaseline || stockDraftDirty;
  const showPhotoGallery = onlineSalesCapability && imageDraftMode === "keep" && resourceState === "success";
  const mutationBusy = busy || fieldsBusy || photosBusy || menuBusy || publicationBusy || stockBusy || saveState === "loading";
  const effectiveImageDataUrl = imageDraftMode === "manual"
    ? manualImageDataUrl
    : imageDraftMode === "keep"
      ? localImageDataUrl
      : "";
  const closeBlocked = useWorkspaceCloseGuard({
    busy: mutationBusy || resourceState === "loading",
    dirty: dirty || menuDirty
  });
  useEffect(() => {
    if (!pendingSavedId || closeBlocked) return;
    const closed = navigation.closeWorkspace(
      { entityType: "product", entityId: intent.entityId },
      intent.mode === "create" ? { createdEntityId: pendingSavedId } : undefined
    );
    // The product list may rerender when the saved card is inserted. Restore
    // keyboard focus after the dialog and refreshed toolbar have settled.
    if (closed) {
      const restore = () => {
        const active = document.activeElement;
        if (active !== document.body && !active?.hasAttribute("data-workspace-return-focus")) return;
        const previous = navigation.returnFocusRef.current;
        const target = previous?.isConnected && !previous.matches(":disabled")
          ? previous : document.querySelector<HTMLElement>("button[data-workspace-return-focus]:not(:disabled)")
            ?? document.querySelector<HTMLElement>("[data-workspace-return-focus]:not(:disabled)");
        target?.focus({ preventScroll: true });
      };
      requestAnimationFrame(restore);
      // A refreshed catalog may briefly disable its toolbar after the dialog
      // closes. Do not strand keyboard focus on the body when it becomes ready.
      window.setTimeout(restore, 200);
    }
  }, [closeBlocked, intent.entityId, intent.mode, navigation, pendingSavedId]);
  useEffect(() => {
    if (menuDirty || menuBusy) return;
    const next = toItemForm(menuEntry, menuData?.menu.categories[0]?.id ?? "");
    setMenuForm(next); setMenuBaseline(next);
  }, [menuEntry, menuData?.menu.categories, menuDirty, menuBusy]);

  useEffect(() => {
    const isCurrent = beginPublicationRequest();
    setPublicationLoaded(false);
    setIsPublished(creating && onlineSalesEnabled);
    setPublicationBaseline(creating && onlineSalesEnabled);
    setIsFeatured(false); setFeaturedBaseline(false);
    setFeaturedOrder(0); setFeaturedOrderBaseline(0);
    setPublicationMessage("");
    if (!onlineSalesEnabled || !productId || !bridge) {
      setPublicationBusy(false);
      setPublicationLoaded(creating);
      return;
    }
    setPublicationBusy(true);
    void bridge.getProductPublication(productId).then((publication) => {
      if (!isCurrent()) return;
      setIsPublished(publication?.isPublished ?? false);
      setPublicationBaseline(publication?.isPublished ?? false);
      setIsFeatured(publication?.isFeatured ?? false);
      setFeaturedBaseline(publication?.isFeatured ?? false);
      setFeaturedOrder(publication?.featuredOrder ?? 0);
      setFeaturedOrderBaseline(publication?.featuredOrder ?? 0);
      setPublicationLoaded(true);
    }).catch(() => {
      if (isCurrent()) setPublicationMessage("Web yayın tercihi okunamadı. Ürün kartını yeniden açıp deneyin.");
    }).finally(() => { if (isCurrent()) setPublicationBusy(false); });
  }, [beginPublicationRequest, bridge, creating, onlineSalesEnabled, productId]);

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

    let nextPhotos: ProductPhotoCollection;
    try { nextPhotos = await bridge.listProductPhotos(product.id); }
    catch (error) {
      if (!isCurrent()) return;
      setResourceState("error");
      setSaveMessage(error instanceof Error ? error.message : "Ürün fotoğrafları okunamadı.");
      return;
    }
    if (!isCurrent()) return;
    setPhotoBaseline(nextPhotos);
    setPhotoDraft(nextPhotos.photos);
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
    setStockOperation("add");
    stockOperationId.current = crypto.randomUUID();
  }, [beginResourceRequest, bridge, inventoryEnabled, onStateChange, product]);

  useEffect(() => {
    if (!product || loadedProductId === product.id) return;
    void loadProductResources();
  }, [loadProductResources, loadedProductId, product]);

  function clearStockDraft() {
    setCountedQuantity(""); setCountNote(""); setStockOperation("add");
    stockOperationId.current = crypto.randomUUID();
  }

  async function saveProduct() {
    if (!bridge || (!product && !creating) || saveLock.current || mutationBusy || resourceState !== "success") return;
    const validation = !form.name.trim() ? "Ürün adı girin." : validateProductFormPrices(form)
      || (stockDraftDirty ? !form.trackInventory ? "Bekleyen stok işlemi için stok takibini açın veya stok taslağını temizleyin." : stockValidation : "");
    if (validation) {
      setSaveState("error"); setSaveMessage(validation); onStateChange("error", validation); return;
    }
    const isCurrent = beginSaveRequest();
    saveLock.current = true; setSaveState("loading"); setSaveMessage("");
    let result: Awaited<ReturnType<typeof bridge.saveProductDetails>>;
    try {
      const { id, ...productFields } = productFormToSaveInput(form);
      result = await bridge.saveProductDetails({
        product: { ...productFields, ...(id ? { id } : {}),
          ...(imageDraftMode === "manual" ? { manualImageDataUrl } : {}) },
        sourcePhotoRevision: photoBaseline.revision, imageMode: imageDraftMode,
        ...(onlineSalesCapability && photosDirty ? { photos: photoDraft } : {}),
        ...(onlineSalesEnabled && publicationLoaded ? { isPublished, isFeatured, featuredOrder } : {}),
        ...(stockDraftDirty ? { stock: { operation: stockOperation, quantity: stockQuantity, note: countNote,
          ...(balance?.locationId ? { locationId: balance.locationId } : {}), expectedUpdatedAt: balance?.updatedAt ?? "",
          operationId: stockOperationId.current } } : {})
      });
    } catch (error) {
      if (!isCurrent()) return;
      const message = error instanceof Error ? error.message : "Ürün kaydedilemedi.";
      setSaveState("error"); setSaveMessage(message); saveLock.current = false;
      onStateChange("error", message); return;
    }
    if (!isCurrent()) return;
    // Commit succeeded. Clear every committed draft before refreshing projections;
    // a failed read must never leave a stock action available for resubmission.
    const saved = result.product;
    const nextForm = toProductForm(saved, saved.minimumQuantity, inventoryEnabled);
    setSavedProduct(saved); setLoadedProductId(saved.id);
    setForm(nextForm); setBaseline(nextForm);
    setPhotoBaseline(result.photos); setPhotoDraft(result.photos.photos);
    setIsPublished(result.publication?.isPublished ?? false);
    setPublicationBaseline(result.publication?.isPublished ?? false);
    setIsFeatured(result.publication?.isFeatured ?? false);
    setFeaturedBaseline(result.publication?.isFeatured ?? false);
    setFeaturedOrder(result.publication?.featuredOrder ?? 0);
    setFeaturedOrderBaseline(result.publication?.featuredOrder ?? 0);
    setImageDraftMode("keep"); setManualImageDataUrl(""); clearStockDraft();
    setBalance(result.balance);
    if (result.stock) {
      if (result.stock.movement) setMovements(current => [result.stock!.movement!, ...current]);
    } else if (!saved.trackInventory) setMovements([]);
    let refreshFailed = false;
    try { onProductSaved(saved); await onReload(); } catch { refreshFailed = true; }
    try {
      const preview = saved.imageAssetPath ? await bridge.getProductImageDataUrl(saved.id) : "";
      if (isCurrent()) setLocalImageDataUrl(preview);
    } catch { refreshFailed = true; }
    if (!isCurrent()) return;
    saveLock.current = false; setSaveState("success");
    onStateChange("success", `${saved.name} kaydedildi.${refreshFailed ? " Görünüm yenilenemedi; ürün kartını yeniden açın." : ""}`);
    setPendingSavedId(saved.id);
  }

  const history = inventoryEnabled && intent.mode === "history";
  const presentation = navigation.current?.presentation ?? "centered";

  async function refreshStockHistory() {
    if (!bridge || !product || mutationBusy) return;
    const isCurrent = beginStockRequest();
    setStockBusy(true);
    try {
      const next = await bridge.listInventoryMovements({ productId: product.id, limit: 100 });
      if (isCurrent()) { setMovements(next); setHistoryError(""); }
    } catch (error) { if (isCurrent()) setHistoryError(error instanceof Error ? error.message : "Stok hareketleri okunamadı."); }
    finally { if (isCurrent()) setStockBusy(false); }
  }

  const stockQuantity = Number(countedQuantity.trim().replace(",", "."));
  const stockPreview = !countedQuantity.trim() || !Number.isFinite(stockQuantity) ? null
    : stockOperation === "count" ? stockQuantity : (balance?.quantity ?? 0) + (stockOperation === "remove" ? -stockQuantity : stockQuantity);
  const stockValidation = !countedQuantity.trim() || !Number.isFinite(stockQuantity) || stockQuantity < 0 || (stockOperation !== "count" && Math.round(stockQuantity * 10000) <= 0)
    ? stockOperation === "count" ? "Sıfır veya daha büyük, geçerli bir miktar girin." : "Sıfırdan büyük, geçerli bir miktar girin."
    : stockPreview !== null && stockPreview < 0 ? "Stok miktarı negatif olamaz." : "";

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

  const stockDisabled = mutationBusy || resourceState !== "success";
  const stockPanel = inventoryEnabled && form.trackInventory && <DetailSectionCard title="Stok" className="market-product-stock-update">
    <strong>Mevcut stok: {balance?.quantity ?? (creating || !product?.trackInventory ? 0 : "—")} {form.unit}</strong>
    <label className="form-field form-field--fluid form-field--span">Minimum stok<input type="number" min="0" step="0.0001" value={form.minimumQuantity} disabled={mutationBusy} onChange={event => setForm(current => ({ ...current, minimumQuantity: event.target.value }))} /></label>
    <label className="form-field form-field--fluid form-field--span">İşlem<select aria-label="Stok işlemi" value={stockOperation} disabled={stockDisabled} onChange={event => { setStockOperation(event.target.value as typeof stockOperation); stockOperationId.current = crypto.randomUUID(); }}>
      <option value="add">Ekle</option><option value="remove">Çıkar</option><option value="count">Fiziksel Sayım</option>
    </select></label>
    <label className="form-field form-field--fluid">Miktar<input inputMode="decimal" aria-label="Stok işlem miktarı" value={countedQuantity} onChange={event => { setCountedQuantity(event.target.value); stockOperationId.current = crypto.randomUUID(); }} disabled={stockDisabled} /></label>
    <label className="form-field form-field--fluid">Kısa not<input maxLength={240} value={countNote} onChange={event => { setCountNote(event.target.value); stockOperationId.current = crypto.randomUUID(); }} disabled={stockDisabled} /></label>
    {stockPreview !== null && <p role="status">Kaydet sonrası stok: {stockPreview} {form.unit}</p>}
    {stockDraftDirty && stockValidation && <p role="alert">{stockValidation}</p>}
    <small>Stok işlemi Ürünü Kaydet ile bir kez geçmişe işlenir. Geri Al yalnız bekleyen işlemi iptal eder; kayıtlı hareketler değişmez.</small>
    <ActionButton variant="secondary" disabled={mutationBusy || !stockDraftDirty} onClick={clearStockDraft}>Stok taslağını temizle</ActionButton>
    {product?.trackInventory && <ActionButton variant="secondary" disabled={mutationBusy || resourceState !== "success"} onClick={() => {
      navigation.updateWorkspaceMode({ entityType: "product", mode: "history" }); void refreshStockHistory();
    }}><History size={16} aria-hidden="true" />Stok Hareketleri</ActionButton>}
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
        {saveMessage && <p role="alert">{saveMessage}</p>}
        <div className="action-row">
          <ActionButton variant="secondary" type="button" disabled={mutationBusy || !dirty} onClick={() => {
            setForm(baseline);
            setImageDraftMode("keep");
            setManualImageDataUrl("");
            setImageResetKey(current => current + 1);
            setSaveState("idle");
            setSaveMessage("");
            setIsPublished(publicationBaseline);
            setPhotoDraft(photoBaseline.photos);
            setPhotoBaseline(current => ({ ...current }));
            clearStockDraft();
          }}>Değişiklikleri Geri Al</ActionButton>
          <ActionButton type="button" disabled={mutationBusy || resourceState !== "success" || !dirty || !form.name.trim()} onClick={() => void saveProduct()}>
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
                {showPhotoGallery ? <ProductPhotoGallery productId={productId} collection={photoBaseline} photos={photoDraft}
                  disabled={mutationBusy || resourceState !== "success"}
                  onBusyChange={setPhotosBusy} onChange={setPhotoDraft} /> : media}
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
            disabled={mutationBusy || resourceState !== "success"}
            mode="all"
            statusFields={onlineSalesEnabled ? <>
              <label className="form-check"><input type="checkbox" checked={isPublished} disabled={mutationBusy || (!creating && !publicationLoaded)} onChange={event => setIsPublished(event.target.checked)} /> Web satışında yayınla</label>
              <label className="form-check"><input type="checkbox" checked={isFeatured} disabled={mutationBusy || !publicationLoaded || !isPublished} onChange={event => setIsFeatured(event.target.checked)} /> Vitrinde göster</label>
              <label>Vitrin sırası
                <input type="number" min={0} max={1000000} step={1} value={featuredOrder} disabled={mutationBusy || !publicationLoaded || !isPublished || !isFeatured}
                  onChange={event => setFeaturedOrder(Number(event.target.value))} />
              </label>
              <small>Vitrin işareti Hızlı Erişim'den bağımsızdır. Değişiklikler Ürünü Kaydet ile yayın ayarına yazılır.</small>
              {(isPublished !== publicationBaseline || isFeatured !== featuredBaseline || featuredOrder !== featuredOrderBaseline)
                && <small>Web yayın ve vitrin tercihleri Ürünü Kaydet ile uygulanacak.</small>}
              {publicationMessage && <p role="status">{publicationMessage}</p>}
            </> : null}
            localImageDataUrl={effectiveImageDataUrl}
            imageResetKey={imageResetKey}
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
