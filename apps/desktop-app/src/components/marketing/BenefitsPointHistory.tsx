import type { BenefitsPointAccount } from "@yardimci-asistan/shared";
import { benefitsMoney } from "./benefits-model";

const kinds: Record<string, string> = { grant: "Puan kazanımı", spend: "Puan kullanımı", reversal: "İade", expiry: "Süre sonu", manual_adjustment: "Manuel düzeltme" };
export function BenefitsPointHistory({ account, currency }: { account: BenefitsPointAccount; currency: string }) {
  return <div className="form-stack">
    <dl className="marketing-counts"><div><dt>Kullanılabilir Puan</dt><dd>{benefitsMoney(account.availableMinor, currency)}</dd></div><div><dt>Ayrılan Puan</dt><dd>{benefitsMoney(account.reservedMinor, currency)}</dd></div><div><dt>Kayıtlı bakiye</dt><dd>{benefitsMoney(account.postedMinor, currency)}</dd></div></dl>
    <details><summary>Puan geçmişi · son 100 hareket</summary>
      {!account.entries.length && <p>Henüz Puan hareketi yok.</p>}
      <ul className="record-stack benefits-history">{account.entries.map(entry => <li key={entry.id}><strong>{kinds[entry.kind] ?? "Puan hareketi"} · {benefitsMoney(entry.amountMinor, currency)}</strong><small>{new Date(entry.createdAt).toLocaleString("tr-TR")}{entry.expiresAt !== null && ` · Geçerlilik: ${new Date(entry.expiresAt).toLocaleDateString("tr-TR")}`}</small>{entry.reason && <span>{entry.reason} · {entry.actor === "local-desktop-owner" ? "Yerel işletme yetkilisi" : "Yetkili işlem"}</span>}</li>)}</ul>
    </details>
  </div>;
}
