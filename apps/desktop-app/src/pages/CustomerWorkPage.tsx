import { useState, type ReactNode } from "react";
import { SegmentedControl } from "../components/ui/SegmentedControl";

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
    <section className="combined-page customer-work-page" aria-label="Müşteri işleri">
      <SegmentedControl
        className="customer-work-tabs"
        value={activeTab}
        ariaLabel="Müşteri işleri bölümleri"
        onChange={setActiveTab}
        options={[
          { id: "requests", label: "Yeni Talepler" },
          { id: "customers", label: "Müşteriler" },
          { id: "waiting", label: "Cevap Bekleyenler" }
        ]}
      />
      {content}
    </section>
  );
}
