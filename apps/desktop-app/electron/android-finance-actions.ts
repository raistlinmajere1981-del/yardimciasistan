import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";

export interface AndroidFinanceMutationResult {
  ok: boolean;
  message: string;
}

export interface ApplyAndroidFinanceActionOptions {
  db: DatabaseSync;
  action: AndroidSyncAction;
  now: string;
  insertEvent: (type: string, entityId: string, payload: Record<string, unknown>) => void;
}

const PAYMENT_METHODS = new Set(["cash", "card", "bank", "other", "unspecified"]);
const INCOME_CATEGORIES = new Set(["restaurant", "pension", "other_income"]);
const EXPENSE_CATEGORIES = new Set(["stock", "utilities", "staff", "maintenance", "transport", "official", "other_expense"]);

export function applyAndroidFinanceAction(options: ApplyAndroidFinanceActionOptions): AndroidFinanceMutationResult {
  const { db, action, now, insertEvent } = options;
  if (action.action_type !== "finance_manual_create") {
    return { ok: false, message: "Telefon Kasa işlem türü desteklenmiyor." };
  }

  const payload = action.payload && typeof action.payload === "object" && !Array.isArray(action.payload)
    ? action.payload
    : {};
  const direction = text(payload.direction);
  if (direction !== "income" && direction !== "expense") {
    return { ok: false, message: "Kasa hareketi gelir veya gider olarak seçilmeli." };
  }

  const amountMinor = positiveInteger(payload.amount_minor);
  if (amountMinor === null) {
    return { ok: false, message: "Gelir veya gider için geçerli bir tutar girin." };
  }

  const paymentMethodInput = text(payload.payment_method);
  const paymentMethod = PAYMENT_METHODS.has(paymentMethodInput) ? paymentMethodInput : "cash";
  const categoryInput = text(payload.category);
  const allowedCategories = direction === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const defaultCategory = direction === "income" ? "other_income" : "other_expense";
  const category = allowedCategories.has(categoryInput) ? categoryInput : defaultCategory;
  const description = cleanText(payload.description, 160)
    || (direction === "income" ? "Mobil gelir" : "Mobil gider");
  const note = cleanText(payload.note, 500);
  const occurredAt = timestamp(payload.occurred_at) || now;
  const entryId = `finance_android_${safeId(action.id)}`;

  try {
    db.prepare(`
      INSERT INTO finance_entries (
        id, direction, amount_minor, currency, payment_method, category, description,
        occurred_at, source_type, source_id, note, created_at, updated_at, deleted_at, sync_status
      ) VALUES (?, ?, ?, 'TRY', ?, ?, ?, ?, 'manual', ?, ?, ?, ?, '', 'local_only')
    `).run(
      entryId,
      direction,
      amountMinor,
      paymentMethod,
      category,
      description,
      occurredAt,
      `android:${text(action.device_id)}`,
      note,
      now,
      now
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.toLocaleLowerCase("tr-TR") : "";
    if (message.includes("unique") || message.includes("primary key")) {
      return { ok: true, message: "Kasa hareketi daha önce kaydedilmiş." };
    }
    return { ok: false, message: "Telefon Kasa hareketi kaydedilemedi." };
  }

  insertEvent("finance.manual_created", entryId, {
    direction,
    amount_minor: amountMinor,
    payment_method: paymentMethod,
    category,
    description
  });
  return {
    ok: true,
    message: direction === "income" ? "Gelir telefondan kasaya eklendi." : "Gider telefondan kasaya eklendi."
  };
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanText(value: unknown, limit: number): string {
  return text(value).replace(/\s+/g, " ").slice(0, limit);
}

function positiveInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function timestamp(value: unknown): string {
  const candidate = text(value);
  if (!candidate) return "";
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function safeId(value: unknown): string {
  const normalized = text(value).replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 180);
  return normalized || `unknown_${Date.now()}`;
}
