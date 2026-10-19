import { useEffect, useId, useRef, useState } from "react";
import { reportAppStatus } from "../../app/runtime-state";
import { useCustomerCreditAccount } from "../../app/use-customer-credit-account";
import { ActionButton } from "../ui/ActionButton";
import { CustomerCreditBalances } from "./CustomerCreditBalances";
import { CustomerCreditForm } from "./CustomerCreditForm";
import { CustomerCreditHistory, CustomerCreditMovement } from "./CustomerCreditHistory";
import { CustomerCreditWhatsAppShare } from "./CustomerCreditWhatsAppShare";
import type { EphemeralWhatsAppHandoff } from "../../app/whatsapp-handoff";

export function CustomerCreditPanel({ customerId, whatsappEnabled = false, onPreparedWhatsApp }: {
  customerId: string;
  whatsappEnabled?: boolean;
  onPreparedWhatsApp?: (message: EphemeralWhatsAppHandoff) => void;
}) {
  const { account, loading, error, reload } = useCustomerCreditAccount(customerId);
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<"payment" | "adjustment" | null>(null);
  const [saving, setSaving] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const debtExists = account?.balances.some((balance) => balance.amountMinor > 0) ?? false;

  useEffect(() => {
    if (expanded && form === null && !saving) toggle.current?.focus();
  }, [expanded, form, saving]);

  useEffect(() => {
    if (error) reportAppStatus("error", error);
  }, [error]);

  function closeForm() { setForm(null); }

  return <section className="panel record-stack customer-credit-panel" aria-label="Veresiye hesabı" aria-busy={loading}>
    <div className="customer-credit-heading"><h3>Veresiye</h3><span>Güncel borç</span></div>
    {loading && <p className="loading-state" role="status">Hesap yükleniyor…</p>}
    {error && <ActionButton variant="secondary" onClick={() => void reload()}>Hesabı Yenile</ActionButton>}
    {account && <>
      <CustomerCreditBalances balances={account.balances} />
      {!expanded && account.entries[0] && <div className="customer-credit-last">
        <small>Son hareket</small><div><CustomerCreditMovement entry={account.entries[0]} /></div>
      </div>}
      <div className="action-row">
        <ActionButton ref={toggle} variant="secondary" size="sm" aria-expanded={expanded} aria-controls={panelId}
          disabled={saving}
          onClick={() => { setExpanded((current) => !current); setForm(null); }}>{expanded ? "Hesabı Kapat" : "Hesabı Aç"}</ActionButton>
        {!account.customer.deletedAt && <ActionButton disabled={loading || !debtExists || form !== null} onClick={() => { setExpanded(true); setForm("payment"); }}>Tahsilat Al</ActionButton>}
      </div>
      {expanded && <div id={panelId} className="customer-credit-detail">
        <p><strong>{account.customer.fullName}</strong></p>
        {!form && !account.customer.deletedAt && <ActionButton variant="ghost" size="sm" disabled={loading} onClick={() => setForm("adjustment")}>Düzeltme</ActionButton>}
        {form && <CustomerCreditForm account={account} mode={form} loading={loading} onSavingChange={setSaving} onClose={closeForm} onSaved={(text) => { reportAppStatus("success", text); closeForm(); }} />}
        <CustomerCreditHistory account={account} />
        {whatsappEnabled && !account.customer.deletedAt && !form && <CustomerCreditWhatsAppShare account={account} disabled={loading || saving} readFresh={reload} {...(onPreparedWhatsApp === undefined ? {} : { onPrepared: onPreparedWhatsApp })} />}
      </div>}
    </>}
  </section>;
}
