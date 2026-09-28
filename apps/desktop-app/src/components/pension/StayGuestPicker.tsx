import type { DesktopDashboardData } from "../../../electron/database";
import { SearchSelect } from "../ui/SearchSelect";
import { QuickCustomerCreator } from "../operations/QuickCustomerCreator";
import type { RoomStayOperations } from "./use-room-stay-operations";

export function StayGuestPicker({ data, selectedIds, onSelect, operations, disabled, onDirty }: {
  data: DesktopDashboardData; selectedIds: string[]; onSelect: (id: string) => void;
  operations: RoomStayOperations; disabled: boolean; onDirty: (dirty: boolean) => void;
}) {
  const active = (data.roomOperations?.flatMap(room => room.stays) ?? data.customerRoomStays)
    .flatMap(stay => (stay.guests ?? []).filter(guest => ["planned", "checked_in"].includes(guest.status)).map(guest => guest.customerId));
  return <div className="form-stack">
    <div className="form-field"><span>Misafir ekle</span><SearchSelect ariaLabel="Misafir ekle" value="" disabled={disabled}
      placeholder="Kayıtlı müşteri seçin" searchPlaceholder="Ad veya telefon ara"
      options={data.customers.filter(customer => !selectedIds.includes(customer.id)).map(customer => ({ id: customer.id, label: customer.fullName,
        description: active.includes(customer.id) ? "Aktif konaklaması var" : customer.phone || undefined, disabled: active.includes(customer.id) }))}
      onChange={id => { if (id) onSelect(id); }} /></div>
    <QuickCustomerCreator disabled={disabled} onDirty={onDirty}
      onSave={input => operations.saveCustomer(input)} onCreated={onSelect} />
  </div>;
}
