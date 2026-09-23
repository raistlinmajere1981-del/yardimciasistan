import { useEffect, useState, type ReactNode } from "react";
import { FeatureViewSelector } from "../components/workspace/FeatureViewSelector";
import { FeatureWorkspacePage } from "../components/workspace/FeatureWorkspacePage";

export type CustomerWorkTab = "requests" | "customers";

interface CustomerWorkPageProps {
  requestsEnabled: boolean;
  requests: ReactNode;
  customers: ReactNode;
}

export function CustomerWorkPage({ requestsEnabled, requests, customers }: CustomerWorkPageProps) {
  const [activeTab, setActiveTab] = useState<CustomerWorkTab>(requestsEnabled ? "requests" : "customers");

  useEffect(() => {
    if (!requestsEnabled && activeTab === "requests") setActiveTab("customers");
  }, [activeTab, requestsEnabled]);

  const views: readonly { id: CustomerWorkTab; label: string }[] = requestsEnabled
    ? [{ id: "requests", label: "Talepler" }, { id: "customers", label: "Müşteriler" }]
    : [{ id: "customers", label: "Müşteriler" }];
  const content = requestsEnabled && activeTab === "requests" ? requests : customers;
  const bodyLabel = activeTab === "requests" && requestsEnabled ? "Talep yönetimi görünümü" : "Müşteri yönetimi görünümü";

  return <FeatureWorkspacePage
    label="Müşteri işleri"
    bodyLabel={bodyLabel}
    toolbar={<FeatureViewSelector items={views} value={requestsEnabled ? activeTab : "customers"} onChange={setActiveTab} label="Müşteri işleri görünümü" />}
  >{content}</FeatureWorkspacePage>;
}
