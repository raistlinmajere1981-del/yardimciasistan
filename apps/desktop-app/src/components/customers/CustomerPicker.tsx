import { SearchSelect } from "../ui/SearchSelect";
import { useId } from "react";
import type { DesktopCustomer } from "../../../electron/database";
import { useCustomerCreditAccount } from "../../app/use-customer-credit-account";
import { ActionButton } from "../ui/ActionButton";
import { CustomerCreditBalances } from "./CustomerCreditBalances";

export function CustomerPicker({ customers, value, onChange, disabled }: {
  customers: DesktopCustomer[];
  value: string;
  onChange: (customerId: string) => void;
  disabled: boolean;
}) {
  const labelId = useId();
  const selected = customers.find((customer) => customer.id === value);

  return (
    <section className="panel record-stack customer-credit-picker" aria-labelledby={labelId}>
      <h3 id={labelId}>Veresiye müşterisi</h3>
      <label className="form-field form-field--medium">Müşteri
        <SearchSelect ariaLabel="Müşteri" value={selected?.id ?? ""} placeholder="Kayıtlı müşteri seçin" disabled={disabled} onChange={onChange}
          searchPlaceholder="Ad veya telefon" options={customers.map(customer => ({ id: customer.id, label: customer.fullName, description: customer.phone }))}
          emptyMessage="Bu aramaya uygun müşteri yok. Yeni kayıt için Müşteriler ekranını kullanın." />
      </label>
      {selected ? <>
        <div className="action-row"><strong>{selected.fullName}</strong>
          <ActionButton variant="ghost" size="sm" onClick={() => onChange("")} disabled={disabled}>Seçimi Temizle</ActionButton>
        </div>
        <SelectedCustomerDebt key={selected.id} customerId={selected.id} />
      </> : null}
    </section>
  );
}

function SelectedCustomerDebt({ customerId }: { customerId: string }) {
  const { account, loading, error, reload } = useCustomerCreditAccount(customerId);
  return <div aria-busy={loading}>
    <small>Mevcut borç</small>
    {loading ? <p role="status">Hesap yükleniyor…</p> : error ? <>
      <p role="alert">{error}</p>
      <ActionButton variant="secondary" size="sm" onClick={() => void reload()}>Hesabı Yenile</ActionButton>
    </> : account && <CustomerCreditBalances balances={account.balances} />}
  </div>;
}
