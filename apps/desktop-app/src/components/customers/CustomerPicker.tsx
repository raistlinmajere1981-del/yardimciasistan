import { useId, useMemo, useState } from "react";
import type { DesktopCustomer } from "../../../electron/database";
import { useCustomerCreditAccount } from "../../app/use-customer-credit-account";
import { ActionButton } from "../ui/ActionButton";
import { CustomerCreditBalances } from "./CustomerCreditBalances";
import "../../customer-credit-ux.css";

export function CustomerPicker({ customers, value, onChange, disabled }: {
  customers: DesktopCustomer[];
  value: string;
  onChange: (customerId: string) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const labelId = useId();
  const options = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    const digits = needle.replace(/\D/g, "");
    return customers.filter((customer) => customer.id === value
      || customer.fullName.toLocaleLowerCase("tr-TR").includes(needle)
      || (digits.length > 0 && customer.phone.replace(/\D/g, "").includes(digits)));
  }, [customers, search, value]);
  const selected = customers.find((customer) => customer.id === value);

  return (
    <section className="customer-credit-picker" aria-labelledby={labelId}>
      <h3 id={labelId}>Veresiye müşterisi</h3>
      <label className="customer-credit-field">Müşteri ara
        <input type="search" placeholder="Ad veya telefon" value={search} onChange={(event) => setSearch(event.target.value)} disabled={disabled} />
      </label>
      <label className="customer-credit-field">Müşteri
        <select aria-label="Müşteri" value={selected?.id ?? ""} onChange={(event) => onChange(event.target.value)} disabled={disabled} required>
          <option value="">Kayıtlı müşteri seçin</option>
          {options.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}
        </select>
      </label>
      {!options.length && <p>Bu aramaya uygun müşteri yok. Yeni kayıt için Müşteriler ekranını kullanın.</p>}
      {selected ? <>
        <div className="customer-credit-actions"><strong>{selected.fullName}</strong>
          <ActionButton variant="ghost" size="sm" onClick={() => onChange("")} disabled={disabled}>Seçimi Temizle</ActionButton>
        </div>
        <SelectedCustomerDebt key={selected.id} customerId={selected.id} />
      </> : <p>Veresiye kaydetmek için bir müşteri seçin.</p>}
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
