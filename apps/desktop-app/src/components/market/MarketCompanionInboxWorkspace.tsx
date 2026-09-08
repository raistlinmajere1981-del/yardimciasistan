import { CheckCircle2, RefreshCw, ShoppingCart, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
  CatalogProductDraft,
  CommerceSaleDraftDetail
} from "@yardimci-asistan/shared";

interface MarketCompanionInboxWorkspaceProps {
  catalogEnabled: boolean;
  cartDraftsEnabled: boolean;
  busy: boolean;
  onOpenProductDraft: (draft: CatalogProductDraft) => void;
  onOpenCartDraft: (draft: CommerceSaleDraftDetail) => void;
  onStateChange: (state: "loading" | "success" | "error", message: string) => void;
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("tr-TR");
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function sourceLabel(device: string, source: string) {
  return device || source || "Bilinmeyen telefon";
}

export function MarketCompanionInboxWorkspace({
  catalogEnabled,
  cartDraftsEnabled,
  busy,
  onOpenProductDraft,
  onOpenCartDraft,
  onStateChange
}: MarketCompanionInboxWorkspaceProps) {
  const bridge = window.yardimciDesktop?.commerce;
  const [productDrafts, setProductDrafts] = useState<CatalogProductDraft[]>([]);
  const [cartDrafts, setCartDrafts] = useState<CommerceSaleDraftDetail[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!bridge) return;
    setLoading(true);
    try {
      const [nextProductDrafts, nextCartDrafts] = await Promise.all([
        catalogEnabled ? bridge.listProductDrafts({ status: "pending", limit: 300 }) : Promise.resolve([]),
        cartDraftsEnabled ? bridge.listCartDrafts({ status: "pending", limit: 300 }) : Promise.resolve([])
      ]);
      setProductDrafts(nextProductDrafts);
      setCartDrafts(nextCartDrafts);
      onStateChange("success", "Telefon taslakları yerel masaüstü kayıtlarından güncellendi.");
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Telefon taslakları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [bridge, cartDraftsEnabled, catalogEnabled, onStateChange]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function closeProductDraft(draftId: string) {
    if (!bridge) return;
    onStateChange("loading", "Telefon ürün taslağı kapatılıyor…");
    try {
      await bridge.markProductDraftReviewed(draftId);
      await reload();
      onStateChange("success", "Telefon ürün taslağı kapatıldı.");
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Telefon ürün taslağı kapatılamadı.");
    }
  }

  async function closeCartDraft(draftId: string) {
    if (!bridge) return;
    onStateChange("loading", "Telefon sepeti kapatılıyor…");
    try {
      await bridge.markCartDraftReviewed(draftId);
      await reload();
      onStateChange("success", "Telefon sepeti kapatıldı.");
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Telefon sepeti kapatılamadı.");
    }
  }

  const disabled = busy || loading;

  return (
    <div className="market-companion-inbox">
      <section className="market-panel market-span-all">
        <header className="market-panel-heading market-panel-heading-row">
          <div>
            <span>Desktop Companion Inbox</span>
            <h2>Telefon Taslakları</h2>
            <p>
              Bu liste yerel masaüstü SQLite verisinden çevrimdışı çalışır. Bir taslağı forma veya sepete
              yüklemek onu kapatmaz; yalnız gerçek kayıt tamamlanınca reviewed olur.
            </p>
          </div>
          <button type="button" className="market-secondary-button" onClick={() => void reload()} disabled={disabled}>
            <RefreshCw size={16} aria-hidden="true" /> Yenile
          </button>
        </header>
      </section>

      {catalogEnabled && (
        <section className="market-panel">
          <header className="market-panel-heading">
            <span>Ürün önerileri</span>
            <h2>Yeni Ürün Taslakları</h2>
            <p>Telefon önerisini mevcut ürün kartında doğrulayın ve düzenleyin.</p>
          </header>
          <div className="market-draft-list">
            {productDrafts.map((draft) => (
              <article className="market-draft-card" key={draft.id}>
                <div className="market-draft-card-title">
                  <Smartphone size={18} aria-hidden="true" />
                  <span><strong>{draft.proposedName}</strong><small>{sourceLabel(draft.createdByDevice, draft.source)} · {dateTime(draft.createdAt)}</small></span>
                </div>
                <dl className="market-draft-facts">
                  <div><dt>Barkod</dt><dd>{draft.barcode || "—"}</dd></div>
                  <div><dt>SKU</dt><dd>{draft.sku || "—"}</dd></div>
                  <div><dt>Kategori</dt><dd>{draft.proposedCategory || "—"}</dd></div>
                  <div><dt>Birim</dt><dd>{draft.unit}</dd></div>
                  <div><dt>Alış</dt><dd>{money(draft.proposedPurchasePrice, draft.currency)}</dd></div>
                  <div><dt>Satış</dt><dd>{money(draft.proposedSalePrice, draft.currency)}</dd></div>
                </dl>
                {draft.note && <p className="market-draft-note"><strong>Telefon notu:</strong> {draft.note}</p>}
                <div className="market-draft-actions">
                  <button type="button" onClick={() => onOpenProductDraft(draft)} disabled={disabled}>
                    <CheckCircle2 size={16} aria-hidden="true" /> Ürün Kartına Aktar
                  </button>
                  <button type="button" className="market-secondary-button" onClick={() => void closeProductDraft(draft.id)} disabled={disabled}>
                    Taslağı Kapat
                  </button>
                </div>
              </article>
            ))}
            {!loading && productDrafts.length === 0 && <p className="market-muted">Bekleyen telefon ürün taslağı yok.</p>}
          </div>
        </section>
      )}

      {cartDraftsEnabled && (
        <section className="market-panel">
          <header className="market-panel-heading">
            <span>Hazır sepetler</span>
            <h2>Telefon Sepetleri</h2>
            <p>Ürünler yükleme anında güncel aktif katalogdan ve güncel satış fiyatıyla çözülür.</p>
          </header>
          <div className="market-draft-list">
            {cartDrafts.map((detail) => (
              <article className="market-draft-card" key={detail.draft.id}>
                <div className="market-draft-card-title">
                  <ShoppingCart size={18} aria-hidden="true" />
                  <span>
                    <strong>{detail.items.length} kalem hazır sepet</strong>
                    <small>{sourceLabel(detail.draft.createdByDevice, detail.draft.source)} · {dateTime(detail.draft.createdAt)}</small>
                  </span>
                </div>
                <ul className="market-draft-items">
                  {detail.items.map((item) => <li key={item.id}><span>{item.productName || item.productId}</span><strong>× {item.quantity}</strong></li>)}
                </ul>
                {detail.draft.note && <p className="market-draft-note"><strong>Telefon notu:</strong> {detail.draft.note}</p>}
                <div className="market-draft-actions">
                  <button type="button" onClick={() => onOpenCartDraft(detail)} disabled={disabled}>
                    <ShoppingCart size={16} aria-hidden="true" /> Hızlı Satış'a Yükle
                  </button>
                  <button type="button" className="market-secondary-button" onClick={() => void closeCartDraft(detail.draft.id)} disabled={disabled}>
                    Taslağı Kapat
                  </button>
                </div>
              </article>
            ))}
            {!loading && cartDrafts.length === 0 && <p className="market-muted">Bekleyen telefon sepeti yok.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
