import type { DesktopDashboardData } from "../../../electron/database";
import { SearchSelect } from "../ui/SearchSelect";

export function StayGuestPicker({ data, selectedIds, onSelect, disabled }: {
  data: DesktopDashboardData; selectedIds: string[]; onSelect: (id: string) => void; disabled: boolean;
}) {
  const active = (data.roomOperations?.flatMap(room => room.stays) ?? data.customerRoomStays)
    .flatMap(stay => (stay.guests ?? []).filter(guest => ["planned", "checked_in"].includes(guest.status)).map(guest => guest.customerId));
  return <div className="form-field">
    <span>Misafir ekle</span>
    <SearchSelect
      ariaLabel="Misafir ekle"
      value=""
      disabled={disabled}
      placeholder="Kayıtlı müşteri seçin"
      searchPlaceholder="Ad veya telefon ara"
      options={data.customers.filter(customer => !selectedIds.includes(customer.id)).map(customer => ({
        id: customer.id,
        label: customer.fullName,
        ...(active.includes(customer.id)
          ? { description: "Aktif konaklaması var" }
          : customer.phone ? { description: customer.phone } : {}),
        disabled: active.includes(customer.id)
      }))}
      onChange={id => { if (id) onSelect(id); }}
    />
  </div>;
}