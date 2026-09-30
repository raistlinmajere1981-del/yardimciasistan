import { useEffect, useRef, useState } from "react";
import { CalendarPlus, UserPlus } from "lucide-react";
import type { DesktopDashboardData } from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";
import { SearchSelect } from "../ui/SearchSelect";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import type { useTableOrderController } from "./use-table-order-controller";
import { TableRoomTransfer } from "./TableRoomTransfer";

export function TableRelationsPanel({
  table,
  data,
  controller,
  disabled,
  customersEnabled,
  reservationsEnabled,
  roomFolioTransferEnabled,
  quickCustomerId,
  onCreateCustomer,
  onCreateReservation,
  onTransfer
}: {
  table: DesktopDashboardData["tables"][number];
  data: DesktopDashboardData;
  controller: ReturnType<typeof useTableOrderController>;
  disabled: boolean;
  customersEnabled: boolean;
  reservationsEnabled: boolean;
  roomFolioTransferEnabled: boolean;
  quickCustomerId?: string;
  onCreateCustomer: () => void;
  onCreateReservation: () => void;
  onTransfer: (folioId: string) => void;
}) {
  const navigation = useWorkspaceNavigation();
  const [entryRoomId, setEntryRoomId] = useState("");
  const [entryRequested, setEntryRequested] = useState(false);
  const [customerDraft, setCustomerDraft] = useState<string | null>(null);
  const quickAssignmentRef = useRef("");

  const order = controller.active;
  const relatedReservations = reservationsEnabled
    ? data.reservations.filter(item => item.tableIds.includes(table.id) && !["rejected", "cancelled", "completed"].includes(item.status))
    : [];
  const reservation = relatedReservations.find(item => item.id === table.currentReservationId) ?? relatedReservations[0];
  const customer = customersEnabled ? data.customers.find(item => item.id === table.currentCustomerId) : undefined;
  const customerStay = customer
    ? (data.roomOperations?.flatMap(room => room.stays) ?? data.customerRoomStays).find(stay =>
        stay.status === "checked_in"
        && stay.guests?.some(guest => guest.customerId === customer.id && guest.status === "checked_in"))
    : undefined;
  const selectedCustomerId = customerDraft ?? (data.customers.some(item => item.id === table.currentCustomerId) ? table.currentCustomerId : "");

  useEffect(() => {
    setCustomerDraft(null);
  }, [table.currentCustomerId]);

  useEffect(() => {
    if (!entryRequested || controller.busy || controller.dirty) return;
    setEntryRequested(false);
    navigation.openWorkspace({
      entityType: "room",
      entityId: entryRoomId,
      mode: "stay",
      action: "create-stay",
      customerId: table.currentCustomerId,
      returnContext: { page: "restaurant", view: "floor", entityId: table.id }
    });
  }, [entryRequested, controller.busy, controller.dirty, entryRoomId, table.currentCustomerId, table.id, navigation]);

  useEffect(() => {
    if (!quickCustomerId || disabled || quickAssignmentRef.current === quickCustomerId || quickCustomerId === table.currentCustomerId) return;
    quickAssignmentRef.current = quickCustomerId;
    setCustomerDraft(quickCustomerId);
    void controller.assignTableCustomer(quickCustomerId).then(ok => {
      if (!ok) {
        setCustomerDraft(table.currentCustomerId || "");
        quickAssignmentRef.current = "";
      }
    });
  }, [controller, disabled, quickCustomerId, table.currentCustomerId]);

  async function assignCustomer(customerId: string) {
    if (!customersEnabled || disabled || customerId === table.currentCustomerId) return;
    setCustomerDraft(customerId);
    const ok = await controller.assignTableCustomer(customerId);
    if (!ok) setCustomerDraft(table.currentCustomerId || "");
  }

  return <section className="operation-section table-relations-section" aria-label="Müşteri ve konaklama" tabIndex={-1}>
    <div className="table-relations-heading">
      <h4>Müşteri & Konaklama</h4>
      <div className="action-row table-relations-actions">
        {customersEnabled && <ActionButton variant="ghost" size="sm" disabled={disabled} onClick={onCreateCustomer}>
          <UserPlus size={14} aria-hidden="true" />Yeni müşteri
        </ActionButton>}
        {reservationsEnabled && <ActionButton variant="ghost" size="sm" disabled={disabled} onClick={onCreateReservation}>
          <CalendarPlus size={14} aria-hidden="true" />Rezervasyon
        </ActionButton>}
      </div>
    </div>

    {customersEnabled && <div className="table-relation-block">
      <div className="table-relation-label">
        <span>Müşteri</span>
        {table.currentCustomerId && <ActionButton variant="ghost" size="sm" disabled={disabled} onClick={() => void assignCustomer("")}>Bağı kaldır</ActionButton>}
      </div>
      <SearchSelect
        ariaLabel="Müşteri seç"
        value={selectedCustomerId}
        disabled={disabled}
        placeholder="Müşteri seçin"
        searchPlaceholder="Müşteri adı veya telefon ara"
        onChange={customerId => void assignCustomer(customerId)}
        options={data.customers.map(item => ({
          id: item.id,
          label: item.fullName,
          description: item.phone || item.email || undefined,
          keywords: [item.phone, item.email, ...(item.tags ?? [])].filter(Boolean).join(" ")
        }))}
      />
    </div>}

    {reservationsEnabled && <div className="table-relation-block">
      <span className="table-relation-label">Rezervasyon</span>
      {reservation
        ? <div className="table-relation-summary"><strong>{reservation.customerName || reservation.title}</strong><small>{reservation.startDate} {reservation.time} · {reservation.guestCount} kişi{relatedReservations.length > 1 ? ` · ${relatedReservations.length} kayıt` : ""}</small></div>
        : <span className="table-relation-empty">Rezervasyon yok.</span>}
    </div>}

    {roomFolioTransferEnabled && <div className="table-relation-block">
      <span className="table-relation-label">Konaklama / Oda</span>
      {customerStay ? <div className="table-relation-summary">
        <strong>{customerStay.roomNumber ? `Oda ${customerStay.roomNumber}` : customerStay.roomName}</strong>
        <small>{customer?.fullName || "Misafir"} · aktif konaklama</small>
      </div> : customer ? <>
        <span className="table-relation-empty">Aktif konaklama yok.</span>
        <SearchSelect
          ariaLabel="Konaklama başlatılacak oda"
          value={entryRoomId}
          onChange={setEntryRoomId}
          disabled={disabled}
          placeholder="Oda seçin"
          searchPlaceholder="Oda ara"
          options={data.rooms
            .filter(room => room.isActive && room.status === "available")
            .map(room => ({ id: room.id, label: room.number ? `Oda ${room.number}` : room.name }))}
        />
        <ActionButton variant="secondary" size="sm" disabled={disabled || !entryRoomId} onClick={async () => {
          if (await controller.run(async () => true)) setEntryRequested(true);
        }}>Konaklama Başlat</ActionButton>
      </> : <span className="table-relation-empty">Odayla ilişkilendirmek için müşteri seçin.</span>}
    </div>}

    {roomFolioTransferEnabled && order && order.total > 0 && <TableRoomTransfer
      key={order.id}
      order={order}
      busy={disabled}
      onTransfer={onTransfer}
      revision={data.revision}
      customerId={table.currentCustomerId}
      dashboard={data}
    />}
  </section>;
}
