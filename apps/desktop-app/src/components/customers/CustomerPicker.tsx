import { RecordPicker } from "../ui/RecordPicker";
import { useId } from "react";
import type { DesktopCustomer } from "../../../electron/database";
import { useCustomerCreditAccount } from "../../app/use-customer-credit-account";
import { ActionButton } from "../ui/ActionButton";
import { CustomerCreditBalances } from "./CustomerCreditBalances";

export function CustomerPicker({ customers, value, onChange, disabled, compact = false, showDebt = true, currency = "TRY", onCreateCustomer }: {
  customers: DesktopCustomer[];
  value: string;
  onChange: (customerId: string) => void;
  disabled: boolean;
  compact?: boolean;
  showDebt?: boolean;
  currency?: string;
  onCreateCustomer?: () => void;
}) {
  const labelId = useId();
  const selected = customers.find((customer) => customer.id === value);

  return (
    <section className={compact ? "record-stack customer-credit-picker customer-credit-picker--compact" : "panel record-stack customer-credit-picker"} aria-labelledby={compact ? undefined : labelId} aria-label={compact ? (showDebt ? "Veresiye müşterisi" : "Satış müşterisi") : undefined}>
      {!compact && <h3 id={labelId}>{showDebt ? "Veresiye müşterisi" : "Satış müşterisi"}</h3>}
      <div className={`market-inline-field${onCreateCustomer ? " customer-credit-picker-actions" : ""}`}>
        <label className="form-field form-field--medium">{!compact && "Müşteri"}
          <RecordPicker pickerType="customer" alphabetical ariaLabel="Müşteri" value={selected?.id ?? ""} placeholder="Kayıtlı müşteri seçin" disabled={disabled} onChange={onChange}
            searchPlaceholder="Ad veya telefon" options={customers.map(customer => ({ id: customer.id, label: customer.fullName, description: customer.phone }))}
            emptyMessage="Bu aramaya uygun müşteri yok. Yeni kayıt için Müşteriler ekranını kullanın." />
        </label>
        {onCreateCustomer && <ActionButton variant="secondary" size="sm" type="button" fullWidth onClick={onCreateCustomer} disabled={disabled}>Yeni müşteri</ActionButton>}
        <ActionButton variant="ghost" size="sm" type="button" onClick={() => onChange("")} disabled={disabled || !selected}>Temizle</ActionButton>
      </div>
      {selected ? <>
        {!compact && <strong>{selected.fullName}</strong>}
        {showDebt && <SelectedCustomerDebt key={selected.id} customerId={selected.id} compact={compact} currency={currency} />}
      </> : null}
    </section>
  );
}

export function SelectedCustomerDebt({ customerId, compact, currency }: { customerId: string; compact: boolean; currency: string }) {
  const state = useCustomerCreditAccount(customerId);
  return <CustomerCreditDebt state={state} compact={compact} currency={currency} />;
}

export function CustomerCreditDebt({ state, compact, currency }: {
  state: ReturnType<typeof useCustomerCreditAccount>; compact: boolean; currency: string;
}) {
  const { account, loading, error, reload } = state;
  return <div className="customer-credit-selected-debt" aria-busy={loading}>
    <small>Mevcut borç</small>
    {loading ? null : error ? <>
      <p role="alert">{error}</p>
      <ActionButton variant="secondary" size="sm" onClick={() => void reload()}>Hesabı Yenile</ActionButton>
    </> : account && (compact ? <strong>{new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format((account.balances.find(balance => balance.currency === currency)?.amountMinor ?? 0) / 100)}</strong> : <CustomerCreditBalances balances={account.balances} />)}
  </div>;
}
