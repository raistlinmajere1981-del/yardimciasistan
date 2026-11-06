import { useState } from "react";
import type { BenefitsPointAccount } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { Panel } from "../ui/Panel";
import { benefitsMoney } from "./benefits-model";

const kinds: Record<string, string> = { grant: "Puan kazanımı", spend: "Puan kullanımı", reversal: "İade", expiry: "Süre sonu", manual_adjustment: "Manuel düzeltme" };
export function BenefitsPointHistory({ account, currency }: { account: BenefitsPointAccount; currency: string }) {
  const [page, setPage] = useState(0), pageCount = Math.max(1, Math.ceil(account.entries.length / 20));
  const current = Math.min(page, pageCount - 1);
  return <>
    <Panel as="section" className="form-stack" aria-label="Puan özeti"><h3>Puan özeti</h3>
      <dl className="benefits-balances"><div><dt>Kullanılabilir puan</dt><dd>{benefitsMoney(account.availableMinor, currency)}</dd></div><div><dt>Ayrılmış puan</dt><dd>{benefitsMoney(account.reservedMinor, currency)}</dd></div><div><dt>Toplam bakiye</dt><dd>{benefitsMoney(account.postedMinor, currency)}</dd></div></dl>
    </Panel>
    <Panel as="section" className="form-stack" aria-label="Puan geçmişi"><header className="benefits-studio__heading"><h3>Puan hareketleri</h3><small>Son 100 hareket</small></header>
      {!account.entries.length && <p>Henüz puan hareketi yok.</p>}
      <ul className="benefits-history">{account.entries.slice(current * 20, (current + 1) * 20).map(entry => <li key={entry.id}>
        <div className="benefits-studio__heading"><strong>{kinds[entry.kind] ?? "Puan hareketi"}</strong><strong>{benefitsMoney(entry.amountMinor, currency)}</strong></div>
        <time dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleString("tr-TR")}</time>
        {entry.reason && <span>{entry.reason} · {entry.actor === "local-desktop-owner" ? "Yerel işletme yetkilisi" : "Yetkili işlem"}</span>}
        <small>{entry.expiresAt === null ? "Süresiz" : `Geçerlilik: ${new Date(entry.expiresAt).toLocaleDateString("tr-TR")}`}</small>
      </li>)}</ul>
      {pageCount > 1 && <div className="action-row"><ActionButton variant="quiet" disabled={current === 0} onClick={() => setPage(current - 1)}>Önceki hareketler</ActionButton><span>{current + 1} / {pageCount}</span><ActionButton variant="quiet" disabled={current + 1 >= pageCount} onClick={() => setPage(current + 1)}>Sonraki hareketler</ActionButton></div>}
    </Panel>
  </>;
}
