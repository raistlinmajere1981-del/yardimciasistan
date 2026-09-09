import { useEffect, useRef, useState } from "react";
import { moneyToMinor, type CustomerCreditAccountDetail, type CustomerCreditHistoryEntry, type CustomerCreditSaleDetail } from "@yardimci-asistan/shared";
import { customerCreditEntryLabels, customerCreditError, customerCreditPaymentLabels, formatCreditMoney } from "../../app/customer-credit-ui";
import { reportAppStatus } from "../../app/runtime-state";
import { ActionButton } from "../ui/ActionButton";

function CustomerCreditSaleItems({ detail }: { detail: CustomerCreditSaleDetail }) {
  const [expanded, setExpanded] = useState(false);
  const items = expanded ? detail.items : detail.items.slice(0, 4);
  const money = (amount: number) => formatCreditMoney(moneyToMinor(amount), detail.currency);
  return <div className="customer-credit-sale-detail">
    <ol aria-label="Satış kalemleri">{items.map((item) => <li key={item.id}>
      <span>{item.quantity.toLocaleString("tr-TR")} × {item.productName}</span>
      <small>{money(item.unitPrice)}/birim · {money(item.lineTotal)}</small>
    </li>)}</ol>
    {detail.items.length > 4 && <ActionButton variant="secondary" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
      {expanded ? "Daha az göster" : "Tüm kalemleri göster"}
    </ActionButton>}
    {detail.discountTotal > 0 && <dl className="customer-credit-sale-summary">
      <div><dt>Ara toplam</dt><dd>{money(detail.subtotal)}</dd></div>
      <div><dt>İndirim</dt><dd>−{money(detail.discountTotal)}</dd></div>
      <div><dt>Veresiye satış toplamı</dt><dd>{money(detail.total)}</dd></div>
    </dl>}
  </div>;
}

export function CustomerCreditMovement({ entry }: { entry: CustomerCreditHistoryEntry }) {
  return <>
    <div>
      <strong>{customerCreditEntryLabels[entry.entryType]}</strong>
      <time dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })}</time>
      {entry.paymentMethod && <small>{customerCreditPaymentLabels[entry.paymentMethod]}</small>}
      {entry.note && <p>{entry.note}</p>}
    </div>
    <span className={entry.direction === "debit" ? "customer-credit-debt" : "customer-credit-paid"}>
      {entry.direction === "debit" ? "+" : "−"}{formatCreditMoney(entry.amountMinor, entry.currency)}
    </span>
    {entry.entryType === "credit_sale" && entry.saleId !== null && (
      entry.saleDetail?.items.length ? <CustomerCreditSaleItems key={entry.saleId} detail={entry.saleDetail} />
        : <small className="customer-credit-sale-detail">Satış ayrıntısı bulunamadı.</small>
    )}
  </>;
}

export function CustomerCreditHistory({ account }: { account: CustomerCreditAccountDetail }) {
  const [entries, setEntries] = useState(account.entries);
  const [hasMore, setHasMore] = useState(account.entries.length >= 200);
  const [loading, setLoading] = useState(false);
  const version = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    version.current += 1;
    inFlight.current = false;
    setLoading(false);
    setEntries(account.entries);
    setHasMore(account.entries.length >= 200);
    return () => { version.current += 1; };
  }, [account]);

  async function loadMore() {
    if (inFlight.current) return;
    const bridge = window.yardimciDesktop?.commerce;
    if (!bridge) return;
    inFlight.current = true;
    const current = version.current;
    setLoading(true);
    try {
      const next = await bridge.listCustomerCreditEntries(account.customer.id, { offset: entries.length, limit: 200 });
      if (current === version.current) {
        setEntries((previous) => [...previous, ...next]);
        setHasMore(next.length >= 200);
      }
    } catch (cause) {
      if (current === version.current) reportAppStatus("error", customerCreditError(cause, "Eski hareketler yüklenemedi."));
    } finally {
      if (current === version.current) { setLoading(false); inFlight.current = false; }
    }
  }

  return <section aria-label="Hesap hareketleri" className="customer-credit-history">
    <h4>Hesap hareketleri</h4>
    <ul>{entries.map((entry) => <li key={entry.id}><CustomerCreditMovement entry={entry} /></li>)}</ul>
    {!entries.length && <p>Henüz hesap hareketi yok.</p>}
    {hasMore && <ActionButton variant="secondary" onClick={() => void loadMore()} disabled={loading}>{loading ? "Yükleniyor…" : "Daha Eski Hareketler"}</ActionButton>}
  </section>;
}
