import { useEffect, useState, type ReactNode } from "react";
import { SegmentedControl } from "../components/ui/SegmentedControl";

export type CustomerWorkTab = "requests" | "customers";

interface CustomerWorkPageProps {
  requestsEnabled: boolean;
  requests: ReactNode;
  customers: ReactNode;
}

export function CustomerWorkPage({ requestsEnabled, requests, customers }: CustomerWorkPageProps) {
  const [activeTab, setActiveTab] = useState<CustomerWorkTab>(requestsEnabled ? "requests" : "customers");

  useEffect(() => {
    if (!requestsEnabled && activeTab === "requests") {
      setActiveTab("customers");
    }
  }, [activeTab, requestsEnabled]);

  const content = requestsEnabled && activeTab === "requests" ? requests : customers;

  return (
    <section className="combined-page customer-work-page" aria-label="Müşteri işleri">
      {requestsEnabled && (
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
      )}
      <div className={`customer-work-content is-${requestsEnabled ? activeTab : "customers"}`}>{content}</div>
    </section>
  );
}
