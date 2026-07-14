import { useState, type ReactNode } from "react";

export type CustomerWorkTab = "requests" | "customers" | "waiting";

interface CustomerWorkPageProps {
  requests: ReactNode;
  customers: ReactNode;
  waiting: ReactNode;
}

export function CustomerWorkPage({ requests, customers, waiting }: CustomerWorkPageProps) {
  const [activeTab, setActiveTab] = useState<CustomerWorkTab>("requests");
  const content = activeTab === "requests" ? requests : activeTab === "customers" ? customers : waiting;

  return (
    <section className="combined-page" aria-label="Müşteri işleri">
      <div className="page-tabs" role="tablist" aria-label="Müşteri işleri bölümleri">
        {([
          ["requests", "Yeni Talepler"],
          ["customers", "Müşteriler"],
          ["waiting", "Cevap Bekleyenler"]
        ] as Array<[CustomerWorkTab, string]>).map(([id, label]) => (
          <button
            className={activeTab === id ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            key={id}
          >
            {label}
          </button>
        ))}
      </div>
      {content}
    </section>
  );
}
