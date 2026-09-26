import type { DesktopTable } from "../../../electron/database-types";
import type { DesktopTableOperations } from "../../../electron/database-types";
import type { TableWorkspaceIntent } from "../workspace/workspace-intent";

type TableAction = { label: string; kind: "start" | "clean" | "served" | "payment" }
  | { label: string; intent: Omit<TableWorkspaceIntent, "entityType" | "entityId"> };
export function getTableCardModel(table: DesktopTable, summary: DesktopTableOperations | undefined,
  capabilities: { ordersEnabled: boolean; reservationsEnabled: boolean; menuEnabled: boolean }, today: string) {
  const order = capabilities.ordersEnabled ? summary?.order : null;
  const reservations = capabilities.reservationsEnabled ? summary?.reservations.filter(item => ["pending", "approved"].includes(item.status) && item.startDate >= today) ?? [] : [];
  const upcoming = [...reservations].sort((a, b) => `${a.startDate} ${a.time}`.localeCompare(`${b.startDate} ${b.time}`))[0];
  const blocked = !table.isActive || ["cleaning", "maintenance", "out_of_service"].includes(table.status);
  const conflict = reservations.some((item, index) => reservations.some((other, otherIndex) => otherIndex > index
    && item.startDate === other.startDate && item.time === other.time));
  let action: TableAction | undefined;
  if (summary && table.status === "cleaning" && !order && table.isActive) action = { label: "Temizliği tamamla", kind: "clean" };
  else if (summary && !blocked && order) {
    if (order.status === "preparing") action = { label: "Servis edildi", kind: "served" };
    else if (order.status === "served") action = { label: "Hesabı aç", kind: "payment" };
    else if (order.status === "payment") action = { label: "Tahsilat", intent: { mode: "account", orderId: order.id } };
    else action = { label: capabilities.menuEnabled ? "Ürün ekle" : "Adisyonu düzenle", intent: { mode: "order", action: capabilities.menuEnabled ? "add-item" : undefined, orderId: order.id } };
  } else if (summary && !blocked && !conflict && capabilities.ordersEnabled && !["bill_waiting", "payment"].includes(table.status)) {
    action = { label: "Sipariş başlat", kind: "start" };
  }
  return { order, upcoming, blocked, conflict, action };
}
