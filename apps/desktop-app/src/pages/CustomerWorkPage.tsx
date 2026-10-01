import { useEffect, type ReactNode } from "react";
import type { CustomerWorkTab } from "../app/navigation";
import { FeatureViewSelector } from "../components/workspace/FeatureViewSelector";
import { FeatureWorkspacePage } from "../components/workspace/FeatureWorkspacePage";

interface CustomerWorkPageProps {
  requestsEnabled: boolean;
  whatsappEnabled: boolean;
  kbsEnabled: boolean;
  activeTab: CustomerWorkTab;
  onTabChange: (tab: CustomerWorkTab) => void;
  requests: ReactNode;
  customers: ReactNode;
  kbs: ReactNode;
  messages: ReactNode;
}

export function CustomerWorkPage({
  requestsEnabled,
  whatsappEnabled,
  kbsEnabled,
  activeTab,
  onTabChange,
  requests,
  customers,
  kbs,
  messages
}: CustomerWorkPageProps) {
  useEffect(() => {
    if (activeTab === "requests" && !requestsEnabled) {
      onTabChange("customers");
      return;
    }
    if (activeTab === "kbs" && !kbsEnabled) {
      onTabChange("customers");
      return;
    }
    if (activeTab === "prepared" && !whatsappEnabled) {
      onTabChange(requestsEnabled ? "requests" : "customers");
    }
  }, [activeTab, kbsEnabled, onTabChange, requestsEnabled, whatsappEnabled]);

  const views: readonly { id: CustomerWorkTab; label: string }[] = [
    { id: "customers" as const, label: "Müşteriler" },
    ...(kbsEnabled ? [{ id: "kbs" as const, label: "Kimlik Bildirimleri" }] : []),
    ...(requestsEnabled ? [{ id: "requests" as const, label: "Talepler" }] : []),
    ...(whatsappEnabled ? [{ id: "prepared" as const, label: "Hazır Mesajlar" }] : [])
  ];

  const normalizedTab: CustomerWorkTab = activeTab === "requests" && !requestsEnabled
    ? "customers"
    : activeTab === "kbs" && !kbsEnabled
      ? "customers"
      : activeTab === "prepared" && !whatsappEnabled
      ? (requestsEnabled ? "requests" : "customers")
      : activeTab;

  const content = normalizedTab === "requests"
    ? requests
    : normalizedTab === "kbs"
      ? kbs
      : normalizedTab === "prepared"
        ? messages
        : customers;

  const bodyLabel = normalizedTab === "requests"
    ? "Talep yönetimi görünümü"
    : normalizedTab === "kbs"
      ? "Kimlik bildirimi yönetimi görünümü"
      : normalizedTab === "prepared"
      ? "Hazır mesajlar görünümü"
      : "Müşteri yönetimi görünümü";

  const layout = normalizedTab === "customers" ? "flow" : "fill";

  return <FeatureWorkspacePage
    label="Müşteri işleri"
    bodyLabel={bodyLabel}
    layout={layout}
    toolbar={<FeatureViewSelector items={views} value={normalizedTab} onChange={onTabChange} label="Müşteri işleri görünümü" />}
  >{content}</FeatureWorkspacePage>;
}
