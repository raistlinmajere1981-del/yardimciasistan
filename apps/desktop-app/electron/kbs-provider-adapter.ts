import type { KbsProvider } from "./kbs-settings.js";

export interface KbsIdentitySnapshot {
  customerId: string;
  fullName: string;
  identityType: string;
  identityNumber: string;
  nationality: string;
  birthDate: string;
  documentSerialNumber: string;
  roomNumber: string;
}

export interface KbsDeliveryInput {
  notificationId: string;
  kind: "arrival" | "departure" | "room_change";
  occurredAt: string;
  roomNumber: string;
  identity: KbsIdentitySnapshot;
}

export type KbsDeliveryResult =
  | {
      ok: true;
      state: "sent";
      message: string;
      provider: KbsProvider;
      providerReference: string;
    }
  | {
      ok: false;
      state: "waiting" | "interaction_required" | "failed";
      message: string;
      provider: KbsProvider;
      retryable: boolean;
      code?: string;
    };

export interface KbsProviderAdapter {
  readonly provider: KbsProvider;
  send(input: KbsDeliveryInput): Promise<KbsDeliveryResult>;
}

/**
 * Semantic representation of the documented Jandarma
 * MusteriKimlikNoGirisTalep contract.
 *
 * Enum wire values are deliberately not guessed here. They are resolved from
 * Jandarma ParametreListele metadata when the SOAP binding is available.
 */
export interface JandarmaKimlikNoArrivalDraft {
  identityNumber: string;
  countryEnumName: string;
  roomNumber: string;
  arrivalAt: string;
  phone: string;
  usageEnumName: "KONAKLAMA";
  futureDated: boolean;
}

export type JandarmaArrivalPreparation =
  | { ok: true; path: "identity_number"; draft: JandarmaKimlikNoArrivalDraft }
  | {
      ok: false;
      path: "foreign_document" | "invalid";
      message: string;
    };

export function parseKbsIdentitySnapshot(value: string): KbsIdentitySnapshot | null {
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    return {
      customerId: String(raw.customerId ?? "").trim(),
      fullName: String(raw.fullName ?? "").trim(),
      identityType: String(raw.identityType ?? "").trim(),
      identityNumber: String(raw.identityNumber ?? "").trim(),
      nationality: String(raw.nationality ?? "").trim(),
      birthDate: String(raw.birthDate ?? "").trim(),
      documentSerialNumber: String(raw.documentSerialNumber ?? "").trim(),
      roomNumber: String(raw.roomNumber ?? "").trim()
    };
  } catch {
    return null;
  }
}

export function prepareJandarmaArrival(
  input: KbsDeliveryInput,
  now = new Date()
): JandarmaArrivalPreparation {
  if (input.kind !== "arrival") {
    return { ok: false, path: "invalid", message: "Bu sözleşme yalnız giriş bildirimi içindir." };
  }

  const identityNumber = input.identity.identityNumber.replace(/\D/g, "");
  if (identityNumber.length !== 11) {
    return {
      ok: false,
      path: "foreign_document",
      message: "11 haneli TCK/YKN bulunmadığı için Jandarma yabancı belge bildirim metodu kullanılmalı."
    };
  }

  const roomNumber = (input.roomNumber || input.identity.roomNumber).trim();
  if (!roomNumber) {
    return { ok: false, path: "invalid", message: "Konaklama bildirimi için oda numarası gerekli." };
  }
  if (roomNumber.length > 15) {
    return { ok: false, path: "invalid", message: "Jandarma KBS oda numarası en fazla 15 karakter olabilir." };
  }

  const occurredAt = new Date(input.occurredAt);
  if (!Number.isFinite(occurredAt.getTime())) {
    return { ok: false, path: "invalid", message: "KBS giriş zamanı geçerli değil." };
  }

  const nationality = normalizeNationality(input.identity.nationality);
  return {
    ok: true,
    path: "identity_number",
    draft: {
      identityNumber,
      countryEnumName: nationality === "turkiye" ? "TURKIYE" : input.identity.nationality.trim().toLocaleUpperCase("tr-TR"),
      roomNumber,
      arrivalAt: formatJandarmaDate(occurredAt),
      phone: "",
      usageEnumName: "KONAKLAMA",
      futureDated: occurredAt.getTime() > now.getTime()
    }
  };
}

export function hasKbsIdentityMinimum(identity: KbsIdentitySnapshot): boolean {
  return Boolean(
    identity.identityType
    && identity.identityNumber
    && identity.nationality
    && identity.birthDate
  );
}

function normalizeNationality(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/\s+/g, "");
}

function formatJandarmaDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
}
