import { useEffect, useRef, useState } from "react";
import type { CustomerCreditAccountDetail, CustomerCreditEntry } from "@yardimci-asistan/shared";
import { customerCreditEntryLabels, customerCreditError, customerCreditPaymentLabels, formatCreditMoney } from "../../app/customer-credit-ui";
import { ActionButton } from "../ui/ActionButton";

export function CustomerCreditMovement({ entry }: { entry: CustomerCreditEntry }) {
  return <>
    <div>
      <strong>{customerCreditEntryLabels[entry.entryType]}</strong>
      <time dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })}</time>
      {entry.paymentMethod && <small>{customerCreditPaymentLabels[entry.paymentMethod]}</small>}
      {entry.saleId && <small>Satış kaydı</small>}
      {entry.note && <p>{entry.note}</p>}
    </div>
    <span className={entry.direction === "debit" ? "customer-credit-debt" : "customer-credit-paid"}>
      {entry.direction === "debit" ? "+" : "−"}{formatCreditMoney(entry.amountMinor, entry.currency)}
    </span>
  </>;
}

export function CustomerCreditHistory({ account }: { account: CustomerCreditAccountDetail }) {
  const [entries, setEntries] = useState(account.entries);
  const [hasMore, setHasMore] = useState(account.entries.length >= 200);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const version = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    version.current += 1;
    inFlight.current = false;
    setLoading(false);
    setEntries(account.entries);
    setHasMore(account.entries.length >= 200);
    setError("");
    return () => { version.current += 1; };
  }, [account]);

  async function loadMore() {
    if (inFlight.current) return;
    const bridge = window.yardimciDesktop?.commerce;
    if (!bridge) return;
    inFlight.current = true;
    const current = version.current;
    setLoading(true);
    setError("");
    try {
      const next = await bridge.listCustomerCreditEntries(account.customer.id, { offset: entries.length, limit: 200 });
      if (current === version.current) {
        setEntries((previous) => [...previous, ...next]);
        setHasMore(next.length >= 200);
      }
    } catch (cause) {
      if (current === version.current) setError(customerCreditError(cause, "Eski hareketler yüklenemedi."));
    } finally {
      if (current === version.current) { setLoading(false); inFlight.current = false; }
    }
  }

  return <section aria-label="Hesap hareketleri" className="customer-credit-history">
    <h4>Hesap hareketleri</h4>
    <ul>{entries.map((entry) => <li key={entry.id}><CustomerCreditMovement entry={entry} /></li>)}</ul>
    {!entries.length && <p>Henüz hesap hareketi yok.</p>}
    {error && <p role="alert">{error}</p>}
    {hasMore && <ActionButton variant="secondary" onClick={() => void loadMore()} disabled={loading}>{loading ? "Yükleniyor…" : "Daha Eski Hareketler"}</ActionButton>}
  </section>;
}
