import {
  Archive,
  Barcode,
  Boxes,
  PackagePlus,
  Plus,
  Printer,
  ReceiptText,
  Save,
  Search,
  ShoppingBasket,
  Tags,
  Truck,
  type LucideIcon
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BUSINESS_CAPABILITIES,
  type CatalogCategory,
  type CatalogProduct,
  type CommercePurchaseOrder,
  type CommerceSupplier,
  type CommerceUnit,
  type InventoryBalance,
  type InventoryMovement
} from "@yardimci-asistan/shared";
import { runtimeHasCapability } from "../app/capabilities";
import { useBusinessCapabilityRuntime } from "../app/business-capability-context";

type MarketTab = "quickSale" | "products" | "inventory" | "purchasing" | "labels";
type AsyncState = "idle" | "loading" | "success" | "error";

interface MarketTabDefinition {
  id: MarketTab;
  label: string;
  description: string;
  icon: LucideIcon;
  enabled: boolean;
}

interface ProductFormState {
  id: string;
  categoryId: string;
  name: string;
  sku: string;
  barcode: string;
  description: string;
  salePrice: string;
  purchasePrice: string;
  currency: string;
  unit: CommerceUnit;
  taxRate: string;
  minimumQuantity: string;
  trackInventory: boolean;
  isActive: boolean;
}

interface CategoryFormState {
  id: string;
  parentId: string;
  name: string;
  code: string;
  sortOrder: string;
  isActive: boolean;
}

interface SupplierFormState {
  id: string;
  name: string;
  phone: string;
  email: string;
  taxNumber: string;
  notes: string;
  isActive: boolean;
}

interface PurchaseLineState {
  key: string;
  productId: string;
  quantity: string;
  unitCost: string;
}

const unitLabels: Record<CommerceUnit, string> = {
  piece: "Adet",
  kg: "Kilogram",
  g: "Gram",
  l: "Litre",
  ml: "Mililitre",
  pack: "Paket",
  box: "Kutu",
  meter: "Metre",
  other: "Diğer"
};

function emptyProductForm(): ProductFormState {
  return {
    id: "",
    categoryId: "",
    name: "",
    sku: "",
    barcode: "",
    description: "",
    salePrice: "0",
    purchasePrice: "0",
    currency: "TRY",
    unit: "piece",
    taxRate: "0",
    minimumQuantity: "0",
    trackInventory: true,
    isActive: true
  };
}

function emptyCategoryForm(): CategoryFormState {
  return { id: "", parentId: "", name: "", code: "", sortOrder: "0", isActive: true };
}

function emptySupplierForm(): SupplierFormState {
  return { id: "", name: "", phone: "", email: "", taxNumber: "", notes: "", isActive: true };
}

function createPurchaseLine(index: number): PurchaseLineState {
  return { key: `purchase-line-${Date.now()}-${index}`, productId: "", quantity: "1", unitCost: "0" };
}

function money(value: number, currency = "TRY") {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function localDateTime(value: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("tr-TR");
}

function MarketEmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <section className="market-empty-state">
      <Icon size={30} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </section>
  );
}

export function MarketPage() {
  const { snapshot } = useBusinessCapabilityRuntime();
  const bridge = window.yardimciDesktop?.commerce;
  const C = BUSINESS_CAPABILITIES;
  const catalogEnabled = runtimeHasCapability(snapshot, C.CATALOG);
  const inventoryEnabled = runtimeHasCapability(snapshot, C.INVENTORY);
  const salesEnabled = runtimeHasCapability(snapshot, C.SALES);
  const barcodeEnabled = runtimeHasCapability(snapshot, C.RETAIL_BARCODE);
  const purchasingEnabled = runtimeHasCapability(snapshot, C.RETAIL_PURCHASING);
  const suppliersEnabled = runtimeHasCapability(snapshot, C.RETAIL_SUPPLIERS);
  const labelsEnabled = runtimeHasCapability(snapshot, C.RETAIL_LABELS);

  const tabs = useMemo<MarketTabDefinition[]>(() => [
    {
      id: "quickSale",
      label: "Hızlı Satış",
      description: "Kasada hızlı ürün ekleme ve ödeme",
      icon: ShoppingBasket,
      enabled: catalogEnabled && salesEnabled
    },
    {
      id: "products",
      label: "Ürünler",
      description: "Ürün ve kategori yönetimi",
      icon: Archive,
      enabled: catalogEnabled
    },
    {
      id: "inventory",
      label: "Stok",
      description: "Fiziksel sayım ve hareket geçmişi",
      icon: Boxes,
      enabled: inventoryEnabled
    },
    {
      id: "purchasing",
      label: "Tedarikçiler / Alım",
      description: "Tedarikçi ve stok girişi",
      icon: Truck,
      enabled: suppliersEnabled || purchasingEnabled
    },
    {
      id: "labels",
      label: "Etiketler",
      description: "Ürün ve raf etiketi hazırlama",
      icon: Tags,
      enabled: labelsEnabled
    }
  ], [catalogEnabled, inventoryEnabled, labelsEnabled, purchasingEnabled, salesEnabled, suppliersEnabled]);
  const availableTabs = tabs.filter((tab) => tab.enabled);
  const [activeTab, setActiveTab] = useState<MarketTab>(() => availableTabs[0]?.id ?? "products");

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [suppliers, setSuppliers] = useState<CommerceSupplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<CommercePurchaseOrder[]>([]);
  const [dataState, setDataState] = useState<AsyncState>("idle");
  const [message, setMessage] = useState("Market verileri hazır.");

  const [productSearch, setProductSearch] = useState("");
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProductForm);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(emptySupplierForm);

  const [inventoryProductId, setInventoryProductId] = useState("");
  const [inventoryBalance, setInventoryBalance] = useState<InventoryBalance | null>(null);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [countedQuantity, setCountedQuantity] = useState("0");
  const [countNote, setCountNote] = useState("");

  const [purchaseSupplierId, setPurchaseSupplierId] = useState("");
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLineState[]>([createPurchaseLine(0)]);

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(availableTabs[0]?.id ?? "products");
    }
  }, [activeTab, availableTabs]);

  async function loadCoreData() {
    if (!bridge) {
      setDataState("error");
      setMessage("Commerce köprüsü kullanılamıyor.");
      return;
    }

    setDataState("loading");
    try {
      const [nextProducts, nextCategories, nextSuppliers, nextPurchaseOrders] = await Promise.all([
        catalogEnabled ? bridge.listProducts({ limit: 500 }) : Promise.resolve([]),
        catalogEnabled ? bridge.listCategories({ limit: 500 }) : Promise.resolve([]),
        suppliersEnabled ? bridge.listSuppliers({ limit: 500 }) : Promise.resolve([]),
        purchasingEnabled ? bridge.listPurchaseOrders({ limit: 100 }) : Promise.resolve([])
      ]);
      setProducts(nextProducts);
      setCategories(nextCategories);
      setSuppliers(nextSuppliers);
      setPurchaseOrders(nextPurchaseOrders);
      setInventoryProductId((current) => current || nextProducts.find((product) => product.trackInventory)?.id || "");
      setDataState("success");
      setMessage("Market verileri güncel.");
    } catch (error) {
      setDataState("error");
      setMessage(error instanceof Error ? error.message : "Market verileri yüklenemedi.");
    }
  }

  useEffect(() => {
    void loadCoreData();
    // Capability değişiklikleri bridge çağrılarının gerçek erişim sınırıdır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogEnabled, purchasingEnabled, suppliersEnabled]);

  useEffect(() => {
    if (!bridge || !inventoryEnabled || !inventoryProductId) {
      setInventoryBalance(null);
      setInventoryMovements([]);
      return;
    }
    let mounted = true;
    void Promise.all([
      bridge.getInventoryBalance(inventoryProductId),
      bridge.listInventoryMovements({ productId: inventoryProductId, limit: 50 })
    ]).then(([balance, movements]) => {
      if (!mounted) return;
      setInventoryBalance(balance);
      setInventoryMovements(movements);
      setCountedQuantity(String(balance.quantity));
    }).catch((error) => {
      if (!mounted) return;
      setMessage(error instanceof Error ? error.message : "Stok bilgisi yüklenemedi.");
      setDataState("error");
    });
    return () => {
      mounted = false;
    };
  }, [bridge, inventoryEnabled, inventoryProductId]);

  const filteredProducts = products.filter((product) => {
    const needle = productSearch.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return true;
    return [product.name, product.sku, product.barcode]
      .some((value) => value.toLocaleLowerCase("tr-TR").includes(needle));
  });

  function editProduct(product: CatalogProduct) {
    setProductForm({
      id: product.id,
      categoryId: product.categoryId,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      description: product.description,
      salePrice: String(product.salePrice),
      purchasePrice: String(product.purchasePrice),
      currency: product.currency,
      unit: product.unit,
      taxRate: String(product.taxRate),
      minimumQuantity: "0",
      trackInventory: product.trackInventory,
      isActive: product.isActive
    });
  }

  async function saveProduct() {
    if (!bridge) return;
    setDataState("loading");
    try {
      const saved = await bridge.saveProduct({
        id: productForm.id || undefined,
        categoryId: productForm.categoryId,
        name: productForm.name,
        sku: productForm.sku,
        barcode: productForm.barcode,
        description: productForm.description,
        salePrice: Number(productForm.salePrice),
        purchasePrice: Number(productForm.purchasePrice),
        currency: productForm.currency,
        unit: productForm.unit,
        taxRate: Number(productForm.taxRate),
        minimumQuantity: Number(productForm.minimumQuantity),
        trackInventory: productForm.trackInventory,
        isActive: productForm.isActive
      });
      setProductForm(emptyProductForm());
      await loadCoreData();
      setMessage(`${saved.name} kaydedildi.`);
    } catch (error) {
      setDataState("error");
      setMessage(error instanceof Error ? error.message : "Ürün kaydedilemedi.");
    }
  }

  function editCategory(category: CatalogCategory) {
    setCategoryForm({
      id: category.id,
      parentId: category.parentId,
      name: category.name,
      code: category.code,
      sortOrder: String(category.sortOrder),
      isActive: category.isActive
    });
  }

  async function saveCategory() {
    if (!bridge) return;
    setDataState("loading");
    try {
      const saved = await bridge.saveCategory({
        id: categoryForm.id || undefined,
        parentId: categoryForm.parentId,
        name: categoryForm.name,
        code: categoryForm.code,
        sortOrder: Number(categoryForm.sortOrder),
        isActive: categoryForm.isActive
      });
      setCategoryForm(emptyCategoryForm());
      await loadCoreData();
      setMessage(`${saved.name} kategorisi kaydedildi.`);
    } catch (error) {
      setDataState("error");
      setMessage(error instanceof Error ? error.message : "Kategori kaydedilemedi.");
    }
  }

  async function deleteCategory(categoryId: string) {
    if (!bridge) return;
    setDataState("loading");
    try {
      await bridge.deleteCategory(categoryId);
      if (categoryForm.id === categoryId) setCategoryForm(emptyCategoryForm());
      await loadCoreData();
      setMessage("Kategori kaldırıldı.");
    } catch (error) {
      setDataState("error");
      setMessage(error instanceof Error ? error.message : "Kategori kaldırılamadı.");
    }
  }

  async function saveInventoryCount() {
    if (!bridge || !inventoryProductId) return;
    setDataState("loading");
    try {
      const result = await bridge.setInventoryCount({
        productId: inventoryProductId,
        countedQuantity: Number(countedQuantity),
        note: countNote,
        actorSource: "desktop-market"
      });
      setInventoryBalance(result.balance);
      setCountedQuantity(String(result.balance.quantity));
      setCountNote("");
      setInventoryMovements(await bridge.listInventoryMovements({ productId: inventoryProductId, limit: 50 }));
      setDataState("success");
      setMessage(result.movement ? "Fiziksel stok sayımı kaydedildi." : "Sayım mevcut stokla aynı; hareket oluşturulmadı.");
    } catch (error) {
      setDataState("error");
      setMessage(error instanceof Error ? error.message : "Stok sayımı kaydedilemedi.");
    }
  }

  function editSupplier(supplier: CommerceSupplier) {
    setSupplierForm({
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email,
      taxNumber: supplier.taxNumber,
      notes: supplier.notes,
      isActive: supplier.isActive
    });
  }

  async function saveSupplier() {
    if (!bridge) return;
    setDataState("loading");
    try {
      const saved = await bridge.saveSupplier({
        id: supplierForm.id || undefined,
        name: supplierForm.name,
        phone: supplierForm.phone,
        email: supplierForm.email,
        taxNumber: supplierForm.taxNumber,
        notes: supplierForm.notes,
        isActive: supplierForm.isActive
      });
      setSupplierForm(emptySupplierForm());
      await loadCoreData();
      setMessage(`${saved.name} tedarikçisi kaydedildi.`);
    } catch (error) {
      setDataState("error");
      setMessage(error instanceof Error ? error.message : "Tedarikçi kaydedilemedi.");
    }
  }

  function updatePurchaseLine(key: string, patch: Partial<PurchaseLineState>) {
    setPurchaseLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  async function receivePurchase() {
    if (!bridge) return;
    const items = purchaseLines
      .filter((line) => line.productId)
      .map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost)
      }));
    setDataState("loading");
    try {
      const result = await bridge.receivePurchase({
        supplierId: purchaseSupplierId || undefined,
        notes: purchaseNotes,
        source: "desktop-market",
        items
      });
      setPurchaseSupplierId("");
      setPurchaseNotes("");
      setPurchaseLines([createPurchaseLine(0)]);
      await loadCoreData();
      if (inventoryProductId) {
        setInventoryBalance(await bridge.getInventoryBalance(inventoryProductId));
        setInventoryMovements(await bridge.listInventoryMovements({ productId: inventoryProductId, limit: 50 }));
      }
      setMessage(`${result.items.length} kalem stok girişi tamamlandı.`);
    } catch (error) {
      setDataState("error");
      setMessage(error instanceof Error ? error.message : "Alım kaydedilemedi.");
    }
  }

  const selectedInventoryProduct = products.find((product) => product.id === inventoryProductId) ?? null;

  return (
    <section className="market-page" aria-label="Market yönetimi">
      <nav className="market-tabs" aria-label="Market çalışma alanları">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          if (!tab.enabled) return null;
          return (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? "is-active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={17} aria-hidden="true" />
              <span>
                <strong>{tab.label}</strong>
                <small>{tab.description}</small>
              </span>
            </button>
          );
        })}
      </nav>

      <div className={`market-status market-status-${dataState}`} role="status" aria-live="polite">
        {message}
      </div>

      {activeTab === "quickSale" ? (
        <section className="market-panel">
          <header className="market-panel-heading">
            <span>Satış</span>
            <h2>Hızlı Satış</h2>
            <p>Satış yüzeyi M3 aşamasında bu workspace içine bağlanacak.</p>
          </header>
          <div className="market-placeholder-grid">
            <MarketEmptyState
              icon={ReceiptText}
              title="Kasaya hazır altyapı"
              description="Ürün, stok ve satış runtime sözleşmeleri hazır. M3 sepet, ödeme ve satış akışını ekleyecek."
            />
            <MarketEmptyState
              icon={Barcode}
              title={barcodeEnabled ? "Barkod capability etkin" : "Barkod capability kapalı"}
              description="M4'te simülatör, USB klavye okuyucu ve ileride kamera adaptörü aynı giriş sözleşmesine bağlanacak."
            />
          </div>
        </section>
      ) : activeTab === "products" ? (
        <div className="market-two-column">
          <section className="market-panel">
            <header className="market-panel-heading market-panel-heading-row">
              <div>
                <span>Katalog</span>
                <h2>Ürünler</h2>
                <p>Ürün kartları satış ve stok tarafından ortak kullanılır.</p>
              </div>
              <button type="button" className="market-secondary-button" onClick={() => setProductForm(emptyProductForm())}>
                <Plus size={16} aria-hidden="true" /> Yeni ürün
              </button>
            </header>
            <label className="market-search-field">
              <Search size={16} aria-hidden="true" />
              <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Ad, SKU veya barkod ara" />
            </label>
            <div className="market-list">
              {filteredProducts.map((product) => (
                <button type="button" className="market-list-row" key={product.id} onClick={() => editProduct(product)}>
                  <span>
                    <strong>{product.name}</strong>
                    <small>{product.sku || "SKU yok"} · {product.barcode || "Barkod yok"}</small>
                  </span>
                  <span className="market-list-value">{money(product.salePrice, product.currency)}</span>
                </button>
              ))}
              {filteredProducts.length === 0 && <p className="market-muted">Eşleşen ürün yok.</p>}
            </div>
          </section>

          <section className="market-panel">
            <header className="market-panel-heading">
              <span>{productForm.id ? "Düzenle" : "Yeni kayıt"}</span>
              <h2>Ürün Kartı</h2>
            </header>
            <div className="market-form-grid">
              <label className="market-field market-field-wide">Ürün adı<input value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="market-field">SKU<input value={productForm.sku} onChange={(event) => setProductForm((current) => ({ ...current, sku: event.target.value }))} /></label>
              <label className="market-field">Barkod<input value={productForm.barcode} onChange={(event) => setProductForm((current) => ({ ...current, barcode: event.target.value }))} /></label>
              <label className="market-field">Kategori<select value={productForm.categoryId} onChange={(event) => setProductForm((current) => ({ ...current, categoryId: event.target.value }))}><option value="">Kategorisiz</option>{categories.filter((category) => category.isActive).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
              <label className="market-field">Birim<select value={productForm.unit} onChange={(event) => setProductForm((current) => ({ ...current, unit: event.target.value as CommerceUnit }))}>{Object.entries(unitLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label className="market-field">Satış fiyatı<input type="number" min="0" step="0.01" value={productForm.salePrice} onChange={(event) => setProductForm((current) => ({ ...current, salePrice: event.target.value }))} /></label>
              <label className="market-field">Alış fiyatı<input type="number" min="0" step="0.01" value={productForm.purchasePrice} onChange={(event) => setProductForm((current) => ({ ...current, purchasePrice: event.target.value }))} /></label>
              <label className="market-field">Para birimi<input value={productForm.currency} maxLength={3} onChange={(event) => setProductForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} /></label>
              <label className="market-field">KDV %<input type="number" min="0" step="0.01" value={productForm.taxRate} onChange={(event) => setProductForm((current) => ({ ...current, taxRate: event.target.value }))} /></label>
              <label className="market-field">Minimum stok<input type="number" min="0" step="0.0001" value={productForm.minimumQuantity} onChange={(event) => setProductForm((current) => ({ ...current, minimumQuantity: event.target.value }))} /></label>
              <label className="market-field market-field-wide">Açıklama<textarea value={productForm.description} onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))} /></label>
              <label className="market-check"><input type="checkbox" checked={productForm.trackInventory} onChange={(event) => setProductForm((current) => ({ ...current, trackInventory: event.target.checked }))} /> Stok takip et</label>
              <label className="market-check"><input type="checkbox" checked={productForm.isActive} onChange={(event) => setProductForm((current) => ({ ...current, isActive: event.target.checked }))} /> Aktif ürün</label>
            </div>
            <div className="market-form-actions"><button type="button" onClick={() => void saveProduct()} disabled={dataState === "loading"}><Save size={16} aria-hidden="true" /> Ürünü kaydet</button></div>
          </section>

          <section className="market-panel market-span-all">
            <header className="market-panel-heading market-panel-heading-row">
              <div><span>Katalog</span><h2>Kategoriler</h2><p>Ürün gruplarını hiyerarşik olarak düzenleyin.</p></div>
              <button type="button" className="market-secondary-button" onClick={() => setCategoryForm(emptyCategoryForm())}><Plus size={16} aria-hidden="true" /> Yeni kategori</button>
            </header>
            <div className="market-category-layout">
              <div className="market-list compact">
                {categories.map((category) => (
                  <button type="button" className="market-list-row" key={category.id} onClick={() => editCategory(category)}>
                    <span><strong>{category.name}</strong><small>{category.code || "Kod yok"}{category.parentId ? " · alt kategori" : " · ana kategori"}</small></span>
                    <span className={category.isActive ? "market-badge" : "market-badge is-muted"}>{category.isActive ? "Aktif" : "Pasif"}</span>
                  </button>
                ))}
              </div>
              <div className="market-form-grid">
                <label className="market-field">Kategori adı<input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="market-field">Kod<input value={categoryForm.code} onChange={(event) => setCategoryForm((current) => ({ ...current, code: event.target.value }))} /></label>
                <label className="market-field">Üst kategori<select value={categoryForm.parentId} onChange={(event) => setCategoryForm((current) => ({ ...current, parentId: event.target.value }))}><option value="">Ana kategori</option>{categories.filter((category) => category.id !== categoryForm.id).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
                <label className="market-field">Sıra<input type="number" value={categoryForm.sortOrder} onChange={(event) => setCategoryForm((current) => ({ ...current, sortOrder: event.target.value }))} /></label>
                <label className="market-check"><input type="checkbox" checked={categoryForm.isActive} onChange={(event) => setCategoryForm((current) => ({ ...current, isActive: event.target.checked }))} /> Aktif kategori</label>
                <div className="market-form-actions market-field-wide"><button type="button" onClick={() => void saveCategory()} disabled={dataState === "loading"}><Save size={16} aria-hidden="true" /> Kaydet</button>{categoryForm.id && <button type="button" className="market-danger-button" onClick={() => void deleteCategory(categoryForm.id)}>Kategoriyi kaldır</button>}</div>
              </div>
            </div>
          </section>
        </div>
      ) : activeTab === "inventory" ? (
        <div className="market-two-column">
          <section className="market-panel">
            <header className="market-panel-heading"><span>Stok</span><h2>Fiziksel Sayım</h2><p>Buraya mevcut fiziksel miktarı yazın; delta hesabını store yapar.</p></header>
            <label className="market-field">Ürün<select value={inventoryProductId} onChange={(event) => setInventoryProductId(event.target.value)}><option value="">Ürün seçin</option>{products.filter((product) => product.trackInventory && product.isActive).map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
            {selectedInventoryProduct && (
              <div className="market-stock-card">
                <span>{selectedInventoryProduct.name}</span>
                <strong>{inventoryBalance?.quantity ?? "—"} {unitLabels[selectedInventoryProduct.unit]}</strong>
                <small>Minimum: {inventoryBalance?.minimumQuantity ?? 0}</small>
              </div>
            )}
            <label className="market-field">Sayılan miktar<input type="number" step="0.0001" value={countedQuantity} onChange={(event) => setCountedQuantity(event.target.value)} /></label>
            <label className="market-field">Sayım notu<textarea value={countNote} onChange={(event) => setCountNote(event.target.value)} placeholder="İsteğe bağlı" /></label>
            <div className="market-form-actions"><button type="button" onClick={() => void saveInventoryCount()} disabled={!inventoryProductId || dataState === "loading"}><Save size={16} aria-hidden="true" /> Sayımı kaydet</button></div>
          </section>
          <section className="market-panel">
            <header className="market-panel-heading"><span>Audit</span><h2>Stok Hareketleri</h2><p>Son 50 hareket; satış, alım ve sayım aynı kayıt zincirinde.</p></header>
            <div className="market-history-list">
              {inventoryMovements.map((movement) => (
                <div className="market-history-row" key={movement.id}>
                  <span><strong>{movement.type}</strong><small>{localDateTime(movement.createdAt)} · {movement.note || movement.referenceType || "Manuel hareket"}</small></span>
                  <span className={movement.quantityDelta >= 0 ? "is-positive" : "is-negative"}>{movement.quantityDelta >= 0 ? "+" : ""}{movement.quantityDelta} → {movement.quantityAfter}</span>
                </div>
              ))}
              {inventoryMovements.length === 0 && <p className="market-muted">Bu ürün için stok hareketi yok.</p>}
            </div>
          </section>
        </div>
      ) : activeTab === "purchasing" ? (
        <div className="market-two-column">
          {suppliersEnabled && (
            <section className="market-panel">
              <header className="market-panel-heading market-panel-heading-row"><div><span>Tedarik</span><h2>Tedarikçiler</h2><p>Alım kayıtlarında kullanılacak firma kartları.</p></div><button type="button" className="market-secondary-button" onClick={() => setSupplierForm(emptySupplierForm())}><Plus size={16} aria-hidden="true" /> Yeni</button></header>
              <div className="market-list compact">
                {suppliers.map((supplier) => <button type="button" className="market-list-row" key={supplier.id} onClick={() => editSupplier(supplier)}><span><strong>{supplier.name}</strong><small>{supplier.phone || supplier.email || "İletişim bilgisi yok"}</small></span><span className={supplier.isActive ? "market-badge" : "market-badge is-muted"}>{supplier.isActive ? "Aktif" : "Pasif"}</span></button>)}
              </div>
              <div className="market-form-grid market-form-divider">
                <label className="market-field market-field-wide">Tedarikçi adı<input value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="market-field">Telefon<input value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} /></label>
                <label className="market-field">E-posta<input value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} /></label>
                <label className="market-field">Vergi no<input value={supplierForm.taxNumber} onChange={(event) => setSupplierForm((current) => ({ ...current, taxNumber: event.target.value }))} /></label>
                <label className="market-field market-field-wide">Not<textarea value={supplierForm.notes} onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))} /></label>
                <label className="market-check"><input type="checkbox" checked={supplierForm.isActive} onChange={(event) => setSupplierForm((current) => ({ ...current, isActive: event.target.checked }))} /> Aktif tedarikçi</label>
                <div className="market-form-actions market-field-wide"><button type="button" onClick={() => void saveSupplier()} disabled={dataState === "loading"}><Save size={16} aria-hidden="true" /> Tedarikçiyi kaydet</button></div>
              </div>
            </section>
          )}

          {purchasingEnabled && (
            <section className="market-panel">
              <header className="market-panel-heading"><span>Alım</span><h2>Stok Girişi</h2><p>Teslim alınmış alımı tek transaction ile sipariş + stok hareketine dönüştürür.</p></header>
              {suppliersEnabled && <label className="market-field">Tedarikçi<select value={purchaseSupplierId} onChange={(event) => setPurchaseSupplierId(event.target.value)}><option value="">Tedarikçisiz alım</option>{suppliers.filter((supplier) => supplier.isActive).map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select></label>}
              <div className="market-purchase-lines">
                {purchaseLines.map((line, index) => (
                  <div className="market-purchase-line" key={line.key}>
                    <label className="market-field">Ürün<select value={line.productId} onChange={(event) => updatePurchaseLine(line.key, { productId: event.target.value })}><option value="">Ürün seçin</option>{products.filter((product) => product.trackInventory && product.isActive).map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
                    <label className="market-field">Miktar<input type="number" min="0" step="0.0001" value={line.quantity} onChange={(event) => updatePurchaseLine(line.key, { quantity: event.target.value })} /></label>
                    <label className="market-field">Birim maliyet<input type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => updatePurchaseLine(line.key, { unitCost: event.target.value })} /></label>
                    {purchaseLines.length > 1 && <button type="button" className="market-icon-button" aria-label={`${index + 1}. satırı kaldır`} onClick={() => setPurchaseLines((current) => current.filter((item) => item.key !== line.key))}>×</button>}
                  </div>
                ))}
              </div>
              <button type="button" className="market-secondary-button" onClick={() => setPurchaseLines((current) => [...current, createPurchaseLine(current.length)])}><PackagePlus size={16} aria-hidden="true" /> Kalem ekle</button>
              <label className="market-field market-form-divider">Alım notu<textarea value={purchaseNotes} onChange={(event) => setPurchaseNotes(event.target.value)} /></label>
              <div className="market-form-actions"><button type="button" onClick={() => void receivePurchase()} disabled={dataState === "loading" || !purchaseLines.some((line) => line.productId)}><Truck size={16} aria-hidden="true" /> Teslim al ve stoğa işle</button></div>
            </section>
          )}

          {purchasingEnabled && (
            <section className="market-panel market-span-all">
              <header className="market-panel-heading"><span>Geçmiş</span><h2>Son Alımlar</h2></header>
              <div className="market-history-list">
                {purchaseOrders.map((order) => {
                  const supplier = suppliers.find((item) => item.id === order.supplierId);
                  return <div className="market-history-row" key={order.id}><span><strong>{supplier?.name || "Tedarikçisiz alım"}</strong><small>{localDateTime(order.receivedAt)} · {order.status}</small></span><span>{money(order.total, order.currency)}</span></div>;
                })}
                {purchaseOrders.length === 0 && <p className="market-muted">Henüz alım kaydı yok.</p>}
              </div>
            </section>
          )}
        </div>
      ) : (
        <section className="market-panel">
          <header className="market-panel-heading"><span>Etiket</span><h2>Etiketler</h2><p>Çıktı adaptörleri M5 aşamasında bağlanacak.</p></header>
          <div className="market-placeholder-grid">
            <MarketEmptyState icon={Printer} title="Preview / PDF / PNG" description="İlk etiket adaptörü cihaz gerektirmeyen önizleme ve dosya çıktısı olacak." />
            <MarketEmptyState icon={Tags} title="Yazıcı adaptör yuvası" description="ZPL, TSPL ve sistem yazıcısı daha sonra aynı LabelPrinter sözleşmesine takılabilecek." />
          </div>
        </section>
      )}
    </section>
  );
}
