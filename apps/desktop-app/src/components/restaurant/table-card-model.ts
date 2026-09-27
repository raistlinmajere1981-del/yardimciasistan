import type { DesktopTable, DesktopTableOperations } from "../../../electron/database-types";

export type TableQuickAction = {
  label: string;
  kind: "start" | "paid";
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
  if (summary && !blocked && order?.status === "payment") {
    quickAction = { label: "Hesabı kapat", kind: "paid" };
  } else if (summary && !blocked && !order && !conflict && capabilities.ordersEnabled && !["bill_waiting", "payment"].includes(table.status)) {
    quickAction = { label: "Sipariş aç", kind: "start" };
  }

  return { order, upcoming, blocked, conflict, quickAction };
}
