import type { RoomFolioPaymentMethod } from "../../../electron/room-folio";
export function parseMoneyToMinor(value: string): number {
  const normalized = value.trim().replace(/\s/g, "").replace(/₺/g, "").replace(/\./g, "").replace(",", ".");
  if (!normalized) return 0;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : -1;
}

export function minorToInput(value: number): string {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
}

export function minorMoney(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value / 100);
}

export function formatDateRange(start: string, end: string): string {
  const startText = formatDate(start);
  const endText = formatDate(end);
  return end ? `${startText} – ${endText}` : startText;
}

export function formatDate(value: string): string {
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
