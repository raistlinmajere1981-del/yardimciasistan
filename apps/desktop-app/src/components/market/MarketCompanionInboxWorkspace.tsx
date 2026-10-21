import { RefreshCw, ShoppingCart, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CommerceSaleDraftDetail } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";

interface MarketCompanionInboxWorkspaceProps {
  cartDraftsEnabled: boolean;
  busy: boolean;
  onOpenCartDraft: (draft: CommerceSaleDraftDetail) => void;
  onStateChange: (state: "loading" | "success" | "error", message: string) => void;
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("tr-TR");
}

function sourceLabel(device: string, source: string) {
  return device || source || "Bilinmeyen telefon";
}

export function MarketCompanionInboxWorkspace({
  cartDraftsEnabled,
  busy,
  onOpenCartDraft,
  onStateChange
}: MarketCompanionInboxWorkspaceProps) {
  const bridge = window.yardimciDesktop?.commerce;
  const [cartDrafts, setCartDrafts] = useState<CommerceSaleDraftDetail[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!bridge || !cartDraftsEnabled) {
      setCartDrafts([]);
      return;
    }
    setLoading(true);
    try {
      setCartDrafts(await bridge.listCartDrafts({ status: "pending", limit: 300 }));
      onStateChange("success", "Telefon sepetleri güncellendi.");
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Telefon sepetleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [bridge, cartDraftsEnabled, onStateChange]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
            <span>Telefon Companion</span>
            <h2>Telefon Sepetleri</h2>
            <p>
              Telefonda hazırlanan sepetler burada bekler. Ürünler Yeni İşlem'e yüklenirken güncel katalog ve güncel fiyatla çözülür.
            </p>
          </div>
          <ActionButton variant="secondary" type="button" onClick={() => void reload()} disabled={disabled}>
            <RefreshCw size={16} aria-hidden="true" /> Yenile
          </ActionButton>
        </header>
      </section>

      {cartDraftsEnabled && (
        <section className="market-panel market-span-all">
          <header className="market-panel-heading">
            <span>Hazır sepetler</span>
            <h2>Bekleyen Telefon Sepetleri</h2>
            <p>Ödeme ve gerçek satış kaydı masaüstü Yeni İşlem ekranında tamamlanır.</p>
          </header>
          <div className="market-draft-list">
            {cartDrafts.map((detail) => (
              <article className="market-draft-card" key={detail.draft.id}>
                <div className="market-draft-card-title">
                  <Smartphone size={18} aria-hidden="true" />
                  <span>
                    <strong>{detail.items.length} kalem hazır sepet</strong>
                    <small>{sourceLabel(detail.draft.createdByDevice, detail.draft.source)} · {dateTime(detail.draft.createdAt)}</small>
                  </span>
                </div>
                <ul className="market-draft-items">
                  {detail.items.map((item) => (
                    <li key={item.id}>
                      <span>{item.productName || item.productId}</span>
                      <strong>× {item.quantity}</strong>
                    </li>
                  ))}
                </ul>
                {detail.draft.note && <p className="market-draft-note"><strong>Telefon notu:</strong> {detail.draft.note}</p>}
                <div className="market-draft-actions">
                  <ActionButton type="button" onClick={() => onOpenCartDraft(detail)} disabled={disabled}>
                    <ShoppingCart size={16} aria-hidden="true" /> Yeni İşlem'e Yükle
                  </ActionButton>
                  <ActionButton variant="secondary" type="button" onClick={() => void closeCartDraft(detail.draft.id)} disabled={disabled}>
                    Sepeti Kapat
                  </ActionButton>
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
