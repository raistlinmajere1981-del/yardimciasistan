import { useEffect, useMemo, useState } from "react";
import { BedDouble, CalendarClock, IdCard, Plus, Trash2, Users } from "lucide-react";
import type { DesktopCustomerMutationResult, DesktopDashboardData, DesktopIdentityImageAnalyzeResult, SaveCustomerInput } from "../../../electron/database";
import { formatShortDate } from "../../app/record-formatters";
import { ActionButton } from "../ui/ActionButton";
import { DataList, DataListItem } from "../ui/DataList";
import { ChoiceChips } from "../ui/ChoiceChips";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { CustomerCreateEditor } from "./CustomerCreateEditor";

type CustomerFilter = "all" | "staying" | "reserved" | "kbs_pending" | "kbs_failed";

interface CustomersWorkspaceProps {
  customers: DesktopDashboardData["customers"];
  stays: DesktopDashboardData["customerRoomStays"];
  reservations: DesktopDashboardData["reservations"];
  notifications: DesktopDashboardData["hospitalityNotifications"];
  kbsOverview: DesktopDashboardData["kbsOverview"];
  aiEnabled: boolean;
  onSave: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onAnalyzeIdentity: (file: File) => Promise<DesktopIdentityImageAnalyzeResult>;
  onDelete: (customer: DesktopDashboardData["customers"][number]) => void | Promise<unknown>;
  onSendKbs: (notificationId: string, customerId: string) => void | Promise<unknown>;
}

export function CustomersWorkspace({
  customers,
  stays,
  reservations,
  notifications,
  kbsOverview,
  aiEnabled,
  onSave,
  onAnalyzeIdentity,
  onDelete,
  onSendKbs
}: CustomersWorkspaceProps) {
  const navigation = useWorkspaceNavigation();
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingCustomerId, setPendingCustomerId] = useState("");

  const rows = useMemo(() => customers.map((customer) => {
    const customerStays = stays.filter((stay) => stayHasCustomer(stay, customer.id));
    const activeStay = customerStays.find((stay) => stay.status === "checked_in");
    const plannedStay = customerStays.find((stay) => stay.status === "planned");
    const activeReservations = reservations.filter((reservation) =>
      reservation.customerId === customer.id && ["pending", "approved"].includes(reservation.status)
    );
    const arrivalNotification = activeStay
      ? notifications.find((notification) =>
          notification.customerId === customer.id
          && notification.stayId === activeStay.id
          && notification.kind === "arrival"
        )
      : undefined;
    const kbsState = !kbsOverview.enabled || !activeStay
      ? "none"
      : arrivalNotification?.status === "sent"
        ? "sent"
        : arrivalNotification?.status === "failed"
          ? "failed"
          : "pending";
    const roomText = activeStay
      ? roomLabel(activeStay.roomNumber, activeStay.roomName)
      : plannedStay
        ? roomLabel(plannedStay.roomNumber, plannedStay.roomName) + " · planlı"
        : "";
    const haystack = [
      customer.fullName,
      customer.phone,
      customer.email,
      customer.identityNumber,
      customer.tags.join(" "),
      ...customerStays.map((stay) => stay.roomName + " " + stay.roomNumber)
    ].join(" ").toLocaleLowerCase("tr-TR");

    return { customer, activeStay, plannedStay, activeReservations, arrivalNotification, kbsState, roomText, haystack };
  }).filter((row) => {
    const searchOk = row.haystack.includes(searchText.trim().toLocaleLowerCase("tr-TR"));
    if (!searchOk) return false;
    if (filter === "staying") return Boolean(row.activeStay);
    if (filter === "reserved") return row.activeReservations.length > 0 || Boolean(row.plannedStay);
    if (filter === "kbs_pending") return row.kbsState === "pending";
    if (filter === "kbs_failed") return row.kbsState === "failed";
    return true;
  }), [customers, filter, kbsOverview.enabled, notifications, reservations, searchText, stays]);

  useEffect(() => {
    if (createOpen || !pendingCustomerId) return;
    if (navigation.openWorkspace({ entityType: "customer", entityId: pendingCustomerId, mode: "main", returnContext: { page: "customerWork", entityId: pendingCustomerId } })) {
      setPendingCustomerId("");
    }
  }, [createOpen, navigation, pendingCustomerId]);

  return <section className="panel customers-workspace" aria-label="Müşteri yönetimi">
    <div className="card__header">
      <div><p>Müşteriler</p><h2>{rows.length === customers.length ? String(customers.length) + " kayıt" : String(rows.length) + "/" + String(customers.length) + " kayıt"}</h2></div>
      <ActionButton size="sm" type="button" onClick={() => setCreateOpen(true)}><Plus size={15} aria-hidden="true" />Yeni Müşteri</ActionButton>
    </div>

    <div className="customer-list-controls">
      <label className="customer-search form-field form-field--medium">
        <span>Ara</span>
        <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder={stays.length > 0 ? "Ad, telefon, kimlik, etiket veya oda" : "Ad, telefon, kimlik veya etiket"} />
      </label>
      <ChoiceChips
        className="customer-filter-row"
        ariaLabel="Müşteri filtresi"
        value={filter}
        onChange={setFilter}
        options={[
          { id: "all", label: "Tümü" },
          { id: "staying", label: "Konaklayanlar" },
          { id: "reserved", label: "Rezervasyonu Olanlar" },
          ...(kbsOverview.enabled
            ? [
                { id: "kbs_pending" as const, label: "Bildirim Bekleyen" },
                { id: "kbs_failed" as const, label: "Bildirim Hatalı" }
              ]
            : [])
        ]}
      />
    </div>

    <DataList className="customers-workspace__items">
      {rows.length === 0 ? <div className="empty-state"><Users size={24} aria-hidden="true" /><strong>Müşteri bulunamadı.</strong><p>Arama veya filtreyi değiştirin.</p></div> : rows.map((row) => {
        const customer = row.customer;
        const openCustomer = () => navigation.openWorkspace({
          entityType: "customer",
          entityId: customer.id,
          mode: "main",
          returnContext: { page: "customerWork", entityId: customer.id }
        });
        return <DataListItem
          className="customer-record-row"
          key={customer.id}
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest(".list-row__actions, .customer-record-row__open")) return;
            openCustomer();
          }}
          leading={<span className={"status-dot " + (row.activeStay ? "tone-success" : row.activeReservations.length > 0 ? "tone-warning" : "tone-neutral")} aria-hidden="true" />}
          title={<button className="customer-record-row__open" type="button" onClick={openCustomer}>{customer.fullName}</button>}
          meta={<>
            <span className="customer-record-row__phone">{customer.phone || "Telefon yok"}</span>
            {row.roomText && <span><BedDouble size={14} aria-hidden="true" />{row.roomText}</span>}
            {row.activeReservations.length > 0 && <span><CalendarClock size={14} aria-hidden="true" />{row.activeReservations.length} aktif rezervasyon</span>}
            {kbsOverview.enabled && row.activeStay && <StatusBadge tone={kbsTone(row.kbsState)}>{kbsLabel(row.kbsState)}</StatusBadge>}
          </>}
          actions={<>
            {formatShortDate(customer.lastContactAt || customer.updatedAt) && (
              <span className="customer-record-row__date">
                <small>{customer.lastContactAt ? "Son temas" : "Güncellendi"}</small>
                <time dateTime={customer.lastContactAt || customer.updatedAt}>{formatShortDate(customer.lastContactAt || customer.updatedAt)}</time>
              </span>
            )}
            {kbsOverview.enabled && row.activeStay && row.kbsState !== "sent" && row.arrivalNotification && (
              <ActionButton
                variant="secondary"
                size="sm"
                type="button"
                disabled={!kbsOverview.configured || !row.arrivalNotification.identityReady}
                onClick={() => { void onSendKbs(row.arrivalNotification!.id, customer.id); }}
              >
                <IdCard size={15} aria-hidden="true" />
                {!kbsOverview.configured
                  ? "KBS Ayarları Eksik"
                  : row.arrivalNotification.identityReady
                    ? "Kimlik Bildir"
                    : "Kimlik Eksik"}
              </ActionButton>
            )}
            <ActionButton variant="danger" size="sm" type="button" onClick={() => { void onDelete(customer); }}>
              <Trash2 size={15} aria-hidden="true" />Sil
            </ActionButton>
          </>}
        />;
      })}
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

function stayHasCustomer(stay: DesktopDashboardData["customerRoomStays"][number], customerId: string) {
  return stay.customerId === customerId || stay.guests.some((guest) => guest.customerId === customerId);
}

function roomLabel(number: string, name: string) {
  return number ? "Oda " + number : name || "Oda";
}

function kbsLabel(state: string) {
  if (state === "sent") return "KBS bildirildi";
  if (state === "failed") return "KBS hata";
  return "KBS bekliyor";
}

function kbsTone(state: string): StatusTone {
  if (state === "sent") return "success";
  if (state === "failed") return "danger";
  return "warning";
}
