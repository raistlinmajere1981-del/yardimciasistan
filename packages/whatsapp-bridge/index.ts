export { buildCustomerCreditWhatsAppMessage, customerCreditWhatsAppFingerprint } from "./customer-credit.js";
export {
  createWhatsAppFillMessageScript,
  createWhatsAppInspectionScript,
  createWhatsAppSendScript,
  type WhatsAppDomResult
} from "./webview.js";

export type WhatsAppMode = "wa_link" | "manual_copy" | "webview" | "official_api";

export type WhatsAppBridgeMode = WhatsAppMode | "official_api_future";

export type WhatsAppBridgeErrorCode = "invalid_phone" | "empty_message" | "unsupported_mode";

export interface WhatsAppLinkSuccess {
  ok: true;
  mode: "wa_link";
  url: string;
  whatsappPhone: string;
  phoneDisplay: string;
  message: string;
  encodedMessage: string;
}

export interface WhatsAppBridgeError {
  ok: false;
  mode: WhatsAppBridgeMode;
  code: WhatsAppBridgeErrorCode;
  message: string;
}

export type WhatsAppLinkResult = WhatsAppLinkSuccess | WhatsAppBridgeError;

export interface ManualCopyPayload {
  ok: true;
  mode: "manual_copy";
  phoneInput: string;
  phoneDisplay: string;
  whatsappPhone: string;
  message: string;
}

export interface WebViewPayload {
  ok: true;
  mode: "webview";
  homeUrl: string;
  phoneDisplay: string;
  whatsappPhone: string;
  message: string;
  url: string;
  webviewTarget: {
    homeUrl: string;
    url: string;
    customerPhone: string;
  };
  fallback: ManualCopyPayload;
}

export interface OfficialApiFuturePayload {
  ok: false;
  mode: "official_api_future";
  code: "unsupported_mode";
  message: string;
  fallback: ManualCopyPayload;
}

export type WhatsAppAction = WhatsAppLinkSuccess | ManualCopyPayload | WebViewPayload | OfficialApiFuturePayload | WhatsAppBridgeError;

export interface PrepareWhatsAppActionInput {
  phone: string;
  message: string;
  preferredMode?: WhatsAppBridgeMode;
}

export type CustomerRequestType = "pension_reservation" | "restaurant_reservation" | "general_info" | string;

export interface CustomerRequestWhatsAppMessageInput {
  request_type: CustomerRequestType;
  customer_name: string;
  customer_phone: string;
  date_text: string;
  guest_count: number | string;
  message?: string;
  time_text?: string;
}

const REQUEST_TYPE_TEXT: Record<string, string> = {
  pension_reservation: "Pansiyon rezervasyonu",
  restaurant_reservation: "Masa rezervasyonu",
  general_info: "Bilgi talebi"
};

const DEFAULT_REPLY_MESSAGE = "Merhaba, talebiniz için teşekkür ederiz. Size en kısa sürede dönüş yapacağız.";
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;
const TR_MOBILE_PATTERN = /^5\d{9}$/;
const PHONE_ERROR = "Telefon numarası geçerli formatta olmalı. Yurt dışı numaralarında ülke kodunu ekleyin. Örnek: +90 532 123 45 67 veya +44 7911 123456";
export const WHATSAPP_WEB_HOME_URL = "https://web.whatsapp.com/";

export function createWhatsAppLink(phone: string, message: string): WhatsAppLinkResult {
  const normalizedPhone = normalizeInternationalPhone(phone);
  if (!normalizedPhone.ok) {
    return {
      ok: false,
      mode: "wa_link",
      code: "invalid_phone",
      message: normalizedPhone.error
    };
  }

  const cleanMessage = message.trim();
  if (!cleanMessage) {
    return {
      ok: false,
      mode: "wa_link",
      code: "empty_message",
      message: "WhatsApp mesajı boş olmamalı."
    };
  }

  const encodedMessage = encodeURIComponent(cleanMessage);
  return {
    ok: true,
    mode: "wa_link",
    url: `https://wa.me/${normalizedPhone.whatsapp}?text=${encodedMessage}`,
    whatsappPhone: normalizedPhone.whatsapp,
    phoneDisplay: normalizedPhone.display,
    message: cleanMessage,
    encodedMessage
  };
}

export function createWhatsAppUrl(phone: string, message: string): string {
  const link = createWhatsAppLink(phone, message);
  return link.ok ? link.url : "";
}

export function createWhatsAppWebUrl(phone: string, message: string): string {
  const link = createWhatsAppLink(phone, message);
  return link.ok ? `${WHATSAPP_WEB_HOME_URL}send?phone=${link.whatsappPhone}&text=${link.encodedMessage}` : "";
}

export function createManualCopyPayload(phone: string, message: string): ManualCopyPayload | WhatsAppBridgeError {
  const cleanMessage = message.trim();
  if (!cleanMessage) {
    return {
      ok: false,
      mode: "manual_copy",
      code: "empty_message",
      message: "WhatsApp mesajı boş olmamalı."
    };
  }

  const normalizedPhone = normalizeInternationalPhone(phone);
  return {
    ok: true,
    mode: "manual_copy",
    phoneInput: phone.trim(),
    phoneDisplay: normalizedPhone.ok ? normalizedPhone.display : phone.trim(),
    whatsappPhone: normalizedPhone.ok ? normalizedPhone.whatsapp : "",
    message: cleanMessage
  };
}

export function prepareWhatsAppAction(input: PrepareWhatsAppActionInput): WhatsAppAction {
  const mode = normalizeBridgeMode(input.preferredMode ?? "wa_link");
  const message = input.message.trim();

  if (!message) {
    return {
      ok: false,
      mode,
      code: "empty_message",
      message: "WhatsApp mesajı boş olmamalı."
    };
  }

  if (mode === "manual_copy") {
    return createManualCopyPayload(input.phone, message);
  }

  const link = createWhatsAppLink(input.phone, message);
  if (!link.ok) {
    return {
      ...link,
      mode
    };
  }

  if (mode === "webview") {
    const webUrl = `${WHATSAPP_WEB_HOME_URL}send?phone=${link.whatsappPhone}&text=${link.encodedMessage}`;

    return {
      ok: true,
      mode: "webview",
      homeUrl: WHATSAPP_WEB_HOME_URL,
      phoneDisplay: link.phoneDisplay,
      whatsappPhone: link.whatsappPhone,
      message: link.message,
      url: webUrl,
      webviewTarget: {
        homeUrl: WHATSAPP_WEB_HOME_URL,
        url: webUrl,
        customerPhone: link.whatsappPhone
      },
      fallback: {
        ok: true,
        mode: "manual_copy",
        phoneInput: input.phone.trim(),
        phoneDisplay: link.phoneDisplay,
        whatsappPhone: link.whatsappPhone,
        message: link.message
      }
    };
  }

  if (mode === "official_api_future") {
    return {
      ok: false,
      mode: "official_api_future",
      code: "unsupported_mode",
      message: "Resmi WhatsApp API adaptörü sonraki faz için ayrıldı.",
      fallback: {
        ok: true,
        mode: "manual_copy",
        phoneInput: input.phone.trim(),
        phoneDisplay: link.phoneDisplay,
        whatsappPhone: link.whatsappPhone,
        message: link.message
      }
    };
  }

  return link;
}

export function buildCustomerRequestWhatsAppMessage(input: CustomerRequestWhatsAppMessageInput, businessName: string): string {
  const typeText = REQUEST_TYPE_TEXT[input.request_type] ?? "Bilgi talebi";

  return [
    `Merhaba, ${businessName} için talep oluşturmak istiyorum.`,
    `Talep türü: ${typeText}`,
    `Ad soyad: ${input.customer_name}`,
    `Telefon: ${input.customer_phone}`,
    `Tarih: ${input.date_text}`,
    input.time_text ? `Saat: ${input.time_text}` : "",
    `Kişi sayısı: ${input.guest_count}`,
    input.message ? `Not: ${input.message}` : "",
    "Lütfen bilgileri kontrol edip gönder tuşuna basın."
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildOwnerReplyWhatsAppMessage(message?: string): string {
  return message?.trim() || DEFAULT_REPLY_MESSAGE;
}

export function normalizeInternationalPhone(phone: string): { ok: true; whatsapp: string; e164: string; national: string; display: string } | { ok: false; error: string } {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone.ok) return { ok: false, error: normalizedPhone.error };
  return { ok: true, whatsapp: normalizedPhone.whatsapp, e164: normalizedPhone.e164, national: normalizedPhone.national, display: formatPhoneForDisplay(phone) };
}

/** @deprecated Use normalizeInternationalPhone. */
export function normalizeTRMobilePhone(phone: string) {
  return normalizeInternationalPhone(phone);
}

function normalizeBridgeMode(mode: WhatsAppBridgeMode): Exclude<WhatsAppBridgeMode, "official_api"> {
  return mode === "official_api" ? "official_api_future" : mode;
}

function normalizePhone(phone: string): { ok: true; e164: string; national: string; whatsapp: string } | { ok: false; error: string } {
  const input = phone.trim();
  const compact = normalizePhoneCharacters(input);
  let e164 = "";

  if (compact.startsWith("+")) {
    if (!E164_PATTERN.test(compact)) return { ok: false, error: PHONE_ERROR };
    if (compact.startsWith("+90") && !TR_MOBILE_PATTERN.test(compact.slice(3))) return { ok: false, error: PHONE_ERROR };
    e164 = compact;
  } else {
    const national = toTRNationalNumber(compact);
    if (!national || !TR_MOBILE_PATTERN.test(national)) return { ok: false, error: PHONE_ERROR };
    e164 = `+90${national}`;
  }

  const digits = e164.slice(1);
  return { ok: true, e164, national: e164.startsWith("+90") ? e164.slice(3) : digits, whatsapp: digits };
}

function formatPhoneForDisplay(phone: string): string {
  const result = normalizePhone(phone);
  if (!result.ok) return phone.trim();
  if (result.e164.startsWith("+90") && result.national.length === 10) {
    const part1 = result.national.slice(0, 3);
    const part2 = result.national.slice(3, 6);
    const part3 = result.national.slice(6, 8);
    const part4 = result.national.slice(8, 10);
    return `+90 ${part1} ${part2} ${part3} ${part4}`;
  }
  return result.e164;
}

function normalizePhoneCharacters(input: string): string {
  if (!input || !/^[+\d\s().\/-]+$/.test(input)) return "";
  const compact = input.replace(/[\s().\/-]/g, "");
  return compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
}

function toTRNationalNumber(value: string): string | null {
  if (value.startsWith("90") && value.length === 12) return value.slice(2);
  if (value.startsWith("0") && value.length === 11) return value.slice(1);
  if (value.length === 10) return value;
  return null;
}
