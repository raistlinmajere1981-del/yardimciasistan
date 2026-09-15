import type { DesktopDashboardData, SaveCustomerInput } from "../../electron/database";

export interface CustomerFormState {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  notes: string;
  tags: string;
  identityType: string;
  identityNumber: string;
  nationality: string;
  birthDate: string;
  birthdayMessageEnabled: boolean;
  gender: string;
  documentSerialNumber: string;
  documentExpiryDate: string;
  birthPlace: string;
  motherName: string;
  fatherName: string;
  issuingAuthority: string;
  address: string;
}

export interface RoomAssignmentFormState {
  customerId: string;
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: string;
  notes: string;
  status: "planned" | "checked_in";
}

type CustomerRecord = DesktopDashboardData["customers"][number];
type CustomerStay = DesktopDashboardData["customerRoomStays"][number];

export function toCustomerForm(customer: CustomerRecord | null): CustomerFormState {
  return {
    id: customer?.id ?? "",
    fullName: customer?.fullName ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    notes: customer?.notes ?? "",
    tags: customer?.tags.join(", ") ?? "",
    identityType: customer?.identityType ?? "",
    identityNumber: customer?.identityNumber ?? "",
    nationality: customer?.nationality ?? "",
    birthDate: customer?.birthDate ?? "",
    birthdayMessageEnabled: customer?.birthdayMessageEnabled ?? true,
    gender: customer?.gender ?? "",
    documentSerialNumber: customer?.documentSerialNumber ?? "",
    documentExpiryDate: customer?.documentExpiryDate ?? "",
    birthPlace: customer?.birthPlace ?? "",
    motherName: customer?.motherName ?? "",
    fatherName: customer?.fatherName ?? "",
    issuingAuthority: customer?.issuingAuthority ?? "",
    address: customer?.address ?? ""
  };
}

export function customerFormToInput(form: CustomerFormState): SaveCustomerInput {
  return {
    ...(form.id ? { id: form.id } : {}),
    fullName: form.fullName,
    phone: form.phone,
    email: form.email,
    notes: form.notes,
    tags: form.tags.split(/[,;\n]/).map((tag) => tag.trim()).filter(Boolean),
    identityType: form.identityType,
    identityNumber: form.identityNumber,
    nationality: form.nationality,
    birthDate: form.birthDate,
    birthdayMessageEnabled: form.birthdayMessageEnabled,
    gender: form.gender,
    documentSerialNumber: form.documentSerialNumber,
    documentExpiryDate: form.documentExpiryDate,
    birthPlace: form.birthPlace,
    motherName: form.motherName,
    fatherName: form.fatherName,
    issuingAuthority: form.issuingAuthority,
    address: form.address
  };
}

export function defaultRoomAssignmentForm(customerId: string, roomId: string): RoomAssignmentFormState {
  const today = localIsoDate(new Date());
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    customerId,
    roomId,
    checkInDate: today,
    checkOutDate: localIsoDate(tomorrow),
    guestCount: "1",
    notes: "",
    status: "planned"
  };
}

export function formatCustomerSource(value: string) {
  const labels: Record<string, string> = {
    web_form: "Web form",
    web_ai: "Web AI",
    whatsapp: "WhatsApp",
    manual: "Manuel",
    phone: "Telefon",
    android: "Android"
  };

  return labels[value] ?? "Müşteri";
}

export function formatIdentityType(value: string): string {
  if (value === "tc_identity_card") return "T.C. Kimlik Kartı";
  if (value === "passport") return "Pasaport";
  if (value === "other") return "Diğer belge";
  return "-";
}

export function formatCustomerGender(value: string): string {
  if (value === "female") return "Kadın";
  if (value === "male") return "Erkek";
  if (value === "unspecified") return "Belirtilmemiş";
  return "-";
}

export function hasCustomerIdentityDetails(customer: CustomerRecord): boolean {
  return Boolean(
    customer.identityNumber
    || customer.nationality
    || customer.birthDate
    || customer.gender
    || customer.documentSerialNumber
    || customer.documentExpiryDate
    || customer.birthPlace
    || customer.motherName
    || customer.fatherName
    || customer.issuingAuthority
    || customer.address
  );
}

export function formatCustomerRoomStayStatus(value: string): string {
  if (value === "planned") return "Planlandı";
  if (value === "checked_in") return "Giriş yaptı";
  if (value === "checked_out") return "Çıkış yaptı";
  if (value === "cancelled") return "İptal";
  return value || "Bilinmiyor";
}

export function formatStayDateRange(stay: CustomerStay): string {
  const start = formatDateForDisplay(stay.checkInDate) || stay.checkInDate || "-";
  const end = formatDateForDisplay(stay.checkOutDate) || stay.checkOutDate;
  return end ? `${start} – ${end}` : `${start} – açık`;
}

export function formatCustomerLastContactDate(value: string) {
  if (!value) {
    return "-";
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateForDisplay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}
