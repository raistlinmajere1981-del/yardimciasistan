import { MarketCatalogPicker } from "./MarketCatalogPicker";
import { Save } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CatalogProduct, CommerceUnit, InventoryBalance, InventoryMovement } from "@yardimci-asistan/shared";
import { StatusBadge } from "../ui/StatusBadge";
import { ActionButton } from "../ui/ActionButton";

interface MarketInventoryWorkspaceProps {
  products: CatalogProduct[];
  busy: boolean;
  onStateChange: (state: "loading" | "success" | "error", message: string) => void;
  refreshRevision?: number;
  utilityAction?: ReactNode;
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

const movementTypeLabels: Record<string, string> = {
  count: "Fiziksel sayım",
  purchase: "Alım",
  sale: "Satış",
  adjustment: "Düzeltme",
  return: "İade"
};

function movementTypeLabel(type: string) {
  return movementTypeLabels[type] ?? type;
}

function localDateTime(value: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("tr-TR");
}

export function MarketInventoryWorkspace({ products, busy, onStateChange, refreshRevision = 0, utilityAction }: MarketInventoryWorkspaceProps) {
  const bridge = window.yardimciDesktop?.commerce;
  const trackedProducts = products.filter((product) => product.trackInventory && product.isActive);
  const [productId, setProductId] = useState("");
  const [pickedProduct, setPickedProduct] = useState<CatalogProduct | null>(null);
  const [balance, setBalance] = useState<InventoryBalance | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [countedQuantity, setCountedQuantity] = useState("0");
  const [note, setNote] = useState("");
  const requestGeneration = useRef(0);

  useEffect(() => {
    if (!productId && trackedProducts.length > 0) {
      const first = trackedProducts[0];
      if (first) setProductId(first.id);
    }
  }, [productId, trackedProducts]);

  useEffect(() => {
    const request = ++requestGeneration.current;
    if (!bridge || !productId) {
      setBalance(null);
      setMovements([]);
      return;
    }
    void Promise.all([
      bridge.getInventoryBalance(productId),
      bridge.listInventoryMovements({ productId, limit: 50 })
    ]).then(([nextBalance, nextMovements]) => {
      if (request !== requestGeneration.current) return;
      setBalance(nextBalance);
      setMovements(nextMovements);
      setCountedQuantity(String(nextBalance.quantity));
    }).catch((error) => {
      if (request !== requestGeneration.current) return;
      onStateChange("error", error instanceof Error ? error.message : "Stok bilgisi yüklenemedi.");
    });
    return () => {
      requestGeneration.current += 1;
    };
  }, [bridge, onStateChange, productId, refreshRevision]);

  async function saveCount() {
    if (!bridge || !productId) return;
    const request = requestGeneration.current;
    onStateChange("loading", "Fiziksel sayım kaydediliyor…");
    try {
      const result = await bridge.setInventoryCount({
        productId,
        countedQuantity: Number(countedQuantity),
        note,
        actorSource: "desktop-market"
      });
      if (request === requestGeneration.current) {
        setBalance(result.balance);
        setCountedQuantity(String(result.balance.quantity));
        setNote("");
      }
      const nextMovements = await bridge.listInventoryMovements({ productId, limit: 50 });
      if (request === requestGeneration.current) setMovements(nextMovements);
      onStateChange(
        "success",
        result.movement ? "Fiziksel stok sayımı kaydedildi." : "Sayım mevcut stokla aynı; hareket oluşturulmadı."
      );
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Stok sayımı kaydedilemedi.");
    }
  }

  const selectedProduct = products.find((product) => product.id === productId) ?? (pickedProduct?.id === productId ? pickedProduct : null);

  return (
    <div className="market-two-column">
      <section className="market-panel">
        <header className="market-panel-heading"><span>Stok</span><h2>Fiziksel Sayım</h2><p>Mevcut fiziksel miktarı yazın; fark sistem tarafından hesaplanır.</p></header>
        {utilityAction}
        <label className="market-field">
          Ürün
          <MarketCatalogPicker ariaLabel="Ürün" value={productId} products={products} onChange={setProductId} onProductSelected={setPickedProduct} disabled={busy} />
        </label>
        {selectedProduct && (
          <div className="market-stock-card">
            <span>{selectedProduct.name}</span>
            <strong>{balance?.quantity ?? "—"} {unitLabels[selectedProduct.unit]}</strong>
            <small>Minimum: {balance?.minimumQuantity ?? 0}</small>
            {balance && (
              <div className="market-stock-badge-row">
                <StatusBadge
                  tone={
                    balance.quantity <= 0
                      ? "danger"
                      : balance.quantity <= balance.minimumQuantity
                      ? "warning"
                      : "success"
                  }
                >
                  {balance.quantity <= 0
                    ? "Stok yok"
                    : balance.quantity <= balance.minimumQuantity
                    ? "Düşük stok"
                    : "Normal stok"}
                </StatusBadge>
              </div>
            )}
          </div>
        )}
        <label className="market-field">Sayılan miktar<input type="number" min="0" step="0.0001" value={countedQuantity} onChange={(event) => setCountedQuantity(event.target.value)} /></label>
        <label className="market-field">Sayım notu<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="İsteğe bağlı" /></label>
        <div className="market-form-actions"><ActionButton type="button" busy={busy} onClick={() => void saveCount()} disabled={!productId}><Save size={16} aria-hidden="true" /> Sayımı Kaydet</ActionButton></div>
      </section>

      <section className="market-panel">
        <header className="market-panel-heading"><span>Hareket Geçmişi</span><h2>Stok Hareketleri</h2><p>Son 50 hareket; satış, alım ve sayım aynı kayıt zincirinde.</p></header>
        <div className="market-history-list">
          {movements.map((movement) => (
            <div className="market-history-row" key={movement.id}>
              <span><strong>{movementTypeLabel(movement.type)}</strong><small>{localDateTime(movement.createdAt)} · {movement.note || movement.referenceType || "Manuel hareket"}</small></span>
              <span className={movement.quantityDelta >= 0 ? "is-positive" : "is-negative"}>{movement.quantityDelta >= 0 ? "+" : ""}{movement.quantityDelta} → {movement.quantityAfter}</span>
            </div>
          ))}
          {movements.length === 0 && <p className="market-muted">Bu ürün için stok hareketi yok.</p>}
        </div>
      </section>
    </div>
  );
}
