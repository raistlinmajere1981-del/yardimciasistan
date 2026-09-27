import type { DesktopTable, DesktopTableOperations } from "../../../electron/database-types";

export type TableQuickAction = {
  label: string;
  kind: "start" | "clean" | "preparing" | "served" | "payment" | "paid";
};

export function getTableCardModel(table: DesktopTable, summary: DesktopTableOperations | undefined,
  capabilities: { ordersEnabled: boolean; reservationsEnabled: boolean; menuEnabled: boolean }, today: string) {
  const order = capabilities.ordersEnabled ? summary?.order : null;
  const reservations = capabilities.reservationsEnabled ? summary?.reservations.filter(item => ["pending", "approved"].includes(item.status) && item.startDate >= today) ?? [] : [];
  const upcoming = [...reservations].sort((a, b) => `${a.startDate} ${a.time}`.localeCompare(`${b.startDate} ${b.time}`))[0];
  const blocked = !table.isActive || ["cleaning", "maintenance", "out_of_service"].includes(table.status);
  const conflict = reservations.some((item, index) => reservations.some((other, otherIndex) => otherIndex > index
    && item.startDate === other.startDate && item.time === other.time));

  let quickAction: TableQuickAction | undefined;
  if (summary && table.status === "cleaning" && !order && table.isActive) {
    quickAction = { label: "Temizliği tamamla", kind: "clean" };
  } else if (summary && !blocked && order) {
    if (order.status === "open") quickAction = { label: "Hazırlamaya al", kind: "preparing" };
    else if (order.status === "preparing") quickAction = { label: "Servis edildi", kind: "served" };
    else if (order.status === "served") quickAction = { label: "Hesap bekliyor", kind: "payment" };
    else if (order.status === "payment") quickAction = { label: "Hesabı kapat", kind: "paid" };
  } else if (summary && !blocked && !conflict && capabilities.ordersEnabled && !["bill_waiting", "payment"].includes(table.status)) {
    quickAction = { label: "Sipariş aç", kind: "start" };
  }

  return { order, upcoming, blocked, conflict, quickAction };
}
