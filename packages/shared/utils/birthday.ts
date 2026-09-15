import type {
  BirthdayCustomerLike,
  BirthdayDeliveryLike,
  BirthdayEligibilityStatus,
  BirthdayMode,
  BirthdaySettings
} from "../types/birthday";
import { normalizePhone } from "./phone";

export const BIRTHDAY_MESSAGE_TEMPLATE_MAX_LENGTH = 4000;

const ALLOWED_PLACEHOLDERS = new Set(["{ad}", "{işletme}"]);

export interface BirthdayEligibilityResult {
  status: BirthdayEligibilityStatus;
  phone: string;
}

export interface BirthdayRenderCustomer {
  fullName?: string;
}

export function getLocalIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidBirthdayDate(value: unknown): boolean {
  return parseIsoDateParts(value) !== null;
}

export function isBirthdayOnDate(birthDate: unknown, targetDate: string | Date): boolean {
  const birthParts = parseIsoDateParts(birthDate);
  const targetParts = parseIsoDateParts(typeof targetDate === "string" ? targetDate : getLocalIsoDate(targetDate));
  if (!birthParts || !targetParts) return false;

  if (birthParts.month === 2 && birthParts.day === 29 && !isLeapYear(targetParts.year)) {
    return targetParts.month === 2 && targetParts.day === 28;
  }

  return birthParts.month === targetParts.month && birthParts.day === targetParts.day;
}

export function birthdayDateForYear(birthDate: string, year: number): string | null {
  const parts = parseIsoDateParts(birthDate);
  if (!parts || !Number.isInteger(year) || year < 1 || year > 9999) return null;
  const day = parts.month === 2 && parts.day === 29 && !isLeapYear(year) ? 28 : parts.day;
  return `${String(year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function evaluateBirthdayCustomer(
  customer: BirthdayCustomerLike,
  targetDate: string | Date,
  delivery?: BirthdayDeliveryLike
): BirthdayEligibilityResult {
  const target = typeof targetDate === "string" ? targetDate : getLocalIsoDate(targetDate);
  const targetParts = parseIsoDateParts(target);
  if (customer.deletedAt) return { status: "excluded", phone: "" };
  if (customer.birthdayMessageEnabled === false) return { status: "excluded", phone: "" };
  if (!isValidBirthdayDate(customer.birthDate) || !targetParts) {
    return { status: "invalid_birth_date", phone: "" };
  }
  if (!isBirthdayOnDate(customer.birthDate, target)) {
    return { status: "not_birthday", phone: "" };
  }

  if (delivery?.status === "sent") return { status: "already_sent", phone: "" };
  const phone = normalizeValidPhone(customer.phone);
  if (!phone) return { status: "invalid_phone", phone: "" };
  if (delivery?.status === "prepared") return { status: "prepared", phone };
  return { status: "due", phone };
}

export function renderBirthdayMessage(
  template: string,
  customer: BirthdayRenderCustomer,
  businessName?: string
): string {
  const name = customer.fullName?.trim() || "Müşterimiz";
  const business = businessName?.trim() || "işletmemiz";
  return template
    .replaceAll("{ad}", name)
    .replaceAll("{işletme}", business)
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function validateBirthdayMessageTemplate(value: unknown): string | null {
  const template = String(value ?? "").trim();
  if (!template) return "Doğum günü mesajı boş bırakılamaz.";
  if (template.length > BIRTHDAY_MESSAGE_TEMPLATE_MAX_LENGTH) {
    return `Doğum günü mesajı en fazla ${BIRTHDAY_MESSAGE_TEMPLATE_MAX_LENGTH} karakter olabilir.`;
  }

  const placeholders = template.match(/\{[^{}]*\}/g) ?? [];
  if (placeholders.some((placeholder) => !ALLOWED_PLACEHOLDERS.has(placeholder))) {
    return "Doğum günü mesajında yalnızca {ad} ve {işletme} kullanılabilir.";
  }
  return null;
}

export function normalizeBirthdaySettings(input?: Partial<BirthdaySettings> | null): BirthdaySettings {
  const mode: BirthdayMode = input?.mode === "automatic" ? "automatic" : "manual";
  const sendTime = /^\d{2}:[0-5]\d$/.test(String(input?.sendTime ?? ""))
    ? String(input?.sendTime)
    : "10:00";
  const messageTemplate = String(input?.messageTemplate ?? "").trim() ||
    "Doğum gününüz kutlu olsun {ad}! 🎉 {işletme} olarak sağlıklı ve güzel bir yıl dileriz.";

  return {
    enabled: normalizeBoolean(input?.enabled, true),
    mode,
    sendTime,
    messageTemplate
  };
}

export function validateBirthdaySettings(input: Partial<BirthdaySettings> | null | undefined): string | null {
  const settings = normalizeBirthdaySettings(input);
  if (input?.mode !== undefined && input.mode !== "manual" && input.mode !== "automatic") {
    return "Doğum günü gönderim modu geçersiz.";
  }
  if (input?.sendTime !== undefined && !/^\d{2}:[0-5]\d$/.test(String(input.sendTime))) {
    return "Doğum günü gönderim saati geçersiz.";
  }
  return validateBirthdayMessageTemplate(settings.messageTemplate);
}

function normalizeValidPhone(phone: string): string {
  const result = normalizePhone(String(phone ?? ""));
  return result.ok ? result.e164 : "";
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function parseIsoDateParts(value: unknown): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
