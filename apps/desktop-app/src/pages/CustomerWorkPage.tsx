import { useEffect, type ReactNode } from "react";
import { FeatureViewSelector } from "../components/workspace/FeatureViewSelector";
import { FeatureWorkspacePage } from "../components/workspace/FeatureWorkspacePage";

export type CustomerWorkTab = "requests" | "customers" | "messages";

interface CustomerWorkPageProps {
  requestsEnabled: boolean;
  whatsappEnabled: boolean;
  activeTab: CustomerWorkTab;
  onTabChange: (tab: CustomerWorkTab) => void;
  requests: ReactNode;
  customers: ReactNode;
  messages: ReactNode;
}

export function CustomerWorkPage({
  requestsEnabled,
  whatsappEnabled,
  activeTab,
  onTabChange,
  requests,
  customers,
  messages
}: CustomerWorkPageProps) {
  useEffect(() => {
    if (activeTab === "requests" && !requestsEnabled) {
      onTabChange("customers");
      return;
    }
    if (activeTab === "messages" && !whatsappEnabled) {
      onTabChange(requestsEnabled ? "requests" : "customers");
    }
  }, [activeTab, onTabChange, requestsEnabled, whatsappEnabled]);

  const views: readonly { id: CustomerWorkTab; label: string }[] = [
    ...(requestsEnabled ? [{ id: "requests" as const, label: "Talepler" }] : []),
    { id: "customers" as const, label: "Müşteriler" },
    ...(whatsappEnabled ? [{ id: "messages" as const, label: "Hazır Mesajlar" }] : [])
  ];

  const normalizedTab: CustomerWorkTab = activeTab === "requests" && !requestsEnabled
    ? "customers"
    : activeTab === "messages" && !whatsappEnabled
      ? (requestsEnabled ? "requests" : "customers")
      : activeTab;

  const content = normalizedTab === "requests"
    ? requests
    : normalizedTab === "messages"
      ? messages
      : customers;

  const bodyLabel = normalizedTab === "requests"
    ? "Talep yönetimi görünümü"
    : normalizedTab === "messages"
      ? "Hazır mesajlar görünümü"
      : "Müşteri yönetimi görünümü";

  return <FeatureWorkspacePage
    label="Müşteri işleri"
    bodyLabel={bodyLabel}
    toolbar={<FeatureViewSelector items={views} value={normalizedTab} onChange={onTabChange} label="Müşteri işleri görünümü" />}
  >{content}</FeatureWorkspacePage>;
}
