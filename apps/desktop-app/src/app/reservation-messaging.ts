import type { DesktopDashboardData } from "../../electron/database";
import { formatReservationDate } from "./record-formatters";

function formatReservationType(value: string) {
  const labels: Record<string, string> = {
    room: "Pansiyon",
    table: "Masa",
    breakfast: "Kahvaltı",
    mixed: "Karma"
  };
  return labels[value] ?? "Rezervasyon";
}

function formatResourceLinks(
  reservation: DesktopDashboardData["reservations"][number],
  rooms: DesktopDashboardData["rooms"],
  tables: DesktopDashboardData["tables"]
) {
  const roomNames = reservation.roomIds.map((roomId) => rooms.find((room) => room.id === roomId)?.name).filter(Boolean);
  const tableNames = reservation.tableIds.map((tableId) => tables.find((table) => table.id === tableId)?.name).filter(Boolean);
  const roomText = roomNames.length > 0 ? `Oda: ${roomNames.join(", ")}` : reservation.roomIds.length > 0 ? "Oda atandı" : "";
  const tableText = tableNames.length > 0 ? `Masa: ${tableNames.join(", ")}` : reservation.tableIds.length > 0 ? "Masa atandı" : "";
  return [roomText, tableText].filter(Boolean).join(" · ") || "Yer bilgisi daha sonra paylaşılacak";
}

export function buildReservationWhatsAppMessage(
  reservation: DesktopDashboardData["reservations"][number],
  rooms: DesktopDashboardData["rooms"],
  tables: DesktopDashboardData["tables"]
) {
  const greeting = `Merhaba ${reservation.customerName || "Misafir"},`;
  const dateText = formatReservationDate(reservation);
  const typeText = formatReservationType(reservation.reservationType).toLowerCase();

  if (reservation.status === "approved") {
    return [
      greeting,
      `${dateText} tarihli ${typeText} rezervasyonunuz işletme tarafından onaylandı.`,
      formatResourceLinks(reservation, rooms, tables),
      "Geliş saatiniz veya özel notunuz varsa bize yazabilirsiniz."
    ].join(" ");
  }
  if (reservation.status === "rejected") {
    return [
      greeting,
      `${dateText} tarihli ${typeText} talebinize mevcut uygunluk nedeniyle olumlu dönüş yapamıyoruz.`,
      "Uygun başka tarih veya seçenek için tekrar yardımcı olabiliriz."
    ].join(" ");
  }
  if (reservation.status === "cancelled") {
    return [
      greeting,
      `${dateText} tarihli ${typeText} rezervasyonunuz iptal olarak güncellendi.`,
      "Yeni bir tarih düşünürseniz bize yazabilirsiniz."
    ].join(" ");
  }
  return [
    greeting,
    `${dateText} tarihli ${typeText} talebiniz için sizinle iletişime geçiyoruz.`,
    "Detayları işletme sahibi kontrol edip size net bilgi verecektir."
  ].join(" ");
}
