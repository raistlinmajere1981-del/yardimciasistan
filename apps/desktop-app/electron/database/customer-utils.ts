import { normalizePhone } from "@yardimci-asistan/shared";
import type { CustomerGender, CustomerIdentityType } from "@yardimci-asistan/shared";
import type { SaveCustomerInput } from "../database-types.js";
import { isIsoDate } from "./report-utils.js";

interface NormalizedCustomerInput {
  fullName: string;
  phone: string;
  email: string;
  notes: string;
  tags: string[];
  identityType: CustomerIdentityType;
  identityNumber: string;
  nationality: string;
  birthDate: string;
  gender: CustomerGender;
  documentSerialNumber: string;
  documentExpiryDate: string;
  birthPlace: string;
  motherName: string;
  fatherName: string;
  issuingAuthority: string;
  address: string;
}

export function normalizeCustomerInput(
  input: SaveCustomerInput
): { ok: true; customer: NormalizedCustomerInput } | { ok: false; message: string } {
  const fullName = normalizeCustomerSingleLine(input?.fullName, 160);
  if (fullName.length < 2) {
    return { ok: false, message: "Müşteri adı en az 2 karakter olmalı." };
  }

  const rawPhone = String(input?.phone ?? "").trim();
  const phoneResult = rawPhone ? normalizePhone(rawPhone) : null;
  if (phoneResult && !phoneResult.ok) {
    return { ok: false, message: phoneResult.error };
  }

  const email = normalizeCustomerSingleLine(input?.email, 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "E-posta adresi geçerli biçimde olmalı." };
  }

  const identityType = normalizeCustomerIdentityType(input?.identityType);
  const identityNumber = normalizeIdentityNumber(input?.identityNumber, identityType);
  if (identityNumber === null) {
    return {
      ok: false,
      message: identityType === "tc_identity_card"
        ? "T.C. kimlik numarası 11 haneli ve doğrulanabilir olmalı."
        : "Kimlik veya pasaport numarası geçersiz."
    };
  }

  const birthDate = normalizeOptionalIsoDate(input?.birthDate);
  const documentExpiryDate = normalizeOptionalIsoDate(input?.documentExpiryDate);
  if (birthDate === null || documentExpiryDate === null) {
    return { ok: false, message: "Kimlik tarihleri geçerli gün/ay/yıl biçiminde olmalı." };
  }

  const tags = [...new Set(
    (Array.isArray(input?.tags) ? input.tags : [])
      .map((tag) => normalizeCustomerSingleLine(tag, 40))
      .filter(Boolean)
  )].slice(0, 20);

  return {
    ok: true,
    customer: {
      fullName,
      phone: phoneResult?.ok ? phoneResult.e164 : "",
      email,
      notes: normalizeLimitedText(input?.notes, 4000),
      tags,
      identityType,
      identityNumber,
      nationality: normalizeCustomerSingleLine(input?.nationality, 80),
      birthDate,
      gender: normalizeCustomerGender(input?.gender),
      documentSerialNumber: normalizeCustomerSingleLine(input?.documentSerialNumber, 80).toUpperCase(),
      documentExpiryDate,
      birthPlace: normalizeCustomerSingleLine(input?.birthPlace, 160),
      motherName: normalizeCustomerSingleLine(input?.motherName, 160),
      fatherName: normalizeCustomerSingleLine(input?.fatherName, 160),
      issuingAuthority: normalizeCustomerSingleLine(input?.issuingAuthority, 160),
      address: normalizeLimitedText(input?.address, 2000)
    }
  };
}

export function normalizeCustomerIdentityType(value: unknown): CustomerIdentityType {
  return value === "tc_identity_card" || value === "passport" || value === "other" ? value : "";
}

export function normalizeCustomerGender(value: unknown): CustomerGender {
  return value === "female" || value === "male" || value === "unspecified" ? value : "";
}

function normalizeIdentityNumber(value: unknown, identityType: CustomerIdentityType): string | null {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "");
  if (!normalized) {
    return "";
  }
  if (identityType === "tc_identity_card") {
    return isValidTurkishIdentityNumber(normalized) ? normalized : null;
  }
  return /^[A-Z0-9]{4,32}$/.test(normalized) ? normalized : null;
}

function isValidTurkishIdentityNumber(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) {
    return false;
  }
  const digits = [...value].map(Number);
  const oddSum = (digits[0] ?? 0) + (digits[2] ?? 0) + (digits[4] ?? 0) + (digits[6] ?? 0) + (digits[8] ?? 0);
  const evenSum = (digits[1] ?? 0) + (digits[3] ?? 0) + (digits[5] ?? 0) + (digits[7] ?? 0);
  return ((oddSum * 7 - evenSum) % 10 + 10) % 10 === (digits[9] ?? -1)
    && digits.slice(0, 10).reduce((total, digit) => total + (digit ?? 0), 0) % 10 === (digits[10] ?? -1);
}

function normalizeOptionalIsoDate(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return !normalized ? "" : isIsoDate(normalized) ? normalized : null;
}

function normalizeCustomerSingleLine(value: unknown, limit: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, limit);
}

export function normalizeLimitedText(value: unknown, limit: number): string {
  return String(value ?? "").trim().slice(0, limit);
}
