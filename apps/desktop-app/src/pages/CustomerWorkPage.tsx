import { useState, type ReactNode } from "react";
import { SegmentedControl } from "../components/ui/SegmentedControl";

export type CustomerWorkTab = "requests" | "customers";

interface CustomerWorkPageProps {
  requests: ReactNode;
  customers: ReactNode;
}

export function CustomerWorkPage({ requests, customers }: CustomerWorkPageProps) {
  const [activeTab, setActiveTab] = useState<CustomerWorkTab>("requests");
  const content = activeTab === "requests" ? requests : customers;

  return (
    <section className="combined-page customer-work-page" aria-label="Müşteri işleri">
      <SegmentedControl
        className="customer-work-tabs"
        value={activeTab}
        ariaLabel="Müşteri işleri bölümleri"
        onChange={setActiveTab}
        options={[
          { id: "requests", label: "Talepler" },
          { id: "customers", label: "Müşteriler" }
        ]}
      />
      <div className={`customer-work-content is-${activeTab}`}>{content}</div>
    </section>
  );
}
