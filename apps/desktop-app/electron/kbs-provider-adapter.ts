import type { KbsProvider } from "./kbs-settings.js";

export interface KbsIdentitySnapshot {
  customerId: string;
  fullName: string;
  identityType: string;
  identityNumber: string;
  nationality: string;
  birthDate: string;
  documentSerialNumber: string;
  documentExpiryDate: string;
  gender: string;
  birthPlace: string;
  motherName: string;
  fatherName: string;
  issuingAuthority: string;
  address: string;
  phone: string;
  roomNumber: string;
}

export interface KbsDeliveryInput {
  /** Stable logical delivery identity, not a claim of provider-side deduplication support. */
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
      state: "waiting" | "interaction_required" | "failed" | "submission_unknown";
      message: string;
      provider: KbsProvider;
      retryable: boolean;
      code?: string;
      /** waiting/interaction_required promise no submission. A failed response needs
       * explicit rejection evidence to reopen the fence; missing evidence is unknown. */
      submission?: "rejected" | "unknown";
    };

export interface KbsProviderAdapter {
  readonly provider: KbsProvider;
  send(input: KbsDeliveryInput): Promise<KbsDeliveryResult>;
}

type JandarmaResultCode = 0 | 100 | 101 | 102 | 103 | 104 | 105 | 106 | 107 | 108;

export interface JandarmaOperationResult {
  successful: boolean;
  code: JandarmaResultCode;
  message: string;
}

export function classifyJandarmaOperationResult(
  input: JandarmaOperationResult,
  notificationId: string
): KbsDeliveryResult {
  if (input.successful && input.code === 100) {
    return {
      ok: true,
      state: "sent",
      provider: "jandarma",
      providerReference: "",
      message: input.message || "Jandarma KBS bildirimi başarıyla gönderildi."
    };
  }

  const retryable = input.code === 0
    || input.code === 102
    || input.code === 103
    || input.code === 104
    || input.code === 105
    || input.code === 106
    || input.code === 107
    || input.code === 108;

  return {
    ok: false,
    state: "failed",
    provider: "jandarma",
    retryable,
    // A result code is not a verified guarantee that no remote side effect occurred.
    // Native receipt/query/idempotency support is not implemented by this binding.
    submission: "unknown",
    code: "jandarma_" + String(input.code),
    message: input.message || jandarmaResultMessage(input.code, notificationId)
  };
}

type JandarmaOperationName =
  | "MusteriKimlikNoGiris"
  | "MusteriKimlikNoCikis"
  | "MusteriKimlikNoGuncelle"
  | "MusteriYabanciGiris"
  | "MusteriYabanciCikis"
  | "MusteriYabanciGuncelle";

interface JandarmaOperationSelection {
  operation: JandarmaOperationName;
  identityPath: "identity_number" | "foreign_document";
  roomNumber: string;
  occurredAt: string;
  identity: KbsIdentitySnapshot;
}

type JandarmaOperationSelectionResult =
  | { ok: true; selection: JandarmaOperationSelection }
  | { ok: false; message: string };

export function selectJandarmaOperation(input: KbsDeliveryInput): JandarmaOperationSelectionResult {
  const roomNumber = (input.roomNumber || input.identity.roomNumber).trim();
  if (!roomNumber) return { ok: false, message: "Konaklama bildirimi için oda numarası gerekli." };
  if (roomNumber.length > 15) return { ok: false, message: "Jandarma KBS oda numarası en fazla 15 karakter olabilir." };

  const occurredAt = new Date(input.occurredAt);
  if (!Number.isFinite(occurredAt.getTime())) {
    return { ok: false, message: "KBS işlem zamanı geçerli değil." };
  }

  const hasIdentityNumber = input.identity.identityNumber.replace(/\D/g, "").length === 11;
  if (!hasIdentityNumber && !input.identity.documentSerialNumber) {
    return { ok: false, message: "Jandarma KBS için 11 haneli TCK/YKN veya yabancı belge numarası gerekli." };
  }

  // The official contract uses KimlikNo operations for both TCK and YKN.
  // Yabanci operations are for guests reported by foreign document details.
  const operation = hasIdentityNumber
    ? input.kind === "arrival"
      ? "MusteriKimlikNoGiris"
      : input.kind === "departure"
        ? "MusteriKimlikNoCikis"
        : "MusteriKimlikNoGuncelle"
    : input.kind === "arrival"
      ? "MusteriYabanciGiris"
      : input.kind === "departure"
        ? "MusteriYabanciCikis"
        : "MusteriYabanciGuncelle";

  return {
    ok: true,
    selection: {
      operation,
      identityPath: hasIdentityNumber ? "identity_number" : "foreign_document",
      roomNumber,
      occurredAt: formatJandarmaDate(occurredAt),
      identity: input.identity
    }
  };
}

/**
 * Semantic representation of the documented Jandarma
 * MusteriKimlikNoGirisTalep contract.
 *
 * Enum wire values are deliberately not guessed here. They are resolved from
 * Jandarma ParametreListele metadata when the SOAP binding is available.
 */
interface JandarmaKimlikNoArrivalDraft {
  identityNumber: string;
  countryEnumName: string;
  roomNumber: string;
  arrivalAt: string;
  phone: string;
  usageEnumName: "KONAKLAMA";
  futureDated: boolean;
}

type JandarmaArrivalPreparation =
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
      documentExpiryDate: String(raw.documentExpiryDate ?? "").trim(),
      gender: String(raw.gender ?? "").trim(),
      birthPlace: String(raw.birthPlace ?? "").trim(),
      motherName: String(raw.motherName ?? "").trim(),
      fatherName: String(raw.fatherName ?? "").trim(),
      issuingAuthority: String(raw.issuingAuthority ?? "").trim(),
      address: String(raw.address ?? "").trim(),
      phone: String(raw.phone ?? "").trim(),
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

  return {
    ok: true,
    path: "identity_number",
    draft: {
      identityNumber,
      countryEnumName: isTurkeyNationality(input.identity.nationality) ? "TURKIYE" : input.identity.nationality.trim().toLocaleUpperCase("tr-TR"),
      roomNumber,
      arrivalAt: formatJandarmaDate(occurredAt),
      phone: input.identity.phone,
      usageEnumName: "KONAKLAMA",
      futureDated: occurredAt.getTime() > now.getTime()
    }
  };
}

export function hasKbsIdentityMinimum(identity: KbsIdentitySnapshot): boolean {
  return Boolean(
    identity.identityType
    && (identity.identityNumber || identity.documentSerialNumber)
    && identity.nationality
    && identity.birthDate
  );
}

function isTurkeyNationality(value: string): boolean {
  const normalized = normalizeNationality(value);
  return ["tr", "tc", "turkiye", "turkey", "turkiyecumhuriyeti"].includes(normalized);
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


function jandarmaResultMessage(code: JandarmaResultCode, notificationId: string): string {
  switch (code) {
    case 101: return "Jandarma KBS kaydı bulunamadı.";
    case 102: return "Jandarma KBS yeni kayıt işlemi başarısız.";
    case 103: return "Jandarma KBS güncelleme işlemi başarısız.";
    case 104: return "Jandarma KBS çıkış işlemi başarısız.";
    case 105: return "Jandarma KBS veritabanı hatası verdi; işlem yeniden denenebilir.";
    case 107: return "Jandarma KBS gönderim verilerinden birini geçersiz buldu.";
    case 108: return "Jandarma KBS yetkilendirmesi başarısız. Tesis kodu, kullanıcı, şifre ve tanımlı IP adresini kontrol edin.";
    default: return "Jandarma KBS işlemi tamamlanamadı" + (notificationId ? " (" + notificationId + ")" : "") + ".";
  }
}
