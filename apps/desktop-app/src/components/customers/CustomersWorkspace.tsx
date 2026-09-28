import { useEffect, useMemo, useState } from "react";
import { Plus, Users } from "lucide-react";
import type { DesktopCustomerMutationResult, DesktopDashboardData, DesktopIdentityImageAnalyzeResult, SaveCustomerInput } from "../../../electron/database";
import { formatCustomerSource } from "../../app/customer-model";
import { formatShortDate } from "../../app/record-formatters";
import { ActionButton } from "../ui/ActionButton";
import { DataList, DataListButton } from "../ui/DataList";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { CustomerCreateEditor } from "./CustomerCreateEditor";

interface CustomersWorkspaceProps {
  customers: DesktopDashboardData["customers"];
  stays: DesktopDashboardData["customerRoomStays"];
  aiEnabled: boolean;
  onSave: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onAnalyzeIdentity: (file: File) => Promise<DesktopIdentityImageAnalyzeResult>;
}

export function CustomersWorkspace({ customers, stays, aiEnabled, onSave, onAnalyzeIdentity }: CustomersWorkspaceProps) {
  const navigation = useWorkspaceNavigation();
  const [searchText, setSearchText] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingCustomerId, setPendingCustomerId] = useState("");

  const filteredCustomers = useMemo(() => customers.filter((customer) => {
    const customerStays = stays.filter((stay) => stay.customerId === customer.id).map((stay) => stay.roomName + " " + stay.roomNumber).join(" ");
    const haystack = (customer.fullName + " " + customer.phone + " " + customer.email + " " + customer.identityNumber + " " + customer.tags.join(" ") + " " + customerStays).toLowerCase();
    return haystack.includes(searchText.trim().toLowerCase());
  }), [customers, searchText, stays]);

  useEffect(() => {
    if (createOpen || !pendingCustomerId) return;
    if (navigation.openWorkspace({ entityType: "customer", entityId: pendingCustomerId, mode: "summary", returnContext: { page: "customerWork", entityId: pendingCustomerId } })) {
      setPendingCustomerId("");
    }
  }, [createOpen, navigation, pendingCustomerId]);

  return <section className="panel customers-workspace" aria-label="Müşteri yönetimi">
    <div className="card__header">
      <div><p>Müşteriler</p><h2>{customers.length} kayıt</h2></div>
      <ActionButton size="sm" type="button" onClick={() => setCreateOpen(true)}><Plus size={15} aria-hidden="true" />Yeni Müşteri</ActionButton>
    </div>

    <label className="customer-search form-field form-field--medium"><span>Ara</span><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder={stays.length > 0 ? "Ad, telefon, kimlik, etiket veya oda" : "Ad, telefon, kimlik veya etiket"} /></label>

    <DataList className="customers-workspace__items">
      {filteredCustomers.length === 0 ? <div className="empty-state"><Users size={24} aria-hidden="true" /><strong>Müşteri bulunamadı.</strong><p>Arama metnini değiştirin.</p></div> : filteredCustomers.map((customer) => <DataListButton
        className="customer-record-row"
        key={customer.id}
        title={customer.fullName}
        leading={<span className={"status-dot " + (customer.requestCount > 0 ? "tone-info" : "tone-neutral")} aria-hidden="true" />}
        description={(customer.phone || "Telefon yok") + " · " + formatCustomerSource(customer.source)}
        trailing={formatShortDate(customer.lastContactAt || customer.updatedAt) ? <time dateTime={customer.lastContactAt || customer.updatedAt}>{formatShortDate(customer.lastContactAt || customer.updatedAt)}</time> : undefined}
        onClick={() => navigation.openWorkspace({ entityType: "customer", entityId: customer.id, mode: "summary", returnContext: { page: "customerWork", entityId: customer.id } })}
      />)}
    </DataList>

    <CustomerCreateEditor
      open={createOpen}
      aiEnabled={aiEnabled}
      onClose={() => setCreateOpen(false)}
      onSave={onSave}
      onAnalyzeIdentity={onAnalyzeIdentity}
      onCreated={setPendingCustomerId}
    />
  </section>;
}
