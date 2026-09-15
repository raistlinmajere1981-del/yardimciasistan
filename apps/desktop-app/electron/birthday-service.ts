import { DatabaseSync } from "node:sqlite";
import {
  createId,
  evaluateBirthdayCustomer,
  birthdayDateForYear,
  getLocalIsoDate,
  normalizeBirthdaySettings,
  renderBirthdayMessage,
  validateBirthdayMessageTemplate,
  type BirthdayDeliveryLike,
  type BirthdayDeliveryStatus,
  type BirthdayEligibilityStatus,
  type BirthdayMode,
  type BirthdaySettings
} from "@yardimci-asistan/shared";
import { prepareWhatsAppAction, type WhatsAppAction } from "@yardimci-asistan/whatsapp-bridge";

type VisibleBirthdayEligibility = Extract<BirthdayEligibilityStatus, "due" | "prepared" | "already_sent" | "invalid_phone">;

export interface DesktopBirthdayDelivery {
  id: string;
  customerId: string;
  birthdayYear: number;
  birthdayDate: string;
  mode: BirthdayMode;
  message: string;
  status: BirthdayDeliveryStatus;
  preparedAt: string;
  sentAt: string;
  failedAt: string;
  error: string;
  createdAt: string;
  updatedAt: string;
}

export interface DesktopBirthdayCandidate {
  customerId: string;
  customerName: string;
  phone: string;
  normalizedPhone: string;
  birthDate: string;
  birthdayDate: string;
  eligibility: VisibleBirthdayEligibility;
  deliveryId: string;
  deliveryStatus: BirthdayDeliveryStatus | "";
  message: string;
}

export interface DesktopBirthdayOverview {
  enabled: boolean;
  mode: BirthdayMode;
  today: string;
  candidates: DesktopBirthdayCandidate[];
  dueCount: number;
  preparedCount: number;
  sentCount: number;
  invalidPhoneCount: number;
}

export type BirthdayPreparationErrorCode =
  | "feature_disabled"
  | "customer_not_found"
  | "not_birthday"
  | "excluded"
  | "already_sent"
  | "invalid_birth_date"
  | "invalid_phone"
  | "template_invalid"
  | "whatsapp_unavailable";

export type DesktopBirthdayPrepareResult =
  | {
      ok: true;
      action: WhatsAppAction;
      candidate: DesktopBirthdayCandidate;
      delivery: DesktopBirthdayDelivery;
    }
  | {
      ok: false;
      code: BirthdayPreparationErrorCode;
      message: string;
    };

export function getBirthdayOverview(db: DatabaseSync, now = new Date()): DesktopBirthdayOverview {
  const settings = readBirthdaySettings(db);
  const today = getLocalIsoDate(now);
  if (!settings.enabled) {
    return emptyOverview(settings, today);
  }

  const year = Number(today.slice(0, 4));
  const businessName = readBusinessName(db);
  const deliveries = readDeliveries(db, year);
  const customers = db
    .prepare(`
      SELECT id, full_name, phone, birth_date, birthday_message_enabled
      FROM customers
      WHERE deleted_at = ''
      ORDER BY full_name COLLATE NOCASE ASC
    `)
    .all() as Array<Record<string, unknown>>;

  const candidates = customers
    .map((row) => {
      const customerId = String(row.id ?? "");
      const delivery = deliveries.get(customerId);
      const customer = {
        id: customerId,
        fullName: String(row.full_name ?? ""),
        phone: String(row.phone ?? ""),
        birthDate: String(row.birth_date ?? ""),
        birthdayMessageEnabled: normalizeBoolean(row.birthday_message_enabled, true)
      };
      const eligibility = evaluateBirthdayCustomer(customer, today, delivery);
      if (!isVisibleEligibility(eligibility.status)) return null;
      const birthdayDate = birthdayDateForYear(customer.birthDate, year) ?? today;
      return {
        customerId,
        customerName: customer.fullName,
        phone: customer.phone,
        normalizedPhone: eligibility.phone,
        birthDate: customer.birthDate,
        birthdayDate,
        eligibility: eligibility.status,
        deliveryId: delivery?.id ?? "",
        deliveryStatus: delivery?.status ?? "",
        message: renderBirthdayMessage(settings.messageTemplate, customer, businessName)
      } satisfies DesktopBirthdayCandidate;
    })
    .filter((candidate): candidate is DesktopBirthdayCandidate => Boolean(candidate));

  return buildOverview(settings, today, candidates);
}

export function prepareBirthdayWhatsApp(db: DatabaseSync, customerIdInput: string, now = new Date()): DesktopBirthdayPrepareResult {
  const customerId = customerIdInput.trim();
  const settings = readBirthdaySettings(db);
  const today = getLocalIsoDate(now);
  if (!settings.enabled) {
    return { ok: false, code: "feature_disabled", message: "Doğum günü mesajları ayarlardan kapatılmış." };
  }

  const row = db
    .prepare(`
      SELECT id, full_name, phone, birth_date, birthday_message_enabled
      FROM customers
      WHERE id = ? AND deleted_at = ''
    `)
    .get(customerId) as Record<string, unknown> | undefined;
  if (!row) {
    return { ok: false, code: "customer_not_found", message: "Doğum günü müşterisi bulunamadı veya silinmiş." };
  }

  const year = Number(today.slice(0, 4));
  const existingDelivery = readDelivery(db, customerId, year);
  const customer = {
    id: customerId,
    fullName: String(row.full_name ?? ""),
    phone: String(row.phone ?? ""),
    birthDate: String(row.birth_date ?? ""),
    birthdayMessageEnabled: normalizeBoolean(row.birthday_message_enabled, true)
  };
  const eligibility = evaluateBirthdayCustomer(customer, today, existingDelivery);
  if (eligibility.status === "excluded") {
    return { ok: false, code: "excluded", message: "Bu müşteri doğum günü mesajlarından hariç tutulmuş." };
  }
  if (eligibility.status === "not_birthday") {
    return { ok: false, code: "not_birthday", message: "Bu müşterinin doğum günü bugün değil." };
  }
  if (eligibility.status === "invalid_birth_date") {
    return { ok: false, code: "invalid_birth_date", message: "Müşterinin doğum tarihi geçerli değil." };
  }
  if (eligibility.status === "already_sent") {
    return { ok: false, code: "already_sent", message: "Bu müşteriye bu yıl doğum günü mesajı gönderilmiş." };
  }
  if (eligibility.status === "invalid_phone") {
    return { ok: false, code: "invalid_phone", message: "Doğum günü mesajı için geçerli bir Türkiye cep telefonu gerekli." };
  }

  const templateError = validateBirthdayMessageTemplate(settings.messageTemplate);
  if (templateError) {
    return { ok: false, code: "template_invalid", message: templateError };
  }

  const businessName = readBusinessName(db);
  const message = renderBirthdayMessage(settings.messageTemplate, customer, businessName);
  let action = prepareWhatsAppAction({
    phone: customer.phone,
    message,
    preferredMode: readWhatsAppMode(db)
  });
  if (!action.ok && action.mode === "official_api_future" && "fallback" in action && action.fallback.ok) {
    action = action.fallback;
  }
  if (!action.ok && action.code === "invalid_phone") {
    return { ok: false, code: "invalid_phone", message: action.message };
  }
  if (!action.ok && action.code === "empty_message") {
    return { ok: false, code: "template_invalid", message: action.message };
  }
  if (!action.ok && action.code === "unsupported_mode") {
    return { ok: false, code: "whatsapp_unavailable", message: action.message };
  }

  const nowIso = now.toISOString();
  const birthdayDate = birthdayDateForYear(customer.birthDate, year) ?? today;
  const deliveryId = existingDelivery?.id ?? createId("birthday_delivery_");
  db.prepare(`
    INSERT INTO birthday_message_deliveries (
      id, customer_id, birthday_year, birthday_date, mode, message, status,
      prepared_at, sent_at, failed_at, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'prepared', ?, '', '', '', ?, ?)
    ON CONFLICT(customer_id, birthday_year) DO UPDATE SET
      birthday_date = excluded.birthday_date,
      mode = excluded.mode,
      message = excluded.message,
      status = 'prepared',
      prepared_at = excluded.prepared_at,
      sent_at = '',
      failed_at = '',
      error = '',
      updated_at = excluded.updated_at
  `).run(
    deliveryId,
    customerId,
    year,
    birthdayDate,
    settings.mode,
    message,
    nowIso,
    existingDelivery?.createdAt ?? nowIso,
    nowIso
  );

  const delivery = readDelivery(db, customerId, year);
  if (!delivery) {
    return { ok: false, code: "whatsapp_unavailable", message: "Doğum günü hazırlama kaydı oluşturulamadı." };
  }

  const candidate: DesktopBirthdayCandidate = {
    customerId,
    customerName: customer.fullName,
    phone: customer.phone,
    normalizedPhone: eligibility.phone,
    birthDate: customer.birthDate,
    birthdayDate,
    eligibility: "prepared",
    deliveryId: delivery.id,
    deliveryStatus: delivery.status,
    message
  };
  return { ok: true, action, candidate, delivery };
}

function readBirthdaySettings(db: DatabaseSync): BirthdaySettings {
  const row = db.prepare("SELECT birthday_enabled, birthday_mode, birthday_send_time, birthday_message_template FROM settings WHERE deleted_at = '' LIMIT 1").get() as Record<string, unknown> | undefined;
  return normalizeBirthdaySettings({
    enabled: normalizeBoolean(row?.birthday_enabled, true),
    mode: row?.birthday_mode === "automatic" ? "automatic" : "manual",
    sendTime: String(row?.birthday_send_time ?? "10:00"),
    messageTemplate: String(row?.birthday_message_template ?? "")
  });
}

function readBusinessName(db: DatabaseSync): string {
  const row = db.prepare("SELECT display_name FROM business WHERE deleted_at = '' LIMIT 1").get() as { display_name?: string } | undefined;
  return String(row?.display_name ?? "");
}

function readWhatsAppMode(db: DatabaseSync): "wa_link" | "manual_copy" | "webview" | "official_api_future" {
  const row = db.prepare("SELECT whatsapp_mode FROM settings WHERE deleted_at = '' LIMIT 1").get() as { whatsapp_mode?: string } | undefined;
  const mode = String(row?.whatsapp_mode ?? "webview");
  return mode === "wa_link" || mode === "manual_copy" || mode === "official_api_future" ? mode : "webview";
}

function readDeliveries(db: DatabaseSync, year: number): Map<string, BirthdayDeliveryLikeWithId> {
  const rows = db
    .prepare("SELECT * FROM birthday_message_deliveries WHERE birthday_year = ?")
    .all(year) as Array<Record<string, unknown>>;
  return new Map(rows.map((row) => {
    const delivery = mapDelivery(row);
    return [delivery.customerId, delivery];
  }));
}

function readDelivery(db: DatabaseSync, customerId: string, year: number): BirthdayDeliveryLikeWithId | undefined {
  const row = db
    .prepare("SELECT * FROM birthday_message_deliveries WHERE customer_id = ? AND birthday_year = ? LIMIT 1")
    .get(customerId, year) as Record<string, unknown> | undefined;
  return row ? mapDelivery(row) : undefined;
}

interface BirthdayDeliveryLikeWithId extends BirthdayDeliveryLike {
  id: string;
  birthdayDate: string;
  mode: BirthdayMode;
  message: string;
  preparedAt: string;
  sentAt: string;
  failedAt: string;
  error: string;
  createdAt: string;
  updatedAt: string;
}

function mapDelivery(row: Record<string, unknown>): BirthdayDeliveryLikeWithId {
  return {
    id: String(row.id ?? ""),
    customerId: String(row.customer_id ?? ""),
    birthdayYear: Number(row.birthday_year ?? 0),
    birthdayDate: String(row.birthday_date ?? ""),
    mode: row.mode === "automatic" ? "automatic" : "manual",
    message: String(row.message ?? ""),
    status: normalizeDeliveryStatus(row.status),
    preparedAt: String(row.prepared_at ?? ""),
    sentAt: String(row.sent_at ?? ""),
    failedAt: String(row.failed_at ?? ""),
    error: String(row.error ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function normalizeDeliveryStatus(value: unknown): BirthdayDeliveryStatus {
  return value === "prepared" || value === "sent" || value === "skipped" || value === "failed" ? value : "pending";
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function isVisibleEligibility(value: BirthdayEligibilityStatus): value is VisibleBirthdayEligibility {
  return value === "due" || value === "prepared" || value === "already_sent" || value === "invalid_phone";
}

function emptyOverview(settings: BirthdaySettings, today: string): DesktopBirthdayOverview {
  return {
    enabled: settings.enabled,
    mode: settings.mode,
    today,
    candidates: [],
    dueCount: 0,
    preparedCount: 0,
    sentCount: 0,
    invalidPhoneCount: 0
  };
}

function buildOverview(settings: BirthdaySettings, today: string, candidates: DesktopBirthdayCandidate[]): DesktopBirthdayOverview {
  return {
    enabled: settings.enabled,
    mode: settings.mode,
    today,
    candidates,
    dueCount: candidates.filter((candidate) => candidate.eligibility === "due").length,
    preparedCount: candidates.filter((candidate) => candidate.eligibility === "prepared").length,
    sentCount: candidates.filter((candidate) => candidate.eligibility === "already_sent").length,
    invalidPhoneCount: candidates.filter((candidate) => candidate.eligibility === "invalid_phone").length
  };
}
