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

const BIRTHDAY_AUTOMATIC_MAX_ATTEMPTS = 3;
const BIRTHDAY_AUTOMATIC_RETRY_DELAY_MS = 60_000;
const BIRTHDAY_AUTOMATIC_CLAIM_LEASE_MS = 90_000;

type VisibleBirthdayEligibility = Extract<
  BirthdayEligibilityStatus,
  "due" | "prepared" | "already_sent" | "invalid_phone" | "waiting" | "failed"
>;

export interface DesktopBirthdayDelivery {
  id: string;
  customerId: string;
  birthdayYear: number;
  birthdayDate: string;
  mode: BirthdayMode;
  message: string;
  status: BirthdayDeliveryStatus;
  attemptCount: number;
  lastAttemptedAt: string;
  nextAttemptAt: string;
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
  attemptCount: number;
  nextAttemptAt: string;
  error: string;
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
  waitingCount: number;
  failedCount: number;
}

export interface DesktopAutomaticBirthdayClaim {
  id: string;
  customerId: string;
  birthdayYear: number;
  birthdayDate: string;
  mode: BirthdayMode;
  customerName: string;
  phone: string;
  normalizedPhone: string;
  birthDate: string;
  message: string;
  attemptCount: number;
}

export type BirthdayAutomaticClaimResult =
  | { ok: true; candidate: DesktopAutomaticBirthdayClaim }
  | { ok: false; code: "not_due" | "already_sent" | "excluded" | "invalid_phone" | "invalid_birth_date" | "not_birthday" | "retry_wait" | "attempts_exhausted" | "feature_disabled"; message: string };

type BirthdayPreparationErrorCode =
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
      const visibleEligibility = getVisibleEligibility(eligibility.status, delivery, now);
      if (!visibleEligibility) return null;
      const birthdayDate = birthdayDateForYear(customer.birthDate, year) ?? today;
      return {
        customerId,
        customerName: customer.fullName,
        phone: customer.phone,
        normalizedPhone: eligibility.phone,
        birthDate: customer.birthDate,
        birthdayDate,
        eligibility: visibleEligibility,
        deliveryId: delivery?.id ?? "",
        deliveryStatus: delivery?.status ?? "",
        attemptCount: delivery?.attemptCount ?? 0,
        nextAttemptAt: delivery?.nextAttemptAt ?? "",
        error: delivery?.error ?? "",
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
      attempt_count = 0,
      last_attempted_at = '',
      next_attempt_at = '',
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
    attemptCount: delivery.attemptCount,
    nextAttemptAt: delivery.nextAttemptAt,
    error: delivery.error,
    message
  };
  return { ok: true, action, candidate, delivery };
}

function isBirthdaySendTimeReached(sendTime: string, now = new Date()): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(sendTime);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return false;
  return now.getHours() * 60 + now.getMinutes() >= hour * 60 + minute;
}

export function getAutomaticBirthdayCandidates(db: DatabaseSync, now = new Date()): DesktopBirthdayCandidate[] {
  const settings = readBirthdaySettings(db);
  if (!settings.enabled || settings.mode !== "automatic" || !isBirthdaySendTimeReached(settings.sendTime, now)) {
    return [];
  }

  return getBirthdayOverview(db, now).candidates.filter((candidate) => {
    if (candidate.eligibility === "invalid_phone" || candidate.eligibility === "already_sent") return false;
    if (candidate.eligibility === "waiting") {
      return !isFutureTimestamp(candidate.nextAttemptAt, now);
    }
    if (candidate.eligibility === "failed") {
      return candidate.attemptCount < BIRTHDAY_AUTOMATIC_MAX_ATTEMPTS
        && !isFutureTimestamp(candidate.nextAttemptAt, now);
    }
    return candidate.eligibility === "due" || candidate.eligibility === "prepared";
  });
}

export function claimAutomaticBirthdayDelivery(
  db: DatabaseSync,
  customerIdInput: string,
  now = new Date()
): BirthdayAutomaticClaimResult {
  const customerId = customerIdInput.trim();
  const nowIso = now.toISOString();
  const today = getLocalIsoDate(now);
  const year = Number(today.slice(0, 4));
  let began = false;

  try {
    db.exec("BEGIN IMMEDIATE");
    began = true;
    const settings = readBirthdaySettings(db);
    if (!settings.enabled || settings.mode !== "automatic") {
      db.exec("ROLLBACK");
      return { ok: false, code: "feature_disabled", message: "Otomatik doğum günü gönderimi etkin değil." };
    }
    if (!isBirthdaySendTimeReached(settings.sendTime, now)) {
      db.exec("ROLLBACK");
      return { ok: false, code: "not_due", message: "Doğum günü gönderim saati henüz gelmedi." };
    }

    const row = db
      .prepare(`
        SELECT id, full_name, phone, birth_date, birthday_message_enabled
        FROM customers
        WHERE id = ? AND deleted_at = ''
      `)
      .get(customerId) as Record<string, unknown> | undefined;
    if (!row) {
      db.exec("ROLLBACK");
      return { ok: false, code: "excluded", message: "Müşteri bulunamadı veya silinmiş." };
    }

    const existingDelivery = readDelivery(db, customerId, year);
    if (existingDelivery?.status === "sent") {
      db.exec("ROLLBACK");
      return { ok: false, code: "already_sent", message: "Bu müşteriye bu yıl mesaj zaten gönderilmiş." };
    }
    if (existingDelivery && existingDelivery.attemptCount >= BIRTHDAY_AUTOMATIC_MAX_ATTEMPTS) {
      db.exec("ROLLBACK");
      return { ok: false, code: "attempts_exhausted", message: "Bu müşterinin otomatik gönderim denemeleri sınırına ulaştı." };
    }
    if (isFutureTimestamp(existingDelivery?.nextAttemptAt, now)) {
      db.exec("ROLLBACK");
      return { ok: false, code: "retry_wait", message: "Bu müşterinin sonraki denemesi için bekleme süresi devam ediyor." };
    }

    const customer = toBirthdayCustomer(row, customerId);
    const eligibility = evaluateBirthdayCustomer(customer, today, existingDelivery);
    if (eligibility.status === "excluded") {
      db.exec("ROLLBACK");
      return { ok: false, code: "excluded", message: "Müşteri doğum günü mesajlarından hariç tutulmuş." };
    }
    if (eligibility.status === "invalid_birth_date") {
      db.exec("ROLLBACK");
      return { ok: false, code: "invalid_birth_date", message: "Müşterinin doğum tarihi geçerli değil." };
    }
    if (eligibility.status === "not_birthday") {
      db.exec("ROLLBACK");
      return { ok: false, code: "not_birthday", message: "Müşterinin doğum günü bugün değil." };
    }
    if (eligibility.status === "invalid_phone") {
      db.exec("ROLLBACK");
      return { ok: false, code: "invalid_phone", message: "Geçerli bir Türkiye cep telefonu bulunamadı." };
    }

    const templateError = validateBirthdayMessageTemplate(settings.messageTemplate);
    if (templateError) {
      db.exec("ROLLBACK");
      return { ok: false, code: "not_due", message: templateError };
    }
    const birthdayDate = birthdayDateForYear(customer.birthDate, year) ?? today;
    const message = renderBirthdayMessage(settings.messageTemplate, customer, readBusinessName(db));
    const deliveryId = existingDelivery?.id ?? createId("birthday_delivery_");
    const attemptCount = (existingDelivery?.attemptCount ?? 0) + 1;
    const leaseUntil = new Date(now.getTime() + BIRTHDAY_AUTOMATIC_CLAIM_LEASE_MS).toISOString();
    let changes = 0;

    if (existingDelivery) {
      const result = db.prepare(`
        UPDATE birthday_message_deliveries
        SET birthday_date = ?, mode = ?, message = ?, attempt_count = ?,
            last_attempted_at = ?, next_attempt_at = ?, error = '', updated_at = ?
        WHERE id = ? AND status != 'sent'
          AND attempt_count < ?
          AND (next_attempt_at = '' OR next_attempt_at <= ?)
      `).run(
        birthdayDate,
        settings.mode,
        message,
        attemptCount,
        nowIso,
        leaseUntil,
        nowIso,
        deliveryId,
        BIRTHDAY_AUTOMATIC_MAX_ATTEMPTS,
        nowIso
      );
      changes = Number(result.changes);
    } else {
      const result = db.prepare(`
        INSERT INTO birthday_message_deliveries (
          id, customer_id, birthday_year, birthday_date, mode, message, status,
          attempt_count, last_attempted_at, next_attempt_at,
          prepared_at, sent_at, failed_at, error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, '', '', '', '', ?, ?)
      `).run(
        deliveryId,
        customerId,
        year,
        birthdayDate,
        settings.mode,
        message,
        attemptCount,
        nowIso,
        leaseUntil,
        nowIso,
        nowIso
      );
      changes = Number(result.changes);
    }

    if (changes !== 1) {
      db.exec("ROLLBACK");
      return { ok: false, code: "retry_wait", message: "Doğum günü gönderimi başka bir işlem tarafından alındı." };
    }
    db.exec("COMMIT");
    began = false;
    return {
      ok: true,
      candidate: {
        id: deliveryId,
        customerId,
        birthdayYear: year,
        birthdayDate,
        mode: settings.mode,
        customerName: customer.fullName,
        phone: customer.phone,
        normalizedPhone: eligibility.phone,
        birthDate: customer.birthDate,
        message,
        attemptCount
      }
    };
  } catch (error) {
    if (began) db.exec("ROLLBACK");
    return { ok: false, code: "retry_wait", message: error instanceof Error ? error.message : "Doğum günü gönderimi kilitlendi." };
  }
}

export function revalidateAutomaticBirthdayDelivery(
  db: DatabaseSync,
  customerIdInput: string,
  expectedMessage: string,
  expectedPhone: string,
  now = new Date()
): { ok: true } | { ok: false; code: "stale" | "excluded" | "already_sent" | "invalid"; message: string } {
  const customerId = customerIdInput.trim();
  const settings = readBirthdaySettings(db);
  const today = getLocalIsoDate(now);
  const year = Number(today.slice(0, 4));
  if (!settings.enabled || settings.mode !== "automatic") {
    return { ok: false, code: "stale", message: "Otomatik doğum günü ayarı gönderim öncesinde değişti." };
  }
  if (!isBirthdaySendTimeReached(settings.sendTime, now)) {
    return { ok: false, code: "stale", message: "Doğum günü gönderim saati gönderim öncesinde değişti." };
  }
  const row = db.prepare(`
    SELECT id, full_name, phone, birth_date, birthday_message_enabled
    FROM customers WHERE id = ? AND deleted_at = ''
  `).get(customerId) as Record<string, unknown> | undefined;
  if (!row) return { ok: false, code: "excluded", message: "Müşteri gönderim öncesinde silindi." };
  const customer = toBirthdayCustomer(row, customerId);
  const delivery = readDelivery(db, customerId, year);
  const eligibility = evaluateBirthdayCustomer(customer, today, delivery);
  if (eligibility.status === "excluded") return { ok: false, code: "excluded", message: "Müşteri gönderim öncesinde opt-out yaptı." };
  if (eligibility.status === "already_sent") return { ok: false, code: "already_sent", message: "Müşteri için bu yıl gönderim zaten tamamlandı." };
  if (eligibility.status === "invalid_birth_date" || eligibility.status === "not_birthday" || eligibility.status === "invalid_phone") {
    return { ok: false, code: "invalid", message: "Müşteri gönderim öncesinde birthday uygunluğunu kaybetti." };
  }
  if (validateBirthdayMessageTemplate(settings.messageTemplate)) {
    return { ok: false, code: "stale", message: "Doğum günü mesaj şablonu gönderim öncesinde geçersiz oldu." };
  }
  const message = renderBirthdayMessage(settings.messageTemplate, customer, readBusinessName(db));
  if (message !== expectedMessage || eligibility.phone !== expectedPhone) {
    return { ok: false, code: "stale", message: "Müşteri veya doğum günü mesajı gönderim öncesinde değişti." };
  }
  return { ok: true };
}

export function markBirthdayDeliveryPrepared(
  db: DatabaseSync,
  customerId: string,
  birthdayYear: number,
  message: string,
  now = new Date()
): DesktopBirthdayDelivery | null {
  db.prepare(`
    UPDATE birthday_message_deliveries
    SET status = 'prepared', message = ?, prepared_at = ?, failed_at = '', error = '', updated_at = ?
    WHERE customer_id = ? AND birthday_year = ? AND status != 'sent'
  `).run(message, now.toISOString(), now.toISOString(), customerId, birthdayYear);
  return readDelivery(db, customerId, birthdayYear) ?? null;
}

export function markBirthdayDeliverySent(
  db: DatabaseSync,
  customerId: string,
  birthdayYear: number,
  now = new Date()
): DesktopBirthdayDelivery | null {
  db.prepare(`
    UPDATE birthday_message_deliveries
    SET status = 'sent', sent_at = ?, failed_at = '', error = '', next_attempt_at = '', updated_at = ?
    WHERE customer_id = ? AND birthday_year = ? AND status != 'sent'
  `).run(now.toISOString(), now.toISOString(), customerId, birthdayYear);
  return readDelivery(db, customerId, birthdayYear) ?? null;
}

export function markBirthdayDeliveryFailed(
  db: DatabaseSync,
  customerId: string,
  birthdayYear: number,
  error: string,
  retryable: boolean,
  now = new Date()
): DesktopBirthdayDelivery | null {
  const delivery = readDelivery(db, customerId, birthdayYear);
  const attemptCount = delivery?.attemptCount ?? 0;
  const canRetry = retryable && attemptCount < BIRTHDAY_AUTOMATIC_MAX_ATTEMPTS;
  const storedAttemptCount = retryable ? attemptCount : BIRTHDAY_AUTOMATIC_MAX_ATTEMPTS;
  const nextAttemptAt = canRetry
    ? new Date(now.getTime() + BIRTHDAY_AUTOMATIC_RETRY_DELAY_MS * Math.max(1, attemptCount)).toISOString()
    : "";
  db.prepare(`
    UPDATE birthday_message_deliveries
    SET status = 'failed', attempt_count = ?, failed_at = ?, error = ?, next_attempt_at = ?, updated_at = ?
    WHERE customer_id = ? AND birthday_year = ? AND status != 'sent'
  `).run(storedAttemptCount, now.toISOString(), error.slice(0, 1000), nextAttemptAt, now.toISOString(), customerId, birthdayYear);
  return readDelivery(db, customerId, birthdayYear) ?? null;
}

export function markBirthdayDeliveryWaiting(
  db: DatabaseSync,
  customerId: string,
  birthdayYear: number,
  birthdayDate: string,
  mode: BirthdayMode,
  message: string,
  error: string,
  now = new Date()
): DesktopBirthdayDelivery | null {
  const nowIso = now.toISOString();
  const nextAttemptAt = new Date(now.getTime() + BIRTHDAY_AUTOMATIC_RETRY_DELAY_MS).toISOString();
  const existing = readDelivery(db, customerId, birthdayYear);
  if (existing?.status === "sent") return existing;
  const deliveryId = existing?.id ?? createId("birthday_delivery_");
  db.prepare(`
    INSERT INTO birthday_message_deliveries (
      id, customer_id, birthday_year, birthday_date, mode, message, status,
      attempt_count, last_attempted_at, next_attempt_at,
      prepared_at, sent_at, failed_at, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, '', ?, ?, '', '', ?, ?, ?)
    ON CONFLICT(customer_id, birthday_year) DO UPDATE SET
      birthday_date = excluded.birthday_date,
      mode = excluded.mode,
      message = excluded.message,
      status = CASE WHEN birthday_message_deliveries.status = 'prepared' THEN 'prepared' ELSE 'pending' END,
      attempt_count = 0,
      next_attempt_at = excluded.next_attempt_at,
      failed_at = '',
      error = excluded.error,
      updated_at = excluded.updated_at
  `).run(
    deliveryId,
    customerId,
    birthdayYear,
    birthdayDate,
    mode,
    message,
    existing?.status === "prepared" ? "prepared" : "pending",
    nextAttemptAt,
    existing?.preparedAt ?? "",
    error.slice(0, 1000),
    existing?.createdAt ?? nowIso,
    nowIso
  );
  return readDelivery(db, customerId, birthdayYear) ?? null;
}

export function markBirthdayDeliverySkipped(
  db: DatabaseSync,
  customerId: string,
  birthdayYear: number,
  error: string,
  now = new Date()
): DesktopBirthdayDelivery | null {
  db.prepare(`
    UPDATE birthday_message_deliveries
    SET status = 'skipped', error = ?, next_attempt_at = '', failed_at = '', updated_at = ?
    WHERE customer_id = ? AND birthday_year = ? AND status != 'sent'
  `).run(error.slice(0, 1000), now.toISOString(), customerId, birthdayYear);
  return readDelivery(db, customerId, birthdayYear) ?? null;
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

interface BirthdayDeliveryLikeWithId extends Omit<BirthdayDeliveryLike, "attemptCount" | "lastAttemptedAt" | "nextAttemptAt"> {
  id: string;
  birthdayDate: string;
  mode: BirthdayMode;
  message: string;
  attemptCount: number;
  lastAttemptedAt: string;
  nextAttemptAt: string;
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
    attemptCount: Math.max(0, Number(row.attempt_count ?? 0)),
    lastAttemptedAt: String(row.last_attempted_at ?? ""),
    nextAttemptAt: String(row.next_attempt_at ?? ""),
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
  return value === "due" || value === "prepared" || value === "already_sent" || value === "invalid_phone" || value === "waiting" || value === "failed";
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
    invalidPhoneCount: 0,
    waitingCount: 0,
    failedCount: 0
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
    invalidPhoneCount: candidates.filter((candidate) => candidate.eligibility === "invalid_phone").length,
    waitingCount: candidates.filter((candidate) => candidate.eligibility === "waiting").length,
    failedCount: candidates.filter((candidate) => candidate.eligibility === "failed").length
  };
}

function getVisibleEligibility(
  status: BirthdayEligibilityStatus,
  delivery: BirthdayDeliveryLikeWithId | undefined,
  now: Date
): VisibleBirthdayEligibility | null {
  if (status === "excluded" || status === "invalid_birth_date" || status === "not_birthday") return null;
  if (delivery?.status === "failed" && delivery.attemptCount >= BIRTHDAY_AUTOMATIC_MAX_ATTEMPTS) return "failed";
  if (delivery && (delivery.status === "pending" || delivery.status === "prepared") && delivery.error && isFutureTimestamp(delivery.nextAttemptAt, now)) {
    return "waiting";
  }
  if (delivery?.status === "failed" && isFutureTimestamp(delivery.nextAttemptAt, now)) return "failed";
  return isVisibleEligibility(status) ? status : null;
}

function isFutureTimestamp(value: string | undefined, now: Date): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

function toBirthdayCustomer(row: Record<string, unknown>, customerId: string) {
  return {
    id: customerId,
    fullName: String(row.full_name ?? ""),
    phone: String(row.phone ?? ""),
    birthDate: String(row.birth_date ?? ""),
    birthdayMessageEnabled: normalizeBoolean(row.birthday_message_enabled, true)
  };
}
