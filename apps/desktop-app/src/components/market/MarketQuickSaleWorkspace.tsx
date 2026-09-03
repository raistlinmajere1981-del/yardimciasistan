import { Barcode, Minus, Plus, Search, ShoppingCart, Trash2, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CatalogCategory, CatalogProduct, CommerceSale } from "@yardimci-asistan/shared";
import {
  createBarcodeSimulatorAdapter,
  createKeyboardBarcodeInputAdapter,
  type BarcodeScan
} from "../../app/barcode-input";
import "../../market-quick-sale-ux.css";

interface CartLine {
  productId: string;
  quantity: number;
}

type BarcodeMode = "keyboard-wedge" | "simulator";

interface MarketQuickSaleWorkspaceProps {
  products: CatalogProduct[];
  categories: CatalogCategory[];
  barcodeEnabled: boolean;
  busy: boolean;
  onSaleCompleted: (sale: CommerceSale) => Promise<void> | void;
  onError: (message: string) => void;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: number, currency = "TRY") {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function barcodeSourceLabel(scan: BarcodeScan) {
  if (scan.source === "keyboard-wedge") return "USB okuyucu";
  if (scan.source === "simulator") return "Simülatör";
  return "Kamera";
}

export function MarketQuickSaleWorkspace({
  products,
  categories,
  barcodeEnabled,
  busy,
  onSaleCompleted,
  onError
}: MarketQuickSaleWorkspaceProps) {
  const bridge = window.yardimciDesktop?.commerce;
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountTotal, setDiscountTotal] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [lastSale, setLastSale] = useState<CommerceSale | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [barcodeMode, setBarcodeMode] = useState<BarcodeMode>("keyboard-wedge");
  const [simulatedBarcode, setSimulatedBarcode] = useState("");
  const [barcodeMessage, setBarcodeMessage] = useState("USB okuyucu hazır; barkodu okutun.");
  const [scanning, setScanning] = useState(false);

  const simulatorAdapter = useMemo(() => createBarcodeSimulatorAdapter(), []);
  const keyboardAdapter = useMemo(() => createKeyboardBarcodeInputAdapter(), []);
  const activeProducts = useMemo(
    () => products.filter((product) => product.isActive),
    [products]
  );
  const productById = useMemo(
    () => new Map(activeProducts.map((product) => [product.id, product])),
    [activeProducts]
  );
  const cartCurrency = cart
    .map((line) => productById.get(line.productId)?.currency)
    .find((currency): currency is string => Boolean(currency)) ?? "";

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    return activeProducts.filter((product) => {
      if (categoryId && product.categoryId !== categoryId) return false;
      if (cartCurrency && product.currency !== cartCurrency) return false;
      if (!needle) return true;
      return [product.name, product.sku, product.barcode]
        .some((value) => value.toLocaleLowerCase("tr-TR").includes(needle));
    });
  }, [activeProducts, cartCurrency, categoryId, search]);

  const cartLines = cart.flatMap((line) => {
    const product = productById.get(line.productId);
    return product ? [{ ...line, product }] : [];
  });
  const subtotal = roundMoney(cartLines.reduce(
    (sum, line) => sum + (line.product.salePrice * line.quantity),
    0
  ));
  const discount = Math.max(0, Math.min(subtotal, roundMoney(Number(discountTotal) || 0)));
  const previewTotal = roundMoney(subtotal - discount);
  const currency = cartLines[0]?.product.currency ?? "TRY";

  const addProduct = useCallback((product: CatalogProduct) => {
    if (cartCurrency && product.currency !== cartCurrency) {
      onError("Tek satışta birden fazla para birimi kullanılamaz.");
      return false;
    }
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        return current.map((line) => line.productId === product.id
          ? { ...line, quantity: roundQuantity(line.quantity + 1) }
          : line);
      }
      return [...current, { productId: product.id, quantity: 1 }];
    });
    return true;
  }, [cartCurrency, onError]);

  const handleBarcodeScan = useCallback(async (scan: BarcodeScan) => {
    if (!barcodeEnabled || !bridge || busy || submitting || scanning) return;
    setScanning(true);
    setSearch("");
    setBarcodeMessage(`${barcodeSourceLabel(scan)}: ${scan.value} aranıyor…`);
    try {
      const product = await bridge.findProductByBarcode(scan.value);
      if (!product) {
        const message = `Barkod bulunamadı: ${scan.value}`;
        setBarcodeMessage(message);
        onError(message);
        return;
      }
      if (addProduct(product)) {
        setBarcodeMessage(`${product.name} sepete eklendi · ${barcodeSourceLabel(scan)}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Barkod okunamadı.";
      setBarcodeMessage(message);
      onError(message);
    } finally {
      setScanning(false);
    }
  }, [addProduct, barcodeEnabled, bridge, busy, onError, scanning, submitting]);

  useEffect(() => {
    if (!barcodeEnabled) return;
    const adapter = barcodeMode === "simulator" ? simulatorAdapter : keyboardAdapter;
    setBarcodeMessage(barcodeMode === "simulator"
      ? "Simülatör hazır; test barkodunu girin."
      : "USB okuyucu hazır; barkodu okutun.");
    return adapter.start((scan) => {
      void handleBarcodeScan(scan);
    });
  }, [barcodeEnabled, barcodeMode, handleBarcodeScan, keyboardAdapter, simulatorAdapter]);

  function setQuantity(productId: string, quantityInput: number) {
    const quantity = roundQuantity(quantityInput);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setCart((current) => current.filter((line) => line.productId !== productId));
      return;
    }
    setCart((current) => current.map((line) => line.productId === productId
      ? { ...line, quantity }
      : line));
  }

  function clearSale() {
    setCart([]);
    setDiscountTotal("0");
    setPaymentMethod("cash");
  }

  function submitSimulatedBarcode() {
    const scan = simulatorAdapter.submit(simulatedBarcode);
    if (scan) setSimulatedBarcode("");
  }

  async function completeSale() {
    if (!bridge) {
      onError("Commerce köprüsü kullanılamıyor.");
      return;
    }
    if (cartLines.length === 0) {
      onError("Satış için sepete en az bir ürün ekleyin.");
      return;
    }

    setSubmitting(true);
    try {
      const sale = await bridge.createPaidSale({
        items: cartLines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity
        })),
        discountTotal: discount,
        paymentMethod,
        source: "desktop-market-quick-sale"
      });
      setLastSale(sale);
      clearSale();
      await onSaleCompleted(sale);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Satış tamamlanamadı.");
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = busy || submitting;

  return (
    <div className="market-quick-sale-layout">
      <section className="market-panel market-sale-catalog">
        <header className="market-panel-heading">
          <span>Satış</span>
          <h2>Ürün Ekle</h2>
          <p>Ürün seçin, arayın veya etkinse barkod girişini kullanın.</p>
        </header>

        {barcodeEnabled && (
          <section className="market-barcode-panel" aria-label="Barkod girişi">
            <div className="market-barcode-heading">
              <span><Barcode size={17} aria-hidden="true" /><strong>Barkod Girişi</strong></span>
              <select value={barcodeMode} onChange={(event) => setBarcodeMode(event.target.value as BarcodeMode)} disabled={disabled || scanning}>
                <option value="keyboard-wedge">USB Klavye Okuyucu</option>
                <option value="simulator">Simülatör</option>
              </select>
            </div>
            {barcodeMode === "simulator" && (
              <div className="market-barcode-simulator">
                <input
                  value={simulatedBarcode}
                  onChange={(event) => setSimulatedBarcode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitSimulatedBarcode();
                  }}
                  placeholder="Test barkodu"
                  disabled={disabled || scanning}
                />
                <button type="button" className="market-secondary-button" onClick={submitSimulatedBarcode} disabled={disabled || scanning || !simulatedBarcode.trim()}>
                  Barkodu Gönder
                </button>
              </div>
            )}
            <small className="market-barcode-status" role="status" aria-live="polite">{barcodeMessage}</small>
          </section>
        )}

        <div className="market-sale-filters">
          <label className="market-search-field">
            <Search size={16} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ürün ara"
            />
          </label>
          <label className="market-field">
            Kategori
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Tümü</option>
              {categories.filter((category) => category.isActive).map((category) => (
                <option value={category.id} key={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="market-sale-product-grid">
          {filteredProducts.map((product) => (
            <button
              type="button"
              className="market-sale-product"
              key={product.id}
              onClick={() => addProduct(product)}
              disabled={disabled}
            >
              <span>
                <strong>{product.name}</strong>
                <small>{product.sku || product.barcode || "Kod yok"}</small>
              </span>
              <b>{money(product.salePrice, product.currency)}</b>
            </button>
          ))}
          {filteredProducts.length === 0 && (
            <p className="market-muted">Bu filtrelerle satılabilir ürün bulunamadı.</p>
          )}
        </div>
      </section>

      <section className="market-panel market-sale-cart">
        <header className="market-panel-heading market-panel-heading-row">
          <div>
            <span>Sepet</span>
            <h2>Hızlı Satış</h2>
            <p>{cartLines.length} kalem · fiyat ve stok doğrulaması ödeme anında backend tarafından yapılır.</p>
          </div>
          {cartLines.length > 0 && (
            <button type="button" className="market-secondary-button" onClick={clearSale} disabled={disabled}>
              <Trash2 size={16} aria-hidden="true" /> Temizle
            </button>
          )}
        </header>

        <div className="market-sale-cart-lines">
          {cartLines.map((line) => (
            <div className="market-sale-cart-line" key={line.product.id}>
              <div>
                <strong>{line.product.name}</strong>
                <small>{money(line.product.salePrice, line.product.currency)} / {line.product.unit}</small>
              </div>
              <div className="market-sale-quantity">
                <button type="button" aria-label={`${line.product.name} miktarını azalt`} onClick={() => setQuantity(line.product.id, line.quantity - 1)} disabled={disabled}>
                  <Minus size={15} aria-hidden="true" />
                </button>
                <input type="number" min="0.0001" step="0.0001" aria-label={`${line.product.name} miktarı`} value={line.quantity} onChange={(event) => setQuantity(line.product.id, Number(event.target.value))} disabled={disabled} />
                <button type="button" aria-label={`${line.product.name} miktarını artır`} onClick={() => setQuantity(line.product.id, line.quantity + 1)} disabled={disabled}>
                  <Plus size={15} aria-hidden="true" />
                </button>
              </div>
              <strong>{money(line.product.salePrice * line.quantity, line.product.currency)}</strong>
            </div>
          ))}
          {cartLines.length === 0 && (
            <div className="market-sale-empty-cart">
              <ShoppingCart size={28} aria-hidden="true" />
              <p>Satışa başlamak için soldan ürün ekleyin.</p>
            </div>
          )}
        </div>

        <div className="market-sale-payment">
          <label className="market-field">
            Ödeme yöntemi
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} disabled={disabled}>
              <option value="cash">Nakit</option>
              <option value="card">Kart</option>
              <option value="transfer">Havale / EFT</option>
              <option value="other">Diğer</option>
            </select>
          </label>
          <label className="market-field">
            İndirim
            <input type="number" min="0" step="0.01" value={discountTotal} onChange={(event) => setDiscountTotal(event.target.value)} disabled={disabled} />
          </label>
        </div>

        <div className="market-sale-totals">
          <span><small>Ara toplam</small><strong>{money(subtotal, currency)}</strong></span>
          <span><small>İndirim</small><strong>-{money(discount, currency)}</strong></span>
          <span className="market-sale-grand-total"><small>Ödenecek</small><strong>{money(previewTotal, currency)}</strong></span>
        </div>

        <button type="button" className="market-sale-complete" onClick={() => void completeSale()} disabled={disabled || cartLines.length === 0}>
          <WalletCards size={18} aria-hidden="true" />
          {submitting ? "Satış işleniyor…" : "Ödemeyi Al ve Satışı Tamamla"}
        </button>

        {lastSale && (
          <div className="market-sale-receipt" role="status">
            <strong>Satış tamamlandı</strong>
            <span>{money(lastSale.total, lastSale.currency)} · {lastSale.paymentMethod}</span>
            <small>İşlem: {lastSale.id}</small>
          </div>
        )}
      </section>
    </div>
  );
}
