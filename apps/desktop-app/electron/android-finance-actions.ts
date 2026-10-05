import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { saveManualFinanceEntryInTransaction, type SaveManualFinanceEntryInput } from "./finance.js";

export interface AndroidFinanceMutationResult { ok: boolean; message: string }
export interface ApplyAndroidFinanceActionOptions {
  db: DatabaseSync; action: AndroidSyncAction; now: string;
  insertEvent: (type: string, entityId: string, payload: Record<string, unknown>) => void;
}

const PAYMENT_METHODS = new Set(["cash", "card", "bank", "other", "unspecified"]);

export function applyAndroidFinanceAction({ db, action, now, insertEvent }: ApplyAndroidFinanceActionOptions): AndroidFinanceMutationResult {
  if (action.action_type !== "finance_manual_create") return { ok: false, message: "Telefon Kasa işlem türü desteklenmiyor." };
  const payload = action.payload;
  const direction = String(payload.direction ?? "").trim();
  if (direction !== "income" && direction !== "expense") return { ok: false, message: "Kasa hareketi gelir veya gider olarak seçilmeli." };
  const methodInput = String(payload.payment_method ?? "").trim();
  const paymentMethod = PAYMENT_METHODS.has(methodInput) ? methodInput : "cash";
  const category = String(payload.category ?? "").trim() || (direction === "income" ? "other_income" : "other_expense");
  const description = String(payload.description ?? "").trim().replace(/\s+/g, " ").slice(0, 160) || (direction === "income" ? "Mobil gelir" : "Mobil gider");
  const id = `finance_android_${String(action.id).trim().replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 180)}`;
  const result = saveManualFinanceEntryInTransaction(db, {
    direction, amountMinor: Number(payload.amount_minor), paymentMethod: paymentMethod as SaveManualFinanceEntryInput["paymentMethod"],
    category, description, note: String(payload.note ?? "").trim().replace(/\s+/g, " "), occurredAt: String(payload.occurred_at ?? "")
  }, { id, sourceId: `android:${action.device_id}/${id.slice("finance_android_".length)}`, now });
  if (!result.ok) return result;
  insertEvent("finance.manual_created", result.savedId, { direction, amount_minor: Number(payload.amount_minor), payment_method: paymentMethod, category, description });
  return { ok: true, message: direction === "income" ? "Gelir telefondan kasaya eklendi." : "Gider telefondan kasaya eklendi." };
}
