import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Users } from "lucide-react";
import type { DesktopCustomerMutationResult, DesktopDashboardData, DesktopIdentityImageAnalyzeResult, SaveCustomerInput } from "../../../electron/database";
import { customerFormToInput, formatCustomerSource, toCustomerForm, type CustomerFormState } from "../../app/customer-model";
import { formatShortDate } from "../../app/record-formatters";
import { ActionButton } from "../ui/ActionButton";
import { DataList, DataListButton } from "../ui/DataList";
import { FormDialog } from "../ui/FormDialog";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { CustomerFormFields } from "./CustomerFormFields";

type SaveState = "idle" | "loading" | "error";

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
  const [form, setForm] = useState<CustomerFormState>(() => toCustomerForm(null));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");

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

  function openCreate() {
    setForm(toCustomerForm(null));
    setSaveState("idle");
    setSaveMessage("");
    setCreateOpen(true);
  }

  return <section className="panel customers-workspace" aria-label="Müşteri yönetimi">
    <div className="card__header">
      <div><p>Müşteriler</p><h2>{customers.length} kayıt</h2></div>
      <ActionButton size="sm" type="button" onClick={openCreate}><Plus size={15} aria-hidden="true" />Yeni Müşteri</ActionButton>
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

    {createOpen && <FormDialog
      title="Yeni müşteri ekle"
      onClose={() => { if (saveState !== "loading") setCreateOpen(false); }}
      closeBlocked={saveState === "loading"}
      dismissOnBackdrop
      onSubmit={async (event) => {
        event.preventDefault();
        setSaveState("loading");
        setSaveMessage("Müşteri kartı kaydediliyor...");
        const result = await onSave(customerFormToInput(form));
        if (!result.ok) {
          setSaveState("error");
          setSaveMessage(result.message);
          return;
        }
        setPendingCustomerId(result.savedId);
        setCreateOpen(false);
      }}
      footer={<>{saveMessage && <p className={"form-status sync-" + saveState} role="status">{saveMessage}</p>}<div className="action-row"><ActionButton variant="secondary" type="button" disabled={saveState === "loading"} onClick={() => setCreateOpen(false)}>Vazgeç</ActionButton><ActionButton type="submit" disabled={saveState === "loading"}><Save size={16} aria-hidden="true" />{saveState === "loading" ? "Kaydediliyor" : "Müşteri Kartını Kaydet"}</ActionButton></div></>}
    >
      <div className="form-stack customer-create-form"><CustomerFormFields form={form} aiEnabled={aiEnabled} onChange={setForm} onAnalyzeIdentity={onAnalyzeIdentity} /></div>
    </FormDialog>}
  </section>;
}
