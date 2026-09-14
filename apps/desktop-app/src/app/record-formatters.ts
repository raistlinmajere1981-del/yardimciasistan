import type { DesktopDashboardData } from "../../electron/database";

export function formatRequestType(value: string) {
  const labels: Record<string, string> = {
    general_info: "Bilgi talebi",
    pension_reservation: "Pansiyon rezervasyonu",
    restaurant_reservation: "Masa rezervasyonu",
    breakfast_request: "Kahvaltı talebi",
    qr_menu_question: "Menü sorusu",
    location_question: "Ulaşım sorusu",
    price_question: "Fiyat sorusu",
    other: "Diğer"
  };

  return labels[value] ?? "Bilgi talebi";
}

export function formatRequestStatus(value: string) {
  const labels: Record<string, string> = {
    new: "Onay bekliyor",
    seen: "Görüldü",
    waiting_owner: "İşletme bekliyor",
    waiting_customer: "Müşteri bekleniyor",
    approved: "Onaylandı",
    rejected: "Reddedildi",
    answered: "Cevaplandı",
    converted_to_reservation: "Rezervasyona çevrildi",
    cancelled: "İptal edildi",
    archived: "Arşivlendi"
  };

  return labels[value] ?? "Onay bekliyor";
}

export function formatReservationStatus(value: string) {
  const labels: Record<string, string> = {
    pending: "Onay bekliyor",
    approved: "Onaylandı",
    rejected: "Reddedildi",
    cancelled: "İptal edildi",
    completed: "Tamamlandı"
  };

  return labels[value] ?? "Onay bekliyor";
}

export function formatRoomStatus(value: string) {
  const labels: Record<string, string> = {
    available: "Boş",
    reserved: "Rezerve",
    occupied: "Dolu",
    cleaning: "Temizlik",
    maintenance: "Bakım",
    out_of_service: "Hizmet dışı"
  };

  return labels[value] ?? "Boş";
}

export function formatDateForDisplay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

export function formatShortDate(value: string) {
  if (!value) {
    return "";
  }

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (isoDate) {
    return `${isoDate[3]}.${isoDate[2]}`;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length <= 14 ? trimmedValue : "";
}

export function formatReservationDate(reservation: DesktopDashboardData["reservations"][number]) {
  const startDate = formatDateForDisplay(reservation.startDate);
  const endDate = formatDateForDisplay(reservation.endDate);
  const date = endDate ? `${startDate} - ${endDate}` : startDate;
  return [date, reservation.time].filter(Boolean).join(" · ") || "-";
}

export function formatDateTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(timestamp));
}
