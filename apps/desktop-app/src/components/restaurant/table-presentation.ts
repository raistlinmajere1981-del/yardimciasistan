import type { DesktopTableOrder, TableOrderStatus } from "../../../electron/database";
import type { StatusTone } from "../ui/StatusBadge";

export function getOrderCurrency(order: DesktopTableOrder): string {
  return order.items[0]?.currency || "TRY";
}

export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY" }).format(value);
  } catch {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value);
  }
}

export function getOrderBadge(status: TableOrderStatus): { label: string; tone: StatusTone } {
  const badges: Record<TableOrderStatus, { label: string; tone: StatusTone }> = {
    open: { label: "Açık", tone: "info" },
    preparing: { label: "Hazırlanıyor", tone: "warning" },
    served: { label: "Servis edildi", tone: "success" },
    payment: { label: "Hesap bekliyor", tone: "warning" },
    paid: { label: "Ödendi", tone: "success" },
    cancelled: { label: "İptal", tone: "danger" }
  };
  return badges[status];
}

export function getTableStatusAction(status: string) {
  if (["available", "empty", "vacant"].includes(status)) return "available";
  if (["occupied", "busy", "full"].includes(status)) return "occupied";
  if (["reserved", "reservation"].includes(status)) return "reserved";
  if (["bill_waiting", "waiting_bill", "checkout", "payment"].includes(status)) return "bill_waiting";
  return "";
}

export function formatTableStatus(status: string) {
  const labels: Record<string, string> = {
    available: "Boş",
    empty: "Boş",
    vacant: "Boş",
    occupied: "Dolu",
    busy: "Dolu",
    full: "Dolu",
    reserved: "Rezerve",
    reservation: "Rezerve",
    bill_waiting: "Hesap",
    waiting_bill: "Hesap",
    checkout: "Hesap",
    payment: "Hesap",
    cleaning: "Temizlik"
  };
  return labels[status] ?? status;
}

export function getResourceStatusTone(status: string): StatusTone {
  if (["available", "empty", "vacant", "ready", "completed", "done"].includes(status)) return "success";
  if (["reserved", "pending", "waiting", "bill_waiting", "waiting_bill", "checkout", "payment"].includes(status)) return "warning";
  if (["occupied", "busy", "full", "in_progress", "preparing"].includes(status)) return "info";
  if (["cancelled", "rejected", "maintenance", "out_of_service"].includes(status)) return "danger";
  return "neutral";
}
