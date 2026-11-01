import { useEffect, useRef, useState } from "react";
import { formatMinorCurrency } from "@yardimci-asistan/shared";
import type { FullRefundMarketSalePreview, MarketSaleHistoryCursor, MarketSaleHistoryItem } from "../../../electron/market-sale-full-refund";
import { ActionButton } from "../ui/ActionButton";

/** A projection only; every selection is checked against the refund owner again. */
export function MarketSaleHistory({ onClose, onSelect }: { onClose: () => void; onSelect: (preview: FullRefundMarketSalePreview) => void }) {
  const bridge = window.yardimciDesktop?.commerce;
  const [items, setItems] = useState<MarketSaleHistoryItem[]>([]);
  const [cursor, setCursor] = useState<MarketSaleHistoryCursor | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const scope = useRef<{ businessId: string; actorId: string } | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    let alive = true;
    const requests = generation;
    if (!bridge?.listMarketSaleHistory) { setMessage("Satış geçmişi kullanılamıyor."); setBusy(false); return; }
    void bridge.listMarketSaleHistory({ limit: 30 }).then(page => {
      if (!alive) return;
      scope.current = { businessId: page.businessId, actorId: page.actorId };
      setItems(page.items); setCursor(page.nextCursor);
    }).catch(() => { if (alive) setMessage("Satış geçmişi yüklenemedi."); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; requests.current++; };
  }, [bridge]);

  async function more() {
    if (!bridge || !cursor || busy || !scope.current) return;
    const request = ++generation.current, expected = scope.current;
    setBusy(true); setMessage("");
    try {
      const page = await bridge.listMarketSaleHistory({ limit: 30, cursor });
      if (request !== generation.current) return;
      if (page.businessId !== expected.businessId || page.actorId !== expected.actorId) { onClose(); return; }
      setItems(previous => [...previous, ...page.items]); setCursor(page.nextCursor);
    } catch { if (request === generation.current) setMessage("Satış geçmişi yüklenemedi."); }
    finally { if (request === generation.current) setBusy(false); }
  }

  async function inspect(saleId: string) {
    if (!bridge || busy || !scope.current) return;
    const request = ++generation.current, expected = scope.current;
    setBusy(true); setMessage("");
    try {
      const preview = await bridge.getFullRefundMarketSalePreview(saleId);
      const current = await bridge.listMarketSaleHistory({ limit: 1 });
      if (request !== generation.current) return;
      if (current.businessId !== expected.businessId || current.actorId !== expected.actorId
        || preview.businessId !== expected.businessId || preview.actorId !== expected.actorId || preview.saleId !== saleId) { onClose(); return; }
      if (!preview.eligible || preview.refunded) { setMessage(preview.reason || "Bu satış iade için uygun değil."); return; }
      onSelect(preview);
    } catch { if (request === generation.current) setMessage("Satış doğrulanamadı."); }
    finally { if (request === generation.current) setBusy(false); }
  }

  return <section aria-label="Satış Geçmişi" className="panel form-stack">
    <div className="page-toolbar"><h3>Satış Geçmişi</h3><ActionButton variant="secondary" size="sm" onClick={onClose}>Kapat</ActionButton></div>
    {message && <p role="status">{message}</p>}
    {!busy && items.length === 0 && <p>Satış bulunamadı.</p>}
    <div className="finance-entry-list">{items.map(item => <article className="finance-entry-item" key={item.saleId} data-sale-id={item.saleId}>
      <div className="finance-entry-item__main"><strong>{item.customerName || "Market satışı"}</strong>
        <span>{new Date(item.date).toLocaleString("tr-TR")} · {item.source === "android-market-sale" && <>Telefon · </>}{paymentLabel(item.paymentMethod)} · Kasa {formatMinorCurrency(item.cashMinor, item.currency)} · Puan {formatMinorCurrency(item.pointsMinor, item.currency)}</span></div>
      <b>{formatMinorCurrency(item.totalMinor, item.currency)}</b>
      {item.refunded ? <span>İade edildi</span> : <ActionButton variant="secondary" size="sm" disabled={busy} onClick={() => void inspect(item.saleId)}>İncele</ActionButton>}
    </article>)}</div>
    {cursor && <ActionButton variant="secondary" disabled={busy} onClick={() => void more()}>Daha eski satışlar</ActionButton>}
    {busy && <p role="status">Yükleniyor…</p>}
  </section>;
}

function paymentLabel(method: string) {
  if (method === "cash") return "Nakit";
  if (method === "card") return "Kart";
  if (method === "bank" || method === "transfer") return "Banka / Havale";
  return "Diğer";
}
