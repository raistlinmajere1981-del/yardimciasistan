import { RecordPicker } from "../ui/RecordPicker";
import { useId } from "react";
import type { DesktopCustomer } from "../../../electron/database";
import { useCustomerCreditAccount } from "../../app/use-customer-credit-account";
import { ActionButton } from "../ui/ActionButton";
import { CustomerCreditBalances } from "./CustomerCreditBalances";

export function CustomerPicker({ customers, value, onChange, disabled, compact = false, showDebt = true, currency = "TRY" }: {
  customers: DesktopCustomer[];
  value: string;
  onChange: (customerId: string) => void;
  disabled: boolean;
  compact?: boolean;
  showDebt?: boolean;
  currency?: string;
}) {
  const labelId = useId();
  const selected = customers.find((customer) => customer.id === value);

  return (
    <section className={compact ? "record-stack customer-credit-picker customer-credit-picker--compact" : "panel record-stack customer-credit-picker"} aria-labelledby={labelId}>
      <h3 id={labelId}>{showDebt ? "Veresiye müşterisi" : "Satış müşterisi"}</h3>
      <label className="form-field form-field--medium">Müşteri
        <RecordPicker pickerType="customer" alphabetical ariaLabel="Müşteri" value={selected?.id ?? ""} placeholder="Kayıtlı müşteri seçin" disabled={disabled} onChange={onChange}
          searchPlaceholder="Ad veya telefon" options={customers.map(customer => ({ id: customer.id, label: customer.fullName, description: customer.phone }))}
          emptyMessage="Bu aramaya uygun müşteri yok. Yeni kayıt için Müşteriler ekranını kullanın." />
      </label>
      {selected ? <>
        <div className="action-row">{!compact && <strong>{selected.fullName}</strong>}
          <ActionButton variant="ghost" size="sm" onClick={() => onChange("")} disabled={disabled}>Seçimi Temizle</ActionButton>
        </div>
        {showDebt && <SelectedCustomerDebt key={selected.id} customerId={selected.id} compact={compact} currency={currency} />}
      </> : null}
    </section>
  );
}

function SelectedCustomerDebt({ customerId, compact, currency }: { customerId: string; compact: boolean; currency: string }) {
  const { account, loading, error, reload } = useCustomerCreditAccount(customerId);
  return <div aria-busy={loading}>
    <small>Mevcut borç</small>
    {loading ? null : error ? <>
      <p role="alert">{error}</p>
      <ActionButton variant="secondary" size="sm" onClick={() => void reload()}>Hesabı Yenile</ActionButton>
    </> : account && (compact ? <strong>{new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format((account.balances.find(balance => balance.currency === currency)?.amountMinor ?? 0) / 100)}</strong> : <CustomerCreditBalances balances={account.balances} />)}
  </div>;
}
