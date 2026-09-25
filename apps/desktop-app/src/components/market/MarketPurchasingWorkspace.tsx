import { PackagePlus, Plus, Save, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { BUSINESS_CAPABILITIES, parseMoneyToMajor, type CatalogProduct, type CommercePurchaseOrder, type CommerceSupplier } from "@yardimci-asistan/shared";
import { runtimeHasCapability } from "../../app/capabilities";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import { MoneyInput } from "../ui/MoneyInput";

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

interface MarketPurchasingWorkspaceProps {
  products: CatalogProduct[];
  busy: boolean;
  onStateChange: (state: "loading" | "success" | "error", message: string) => void;
}

function emptySupplierForm(): SupplierFormState {
  return { id: "", name: "", phone: "", email: "", taxNumber: "", notes: "", isActive: true };
}

function createPurchaseLine(index: number): PurchaseLineState {
  return { key: `purchase-line-${Date.now()}-${index}`, productId: "", quantity: "1", unitCost: "" };
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

export function MarketPurchasingWorkspace({ products, busy, onStateChange }: MarketPurchasingWorkspaceProps) {
  const bridge = window.yardimciDesktop?.commerce;
  const { snapshot } = useBusinessCapabilityRuntime();
  const C = BUSINESS_CAPABILITIES;
  const suppliersEnabled = runtimeHasCapability(snapshot, C.RETAIL_SUPPLIERS);
  const purchasingEnabled = runtimeHasCapability(snapshot, C.RETAIL_PURCHASING);
  const [suppliers, setSuppliers] = useState<CommerceSupplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<CommercePurchaseOrder[]>([]);
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(emptySupplierForm);
  const [purchaseSupplierId, setPurchaseSupplierId] = useState("");
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLineState[]>([createPurchaseLine(0)]);

  async function reload() {
    if (!bridge) return;
    const [nextSuppliers, nextOrders] = await Promise.all([
      suppliersEnabled ? bridge.listSuppliers({ limit: 500 }) : Promise.resolve([]),
      purchasingEnabled ? bridge.listPurchaseOrders({ limit: 100 }) : Promise.resolve([])
    ]);
    setSuppliers(nextSuppliers);
    setPurchaseOrders(nextOrders);
  }

  useEffect(() => {
    void reload().catch((error) => {
      onStateChange("error", error instanceof Error ? error.message : "Tedarik verileri yüklenemedi.");
    });
    // Capability değiştiğinde kendi runtime sınırımıza göre yeniden yükle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchasingEnabled, suppliersEnabled]);

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
    onStateChange("loading", "Tedarikçi kaydediliyor…");
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
      await reload();
      onStateChange("success", `${saved.name} tedarikçisi kaydedildi.`);
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Tedarikçi kaydedilemedi.");
    }
  }

  function updatePurchaseLine(key: string, patch: Partial<PurchaseLineState>) {
    setPurchaseLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  async function receivePurchase() {
    if (!bridge) return;
    const items: { productId: string; quantity: number; unitCost: number }[] = [];
    for (const line of purchaseLines) {
      if (!line.productId) continue;
      const unitCost = parseMoneyToMajor(line.unitCost);
      if (unitCost === null || unitCost < 0) {
        onStateChange("error", "Birim maliyet için geçerli bir tutar girin (örn. 125,50).");
        return;
      }
      items.push({
        productId: line.productId,
        quantity: Number(line.quantity),
        unitCost
      });
    }
    onStateChange("loading", "Alım stoğa işleniyor…");
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
      await reload();
      onStateChange("success", `${result.items.length} kalem stok girişi tamamlandı.`);
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Alım kaydedilemedi.");
    }
  }

  return (
    <div className="market-two-column">
      {suppliersEnabled && (
        <section className="market-panel">
          <header className="market-panel-heading market-panel-heading-row">
            <div><span>Tedarik</span><h2>Tedarikçiler</h2><p>Alım kayıtlarında kullanılacak firma kartları.</p></div>
            <button type="button" className="market-secondary-button" onClick={() => setSupplierForm(emptySupplierForm())}><Plus size={16} aria-hidden="true" /> Yeni</button>
          </header>
          <div className="market-list compact">
            {suppliers.map((supplier) => (
              <button type="button" className="market-list-row" key={supplier.id} onClick={() => editSupplier(supplier)}>
                <span><strong>{supplier.name}</strong><small>{supplier.phone || supplier.email || "İletişim bilgisi yok"}</small></span>
                <span className={supplier.isActive ? "market-badge" : "market-badge is-muted"}>{supplier.isActive ? "Aktif" : "Pasif"}</span>
              </button>
            ))}
          </div>
          <div className="market-form-grid market-form-divider">
            <label className="market-field market-field-wide">Tedarikçi adı<input value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="market-field">Telefon<input value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} /></label>
            <label className="market-field">E-posta<input value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label className="market-field">Vergi no<input value={supplierForm.taxNumber} onChange={(event) => setSupplierForm((current) => ({ ...current, taxNumber: event.target.value }))} /></label>
            <label className="market-field market-field-wide">Not<textarea value={supplierForm.notes} onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            <label className="market-check"><input type="checkbox" checked={supplierForm.isActive} onChange={(event) => setSupplierForm((current) => ({ ...current, isActive: event.target.checked }))} /> Aktif tedarikçi</label>
            <div className="market-form-actions market-field-wide"><button type="button" onClick={() => void saveSupplier()} disabled={busy}><Save size={16} aria-hidden="true" /> Tedarikçiyi kaydet</button></div>
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
                <label className="market-field">Birim maliyet<MoneyInput value={line.unitCost} onChange={(unitCost) => updatePurchaseLine(line.key, { unitCost })} /></label>
                {purchaseLines.length > 1 && <button type="button" className="market-icon-button" aria-label={`${index + 1}. satırı kaldır`} onClick={() => setPurchaseLines((current) => current.filter((item) => item.key !== line.key))}>×</button>}
              </div>
            ))}
          </div>
          <button type="button" className="market-secondary-button" onClick={() => setPurchaseLines((current) => [...current, createPurchaseLine(current.length)])}><PackagePlus size={16} aria-hidden="true" /> Kalem ekle</button>
          <label className="market-field market-form-divider">Alım notu<textarea value={purchaseNotes} onChange={(event) => setPurchaseNotes(event.target.value)} /></label>
          <div className="market-form-actions"><button type="button" onClick={() => void receivePurchase()} disabled={busy || !purchaseLines.some((line) => line.productId)}><Truck size={16} aria-hidden="true" /> Teslim al ve stoğa işle</button></div>
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
  );
}
