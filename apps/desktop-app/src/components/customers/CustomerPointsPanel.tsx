import { useEffect, useState } from "react";
import type { BenefitsPointAccount } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { BenefitsPointHistory } from "../marketing/BenefitsPointHistory";
import { benefitsValue } from "../marketing/benefits-model";

/** Read-only entry inside the canonical Customer workspace; no second modal/editor. */
export function CustomerPointsPanel({ customerId }: { customerId: string }) {
  const [expanded, setExpanded] = useState(false), [currency, setCurrency] = useState("TRY");
  const [account, setAccount] = useState<BenefitsPointAccount | null>(null), [error, setError] = useState("");
  useEffect(() => {
    let current = true; setAccount(null); setError("");
    if (expanded) void window.yardimciDesktop!.getCommercePointAccount(customerId, currency).then(result => {
      const value = benefitsValue(result); if (current) setAccount(value);
    }).catch(() => { if (current) setError("Puan hesabı okunamadı. Kapatıp yeniden açın."); });
    return () => { current = false; };
  }, [expanded, customerId, currency]);
  return <section className="panel record-stack" aria-label="Müşteri Puan hesabı" aria-busy={expanded && !account && !error}>
    <ActionButton variant="secondary" size="sm" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>Puan bakiyesi ve geçmişi</ActionButton>
    {expanded && <><label className="form-field">Puan para birimi<select value={currency} onChange={event => setCurrency(event.target.value)}>{["TRY", "USD", "EUR", "GBP"].map(value => <option key={value}>{value}</option>)}</select></label>
      {error && <p role="alert">{error}</p>}{account && <BenefitsPointHistory account={account} currency={currency} />}</>}
  </section>;
}
