import type { RoomFolioPaymentMethod } from "../../../electron/room-folio";

export { formatMinorCurrency as minorMoney, formatMinorToInput as minorToInput, parseMoneyToMinor } from "@yardimci-asistan/shared";

export function formatDateRange(start: string, end: string): string {
  const startText = formatDate(start);
  const endText = formatDate(end);
  return end ? `${startText} – ${endText}` : startText;
}

function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(date);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function paymentMethodLabel(method: RoomFolioPaymentMethod): string {
  if (method === "cash") return "Nakit";
  if (method === "card") return "Kart";
  if (method === "bank") return "Banka";
  if (method === "other") return "Diğer";
  return "Belirtilmedi";
}
