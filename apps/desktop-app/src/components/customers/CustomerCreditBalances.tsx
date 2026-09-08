import type { CustomerCreditBalance } from "@yardimci-asistan/shared";
import { formatCreditMoney } from "../../app/customer-credit-ui";

export function CustomerCreditBalances({ balances }: { balances: CustomerCreditBalance[] }) {
  return (
    <dl className="customer-credit-balances" aria-label="Güncel borç">
      {balances.length ? balances.map((balance) => (
        <div key={balance.currency}>
          <dt>{balance.currency}</dt>
          <dd>{formatCreditMoney(balance.amountMinor, balance.currency)}</dd>
        </div>
      )) : <div><dt>Güncel borç</dt><dd>Borç yok.</dd></div>}
    </dl>
  );
}
